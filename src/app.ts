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
import { hospitalsRouter } from './modules/hospitals/hospital.routes'
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

  // Stripe webhook gets mounted above this line in payments.routes so it can read the raw body
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

  app.use(notFoundHandler)
  app.use(globalErrorHandler)

  return app
}
