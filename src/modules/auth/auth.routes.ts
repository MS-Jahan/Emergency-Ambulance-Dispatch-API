import { Router } from 'express'
import { authLimiter } from '../../middleware/rateLimiter'
import { validate } from '../../middleware/validate'
import {
  forgotPassword,
  googleAuth,
  login,
  logout,
  refreshToken,
  register,
  resetPassword,
} from './auth.controller'
import {
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.validation'

export const authRouter = Router()

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), register)
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), login)
authRouter.post('/google', authLimiter, validate({ body: googleLoginSchema }), googleAuth)
authRouter.post('/refresh-token', validate({ body: refreshTokenSchema }), refreshToken)
authRouter.post('/logout', logout)
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
)
authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword,
)
