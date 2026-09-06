import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { paginationQuerySchema } from '../../shared/paginate'
import {
  assign,
  cancel,
  create,
  getOne,
  list,
  myAssigned,
  updateStatus,
} from './request.controller'
import {
  assignRequestSchema,
  cancelRequestSchema,
  createRequestSchema,
  listRequestsQuerySchema,
  updateStatusSchema,
} from './request.validation'

export const requestsRouter = Router()

requestsRouter.use(authenticate)

requestsRouter.get(
  '/',
  requireRole('ADMIN', 'DRIVER', 'PATIENT'),
  validate({ query: listRequestsQuerySchema }),
  list,
)
requestsRouter.get(
  '/my-assigned',
  requireRole('DRIVER'),
  validate({ query: paginationQuerySchema }),
  myAssigned,
)
requestsRouter.get('/:id', getOne)
requestsRouter.post('/', requireRole('PATIENT'), validate({ body: createRequestSchema }), create)
requestsRouter.post(
  '/:id/assign',
  requireRole('ADMIN'),
  validate({ body: assignRequestSchema }),
  assign,
)
requestsRouter.patch('/:id/status', validate({ body: updateStatusSchema }), updateStatus)
requestsRouter.post('/:id/cancel', validate({ body: cancelRequestSchema }), cancel)
