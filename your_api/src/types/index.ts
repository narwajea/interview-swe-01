import { type Job } from 'bullmq'
import { type TransactionState } from '../schemas/transaction-state'

export interface ITransactionService {
  createTransaction: (id: string) => Promise<void>
  sendTransactionStatusUpdate: (
    id: string,
    status: TransactionState.completed | TransactionState.declined
  ) => Promise<void>
}

export interface ITransactionProcessor {
  processTransaction: (job: Job) => Promise<any>
}
