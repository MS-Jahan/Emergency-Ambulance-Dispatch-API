import { z } from 'zod'
import { paginationQuerySchema } from '../../shared/paginate'
import { MAX_REPORT_DAYS, resolveRange } from './admin.reports'

export const createDriverSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(200),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  phone: z.string().min(6).max(20),
  licenseNumber: z.string().min(4).max(40),
})

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['PATIENT', 'DRIVER', 'ADMIN']).optional(),
  q: z.string().max(120).optional(),
})

export const updateUserRoleSchema = z.object({
  role: z.enum(['PATIENT', 'DRIVER', 'ADMIN']),
})

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  requestId: z.string().cuid().optional(),
})

export const reportSummaryQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .superRefine((q, ctx) => {
    const { start, end, days } = resolveRange(q.from, q.to)
    if (end < start) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: '"to" must not be before "from"' })
    } else if (days > MAX_REPORT_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: `Date range cannot exceed ${MAX_REPORT_DAYS} days`,
      })
    }
  })

export const listFeedbackQuerySchema = paginationQuerySchema

export const testEmailSchema = z.object({
  to: z.string().email('Invalid email address'),
})

export const testSmsSchema = z.object({
  to: z.string().min(1, 'Phone number is required'),
})

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>
export type CreateDriverInput = z.infer<typeof createDriverSchema>
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>
export type TestEmailInput = z.infer<typeof testEmailSchema>
export type TestSmsInput = z.infer<typeof testSmsSchema>
