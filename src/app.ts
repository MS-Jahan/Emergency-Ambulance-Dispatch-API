import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import { env } from './config/env'
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler'
import { globalLimiter } from './middleware/rateLimiter'
import { adminRouter } from './modules/admin/admin.routes'
import { ambulancesRouter } from './modules/ambulances/ambulance.routes'
import { authRouter } from './modules/auth/auth.routes'
import { driverRouter } from './modules/drivers/driver.routes'
import { feedbackRouter } from './modules/feedback/feedback.routes'
import { hospitalsRouter } from './modules/hospitals/hospital.routes'
import {
  paymentCallbackRouter,
  paymentsRouter,
  paymentWebhookRouter,
} from './modules/payments/payment.routes'
import { requestsRouter } from './modules/requests/request.routes'
import { usersRouter } from './modules/users/users.routes'
import { healthRouter } from './routes/health.routes'

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  )
  app.use(globalLimiter)

  // Stripe posts here with a signature over the raw body, so this must sit above the json parser
  app.use('/api/v1/payments/webhook', paymentWebhookRouter)

  app.use(express.json({ limit: '1mb' }))

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Ambulance dispatch API is running', data: null })
  })

  app.use('/api/v1/health', healthRouter)
  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/users', usersRouter)
  app.use('/api/v1/hospitals', hospitalsRouter)
  app.use('/api/v1/ambulances', ambulancesRouter)
  app.use('/api/v1/requests', requestsRouter)
  app.use('/api/v1/driver', driverRouter)
  app.use('/api/v1/admin', adminRouter)
  // Callbacks are browser redirects from stripe with no bearer token, so they
  // must sit above the payments router whose authenticate middleware would
  // otherwise reject them
  app.use('/api/v1/payments/callback', paymentCallbackRouter)
  app.use('/api/v1/payments', paymentsRouter)
  app.use('/api/v1/feedback', feedbackRouter)

  app.use(notFoundHandler)
  app.use(globalErrorHandler)

  return app
}
