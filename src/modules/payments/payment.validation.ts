import { z } from 'zod'
import { paginationQuerySchema } from '../../shared/paginate'

export const initiatePaymentSchema = z.object({
  requestId: z.string().cuid(),
})

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
})

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>
