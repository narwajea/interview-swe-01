import { singleton } from 'tsyringe'
import { type Request, type Response } from 'express'
import { TransactionService } from '../services/transaction.service'
import { createTransactionSchema, webhookSchema } from '../schemas/transaction.schema'
import { ZodError } from 'zod'
import logger from '../utils/logger'
import { TransactionProcessor } from '../processors/transaction.processor'

const component = 'TransactionController'

@singleton()
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionProcessor: TransactionProcessor
  ) {}

  async createTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = createTransactionSchema.parse(req.body)
      logger.info('Received create transaction request', { id, component })

      await this.transactionService.createTransaction(id)
      logger.info('Transaction creation processed', { id, component })
      res.json({ id, status: 'pending' })
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation error', { component, errors: error.errors })
        res.status(400).json({ error: 'Invalid input', details: error.errors })
        return
      }
      logger.error('Error creating transaction', { component, error })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { id, status } = webhookSchema.parse(req.body)
      logger.info('Received webhook', { id, component, status })
      await this.transactionProcessor.sendTransactionStatusUpdate(id, status)
      logger.info('Webhook processed', { id, component, status })
      res.sendStatus(200)
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation error', { component, errors: error.errors })
        res.status(400).json({ error: 'Invalid input', details: error.errors })
        return
      }
      logger.error('Error processing webhook', { component, error })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
