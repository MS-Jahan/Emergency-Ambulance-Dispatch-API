import type { RequestHandler } from 'express'
import { type ZodType, z } from 'zod'
import { AppError } from '../shared/AppError'

interface ValidateSchemas {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

export const validate =
  (schemas: ValidateSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as typeof req.body
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query
      }
      next()
    } catch (error) {
      next(error)
    }
  }

export function zodIssuesToAppError(error: z.ZodError): AppError {
  const errors = error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || undefined,
    message: issue.message,
  }))
  return AppError.badRequest('Validation failed', errors)
}
