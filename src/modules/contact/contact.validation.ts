import { z } from 'zod'
import { paginationQuerySchema } from '../../shared/paginate'

const stripControl = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()

export const createContactMessageSchema = z.object({
  name: z
    .string()
    .transform(stripControl)
    .pipe(
      z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(80, 'Name must be 80 characters or less'),
    ),
  email: z.string().trim().email('Invalid email address'),
  phone: z
    .string()
    .transform(stripControl)
    .pipe(
      z
        .string()
        .min(7, 'Phone must be at least 7 characters')
        .max(20, 'Phone must be 20 characters or less'),
    )
    .optional()
    .or(z.literal('')),
  category: z.enum(['GENERAL', 'BILLING', 'DRIVER', 'HOSPITAL', 'FEEDBACK']).default('GENERAL'),
  message: z
    .string()
    .transform(stripControl)
    .pipe(
      z
        .string()
        .min(10, 'Message must be at least 10 characters')
        .max(2000, 'Message must be 2000 characters or less'),
    ),
  website: z.string().optional(),
})

export const listContactMessagesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['NEW', 'READ', 'RESOLVED']).optional(),
  q: z.string().max(250).optional(),
})

export const updateContactMessageStatusSchema = z.object({
  status: z.enum(['NEW', 'READ', 'RESOLVED']),
})

export type CreateContactMessageInput = z.infer<typeof createContactMessageSchema>
export type ListContactMessagesQuery = z.infer<typeof listContactMessagesQuerySchema>
export type UpdateContactMessageStatusInput = z.infer<typeof updateContactMessageStatusSchema>
