import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { authLimiter } from '../../middleware/rateLimiter'
import { validate } from '../../middleware/validate'
import { getContactMessages, patchContactMessageStatus } from '../contact/contact.controller'
import {
  listContactMessagesQuerySchema,
  updateContactMessageStatusSchema,
} from '../contact/contact.validation'
import {
  getAuditLogs,
  getFeedback,
  getReport,
  getStats,
  getUsers,
  patchUserRole,
  postDriver,
  postTestEmail,
  postTestSms,
} from './admin.controller'
import { idParamSchema } from './admin.params'
import {
  createDriverSchema,
  listAuditLogsQuerySchema,
  listFeedbackQuerySchema,
  listUsersQuerySchema,
  reportSummaryQuerySchema,
  testEmailSchema,
  testSmsSchema,
  updateUserRoleSchema,
} from './admin.validation'

export const adminRouter = Router()

adminRouter.use(authenticate, requireRole('ADMIN'))

adminRouter.post('/drivers', validate({ body: createDriverSchema }), postDriver)
adminRouter.get('/users', validate({ query: listUsersQuerySchema }), getUsers)
adminRouter.patch(
  '/users/:id/role',
  validate({ params: idParamSchema, body: updateUserRoleSchema }),
  patchUserRole,
)
adminRouter.get('/dashboard-stats', getStats)
adminRouter.get('/audit-logs', validate({ query: listAuditLogsQuerySchema }), getAuditLogs)
adminRouter.get('/reports/summary', validate({ query: reportSummaryQuerySchema }), getReport)
adminRouter.get('/feedback', validate({ query: listFeedbackQuerySchema }), getFeedback)
adminRouter.get(
  '/contact-messages',
  validate({ query: listContactMessagesQuerySchema }),
  getContactMessages,
)
adminRouter.patch(
  '/contact-messages/:id',
  validate({ params: idParamSchema, body: updateContactMessageStatusSchema }),
  patchContactMessageStatus,
)
adminRouter.post(
  '/integrations/test-email',
  authLimiter,
  validate({ body: testEmailSchema }),
  postTestEmail,
)
adminRouter.post(
  '/integrations/test-sms',
  authLimiter,
  validate({ body: testSmsSchema }),
  postTestSms,
)
