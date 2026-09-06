import rateLimit from 'express-rate-limit'
import type { ErrorEnvelope } from '../shared/types'

const rateLimitBody: ErrorEnvelope = {
  success: false,
  message: 'Too many requests, please try again later',
  errors: [],
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitBody,
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitBody,
})
