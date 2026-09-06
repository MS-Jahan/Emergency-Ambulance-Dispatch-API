import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: true }))

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Ambulance dispatch API is running', data: null })
  })

  return app
}
