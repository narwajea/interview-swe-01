import { z } from 'zod'
import { TransactionState } from './transaction-state'

export const createTransactionSchema = z.object({
  id: z.string().uuid()
})

export const webhookSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([TransactionState.completed, TransactionState.declined])
})

export type CreateTransactionDto = z.infer<typeof createTransactionSchema>
export type WebhookDto = z.infer<typeof webhookSchema>
