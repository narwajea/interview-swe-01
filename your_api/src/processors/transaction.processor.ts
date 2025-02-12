import { singleton } from 'tsyringe'
import { type Job } from 'bullmq'
import axios, { type AxiosResponse } from 'axios'
import Redis from 'ioredis'
import { type ITransactionProcessor } from '../types'
import logger from '../utils/logger'
import { TransactionService } from '../services/transaction.service'
import { TransactionState } from '../schemas/transaction-state'

interface JobData {
  id: string
}

const LOCK_TTL = 600 // 10 min
const LOCK_PREFIX = 'transaction:lock:'
const TRANSACTION_STATE_TTL = 600 // 10 min
const TRANSACTION_STATE_PREFIX = 'transaction:state:'

const component = 'TransactionProcessor'
const thirdPartyUrl = process.env.THIRDPARTY_URL ?? 'http://localhost:3000'
const yourApiUrl = process.env.YOUR_API_URL ?? 'http://localhost:3200'

@singleton()
export class TransactionProcessor implements ITransactionProcessor {
  constructor(
    private readonly redis: Redis,
    private readonly transactionService: TransactionService
  ) {}

  async checkThirdParty(job: Job<JobData>) {
    const { id } = job.data
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    logger.info('Checking third party', {
      id,
      component,
      attemptsMade: job.attemptsMade,
      isLastAttempt
    })

    const state = await this.getTransactionState(id)
    if (this.isTransactionFullyProcessed(state)) {
      logger.info('Transaction already processed', { id, component, state })
      return
    }

    let transactionGetResponse: AxiosResponse<{ status: TransactionState }>
    try {
      transactionGetResponse = await axios.get(`${thirdPartyUrl}/transaction/${id}`, {
        timeout: 5000
      })
    } catch (error) {
      const isAxiosError = axios.isAxiosError(error)
      const isTimeout = this.isTimeout(isAxiosError, error)
      if (isTimeout) {
        logger.warn('Request timed out, will retry', { id, component })
        throw error
      }
      const transactionNotFound = isAxiosError && error.status === 404
      if (transactionNotFound) {
        await this.handleTransactionNotFound(id, isLastAttempt)
        return
      }
      logger.error('Check third party failed', { id, component, error })
      return
    }

    const transactionStatus = transactionGetResponse.data.status
    logger.info('Transaction found', { id, component, transactionStatus })
    const transactionAlreadyProcessed =
      transactionStatus &&
      [TransactionState.completed, TransactionState.declined].includes(transactionStatus)
    if (transactionAlreadyProcessed) {
      const state = transactionStatus as TransactionState.completed | TransactionState.declined
      logger.info('Transaction already processed', { id, component, state })
      await this.sendTransactionStatusUpdate(id, state)
    } else {
      await this.setTransactionState(id, TransactionState.sent)
      logger.info('Transaction is pending, will retry', { id, component })
      throw new Error('Transaction is pending')
    }
  }

  private async handleTransactionNotFound(id: string, isLastAttempt: boolean) {
    if (!isLastAttempt) {
      logger.info('Transaction not found, will retry', { id, component })
      throw new Error('Transaction not found')
    } else {
      logger.info('Transaction not found, attempting to create transaction again', {
        id,
        component
      })
      await this.removeTransactionState(id)
      await this.transactionService.createTransaction(id)
    }
  }

  async sendTransactionStatusUpdate(
    id: string,
    state: TransactionState.completed | TransactionState.declined
  ) {
    const currentState = await this.getTransactionState(id)
    if (this.isTransactionFullyProcessed(currentState)) {
      logger.info('Transaction already processed', { id, component, currentState, state })
      return
    }
    await this.setTransactionState(id, state)
    await this.transactionService.sendTransactionStatusUpdate(id, state)
  }

  async processTransaction(job: Job<JobData>) {
    const { id } = job.data
    logger.info('Processing transaction', { id, component })

    // Try to acquire lock first
    const locked = await this.lockTransaction(id)
    if (!locked) {
      logger.info('Transaction is already locked', { id, component })
      return
    }

    try {
      // Check if transaction was already processed
      const state = await this.getTransactionState(id)
      if (this.isTransactionFullyProcessed(state)) {
        logger.info('Transaction already processed', { id, component, state })
        return
      }

      // Check if transaction was already sent to third party (in case of duplicate request)
      if (state === TransactionState.sent) {
        logger.info('Transaction already sent, checking transaction at third party', {
          id,
          component,
          state
        })
        await this.transactionService.checkThirdParty(id, 0, 4, 30000)
        return
      }

      // Check if previous request to third party timed out
      if (state === TransactionState.maybe_sent) {
        logger.info('Transaction may have been sent, checking transaction at third party', {
          id,
          component,
          state
        })
        await this.transactionService.checkThirdParty(id, 10000, 8, 30000)
        return
      }

      const response = await axios.post(
        `${thirdPartyUrl}/transaction`,
        {
          id,
          webhookUrl: `${yourApiUrl}/webhook`
        },
        {
          timeout: 15000 // 15 second timeout
        }
      )
      await this.setTransactionState(id, TransactionState.sent)
      logger.info('Transaction sent to third party successfully', {
        id,
        component,
        data: response.data
      })

      // The webhook might not be called, so we need to check anyway (delay comprised between 10 and 30s)
      await this.transactionService.checkThirdParty(id, 10000, 4, 30000)
    } catch (error) {
      const isAxiosError = axios.isAxiosError(error)
      const isTimeout = this.isTimeout(isAxiosError, error)
      if (isTimeout) {
        logger.warn('Request timed out, will retry', { id, component })
        await this.setTransactionState(id, TransactionState.maybe_sent)
        throw error
      }
      logger.error('Transaction failed', { id, component, error })
    } finally {
      // Always release the lock
      await this.unlockTransaction(id)
    }
  }

  private isTimeout(isAxiosError: boolean, error: any) {
    return isAxiosError && (error.code === 'ECONNABORTED' || error.status === 504)
  }

  private isTransactionFullyProcessed(state: TransactionState | null) {
    return state && [TransactionState.completed, TransactionState.declined].includes(state)
  }

  private async getTransactionState(id: string) {
    const stateKey = this.transactionStateKey(id)
    const state = await this.redis.get(stateKey)
    return state ? (state as TransactionState) : null
  }

  private async setTransactionState(id: string, state: TransactionState) {
    const stateKey = this.transactionStateKey(id)
    await this.redis.set(stateKey, state, 'EX', TRANSACTION_STATE_TTL)
  }

  private async removeTransactionState(id: string) {
    const stateKey = this.transactionStateKey(id)
    await this.redis.del(stateKey)
  }

  private async lockTransaction(id: string): Promise<boolean> {
    const lockKey = this.transactionLockKey(id)
    const result = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL, 'NX')
    return result === 'OK'
  }

  private async unlockTransaction(id: string): Promise<void> {
    const lockKey = this.transactionLockKey(id)
    await this.redis.del(lockKey)
  }

  private transactionLockKey(id: string) {
    return `${LOCK_PREFIX}${id}`
  }

  private transactionStateKey(id: string) {
    return `${TRANSACTION_STATE_PREFIX}${id}`
  }
}
