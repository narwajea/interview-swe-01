import { container } from 'tsyringe'
import { Queue } from 'bullmq'
import Redis from 'ioredis'

export const CHECK_THIRDPARTY_QUEUE_NAME = 'check-thirdparty'
export const PROCESS_TRANSACTIONS_QUEUE_NAME = 'process-transactions'

const host = process.env.REDIS_HOST ?? 'localhost'
const port = parseInt(process.env.REDIS_PORT ?? '6379')

export async function setupContainer() {
  // Setup Redis client
  const redis = new Redis({
    host,
    maxRetriesPerRequest: null,
    port
  })

  // Setup Queues
  const checkThirdpartyQueue = new Queue(CHECK_THIRDPARTY_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true
    }
  })
  const processTransactionsQueue = new Queue(PROCESS_TRANSACTIONS_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true
    }
  })

  // Register instances
  container.registerInstance(Redis, redis)
  container.registerInstance(CHECK_THIRDPARTY_QUEUE_NAME, checkThirdpartyQueue)
  container.registerInstance(PROCESS_TRANSACTIONS_QUEUE_NAME, processTransactionsQueue)
}
