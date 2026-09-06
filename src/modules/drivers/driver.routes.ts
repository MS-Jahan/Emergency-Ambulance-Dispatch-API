import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { getMe, updateLocation, updateStatus } from './driver.controller'
import { updateDriverLocationSchema, updateDriverStatusSchema } from './driver.validation'

export const driverRouter = Router()

driverRouter.use(authenticate, requireRole('DRIVER'))

driverRouter.get('/me', getMe)
driverRouter.patch('/status', validate({ body: updateDriverStatusSchema }), updateStatus)
driverRouter.patch('/location', validate({ body: updateDriverLocationSchema }), updateLocation)
