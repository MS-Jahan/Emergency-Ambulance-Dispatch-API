import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { changeMyPassword, getMe, updateMe } from '../auth/auth.controller'
import { changePasswordSchema, updateProfileSchema } from '../auth/auth.validation'

export const usersRouter = Router()

usersRouter.use(authenticate)

usersRouter.get('/me', getMe)
usersRouter.patch('/me', validate({ body: updateProfileSchema }), updateMe)
usersRouter.patch('/me/password', validate({ body: changePasswordSchema }), changeMyPassword)
