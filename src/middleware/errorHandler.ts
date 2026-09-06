import { Prisma } from '@prisma/client'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger'
import { AppError } from '../shared/AppError'
import type { ErrorEnvelope } from '../shared/types'
import { zodIssuesToAppError } from './validate'

const GENERIC_500_MESSAGE = 'Something went wrong'

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorEnvelope = {
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  }
  res.status(404).json(body)
}

export const globalErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let appError: AppError

  if (error instanceof AppError) {
    appError = error
  } else if (error instanceof ZodError) {
    appError = zodIssuesToAppError(error)
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = handlePrismaError(error)
  } else if (error instanceof SyntaxError && 'body' in error) {
    appError = AppError.badRequest('Malformed JSON in request body')
  } else {
    logger.error({ err: error }, 'Unhandled error')
    const message =
      process.env.NODE_ENV === 'production' ? GENERIC_500_MESSAGE : (error as Error).message
    appError = new AppError(500, message)
  }

  const body: ErrorEnvelope = {
    success: false,
    message: appError.message,
    errors: appError.errors,
  }
  res.status(appError.statusCode).json(body)
}

function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  if (error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'field'
    return AppError.conflict(`A record with this ${target} already exists`)
  }
  if (error.code === 'P2025') {
    return AppError.notFound('Record not found')
  }
  if (error.code === 'P2003') {
    return AppError.badRequest('Related record does not exist')
  }
  logger.error({ err: error }, 'Unhandled prisma error')
  return new AppError(500, GENERIC_500_MESSAGE)
}
