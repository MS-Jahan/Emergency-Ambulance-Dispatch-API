import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { create, getOne, list, remove, update } from './hospital.controller'
import {
  createHospitalSchema,
  listHospitalsQuerySchema,
  updateHospitalSchema,
} from './hospital.validation'

export const hospitalsRouter = Router()

hospitalsRouter.use(authenticate)

hospitalsRouter.get('/', validate({ query: listHospitalsQuerySchema }), list)
hospitalsRouter.get('/:id', getOne)
hospitalsRouter.post('/', requireRole('ADMIN'), validate({ body: createHospitalSchema }), create)
hospitalsRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({ body: updateHospitalSchema }),
  update,
)
hospitalsRouter.delete('/:id', requireRole('ADMIN'), remove)
