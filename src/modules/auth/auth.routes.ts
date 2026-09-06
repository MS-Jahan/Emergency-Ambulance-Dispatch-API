import { Router } from 'express'
import { authLimiter } from '../../middleware/rateLimiter'
import { validate } from '../../middleware/validate'
import { googleAuth, login, logout, refreshToken, register } from './auth.controller'
import {
  googleLoginSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.validation'

export const authRouter = Router()

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), register)
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), login)
authRouter.post('/google', authLimiter, validate({ body: googleLoginSchema }), googleAuth)
authRouter.post('/refresh-token', validate({ body: refreshTokenSchema }), refreshToken)
authRouter.post('/logout', logout)
