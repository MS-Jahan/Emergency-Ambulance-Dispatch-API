import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import {
  getAuditLogs,
  getFeedback,
  getReport,
  getStats,
  getUsers,
  patchUserRole,
  postDriver,
} from './admin.controller'
import { idParamSchema } from './admin.params'
import {
  createDriverSchema,
  listAuditLogsQuerySchema,
  listFeedbackQuerySchema,
  listUsersQuerySchema,
  reportSummaryQuerySchema,
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
