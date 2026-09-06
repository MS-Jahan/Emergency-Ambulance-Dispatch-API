import 'dotenv/config'
import { createApp } from './app'
import { env } from './config/env'
import { logger } from './lib/logger'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on port ${env.PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5000).unref()
  })
}
