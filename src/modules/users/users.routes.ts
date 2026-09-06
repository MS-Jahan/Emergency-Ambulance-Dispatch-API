import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { getMe, updateMe } from '../auth/auth.controller'
import { updateProfileSchema } from '../auth/auth.validation'

export const usersRouter = Router()

usersRouter.use(authenticate)

usersRouter.get('/me', getMe)
usersRouter.patch('/me', validate({ body: updateProfileSchema }), updateMe)
