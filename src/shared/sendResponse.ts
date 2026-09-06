import type { Response } from 'express'
import type { SuccessEnvelope } from './types'

interface SendOptions<T> {
  statusCode?: number
  message: string
  data: T
}

export function sendResponse<T>(res: Response, options: SendOptions<T>): void {
  const { statusCode = 200, message, data } = options
  const body: SuccessEnvelope<T> = { success: true, message, data }
  res.status(statusCode).json(body)
}
