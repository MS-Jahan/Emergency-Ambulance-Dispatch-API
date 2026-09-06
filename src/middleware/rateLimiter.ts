import rateLimit from 'express-rate-limit'
import type { ErrorEnvelope } from '../shared/types'

const rateLimitBody: ErrorEnvelope = {
  success: false,
  message: 'Too many requests, please try again later',
  errors: [],
}

// The integration suite hits the api hundreds of times from one ip
const skipInTests = () => process.env.NODE_ENV === 'test'

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: rateLimitBody,
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: rateLimitBody,
})
