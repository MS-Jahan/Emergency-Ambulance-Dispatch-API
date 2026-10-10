import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import {
  getMe,
  getStats,
  updateAmbulanceStatus,
  updateLocation,
  updateStatus,
} from './driver.controller'
import {
  updateAmbulanceStatusSchema,
  updateDriverLocationSchema,
  updateDriverStatusSchema,
} from './driver.validation'

export const driverRouter = Router()

driverRouter.use(authenticate, requireRole('DRIVER'))

driverRouter.get('/me', getMe)
driverRouter.get('/me/stats', getStats)
driverRouter.patch('/status', validate({ body: updateDriverStatusSchema }), updateStatus)
driverRouter.patch('/location', validate({ body: updateDriverLocationSchema }), updateLocation)
driverRouter.patch(
  '/ambulance/status',
  validate({ body: updateAmbulanceStatusSchema }),
  updateAmbulanceStatus,
)
