import { inject, singleton } from 'tsyringe'
import { Queue } from 'bullmq'
import axios from 'axios'
import { type ITransactionService } from '../types'
import logger from '../utils/logger'
import { CHECK_THIRDPARTY_QUEUE_NAME, PROCESS_TRANSACTIONS_QUEUE_NAME } from '../container'
import { TransactionState } from '../schemas/transaction-state'

const component = 'TransactionService'
const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3100'

@singleton()
export class TransactionService implements ITransactionService {
  constructor(
    @inject(CHECK_THIRDPARTY_QUEUE_NAME) private readonly checkThirdpartyQueue: Queue,
    @inject(PROCESS_TRANSACTIONS_QUEUE_NAME) private readonly processTransactionsQueue: Queue
  ) {}

  async createTransaction(id: string) {
    logger.info('Creating transaction', { id, component })
    await this.processTransactionsQueue.add(
      'process-transaction',
      { id },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    )

    logger.info('Transaction queued', { id, component })
  }

  async checkThirdParty(id: string, initialDelay: number, attempts: number, retryInterval: number) {
    logger.info('Checking third party', { id, component })
    await this.checkThirdpartyQueue.add(
      'check-thirdparty',
      { id },
      {
        attempts,
        delay: initialDelay,
        backoff: {
          type: 'fixed',
          delay: retryInterval
        }
      }
    )
    logger.info('Check queued', { id, component })
  }

  async sendTransactionStatusUpdate(
    id: string,
    status: TransactionState.completed | TransactionState.declined
  ) {
    logger.info('Sending transaction status update', { id, component, status })
    try {
      await axios.put(`${clientUrl}/transaction`, {
        status: {
          id,
          status: status === TransactionState.completed ? 'accepted' : 'declined'
        }
      })
      logger.info('Transaction status update sent', { id, component, status })
    } catch (error) {
      logger.error('Error sending transaction status update', { id, component, error })
    }
  }
}
