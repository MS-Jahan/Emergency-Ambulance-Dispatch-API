import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import { env } from './config/env'
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler'
import { globalLimiter } from './middleware/rateLimiter'
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

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Ambulance dispatch API is running', data: null })
  })

  app.use('/api/v1/health', healthRouter)

  app.use(notFoundHandler)
  app.use(globalErrorHandler)

  return app
}
