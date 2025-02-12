import 'reflect-metadata'
import express from 'express'
import { Worker } from 'bullmq'
import { container } from 'tsyringe'
import {
  CHECK_THIRDPARTY_QUEUE_NAME,
  PROCESS_TRANSACTIONS_QUEUE_NAME,
  setupContainer
} from './container'
import { TransactionController } from './controllers/transaction.controller'
import { TransactionProcessor } from './processors/transaction.processor'
import Redis from 'ioredis'
import logger from './utils/logger'

const port = process.env.PORT ?? 3200

async function bootstrap() {
  const app = express()
  app.use(express.json())

  // Setup dependency injection
  await setupContainer()
  const redis = container.resolve(Redis)

  // Setup workers
  const transactionProcessor = container.resolve(TransactionProcessor)
  const transactionsWorker = new Worker(
    PROCESS_TRANSACTIONS_QUEUE_NAME,
    transactionProcessor.processTransaction.bind(transactionProcessor),
    {
      connection: redis
    }
  )
  void transactionsWorker // Show intent to ignore
  const thirdPartyWorker = new Worker(
    CHECK_THIRDPARTY_QUEUE_NAME,
    transactionProcessor.checkThirdParty.bind(transactionProcessor),
    {
      connection: redis
    }
  )
  void thirdPartyWorker // Show intent to ignore

  // Routes
  const transactionController = container.resolve(TransactionController)
  app.post('/transaction', transactionController.createTransaction.bind(transactionController))
  app.post('/webhook', transactionController.handleWebhook.bind(transactionController))

  app.listen(port, () => {
    logger.info(`API is running on port ${port}`)
  })
}

bootstrap().catch(logger.error)
