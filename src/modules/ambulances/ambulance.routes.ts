import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { create, getOne, list, nearby, remove, update } from './ambulance.controller'
import {
  createAmbulanceSchema,
  listAmbulancesQuerySchema,
  nearbyQuerySchema,
  updateAmbulanceSchema,
} from './ambulance.validation'

export const ambulancesRouter = Router()

ambulancesRouter.use(authenticate)

ambulancesRouter.get('/', validate({ query: listAmbulancesQuerySchema }), list)
ambulancesRouter.get('/nearby', validate({ query: nearbyQuerySchema }), nearby)
ambulancesRouter.get('/:id', getOne)
ambulancesRouter.post('/', requireRole('ADMIN'), validate({ body: createAmbulanceSchema }), create)
ambulancesRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({ body: updateAmbulanceSchema }),
  update,
)
ambulancesRouter.delete('/:id', requireRole('ADMIN'), remove)
