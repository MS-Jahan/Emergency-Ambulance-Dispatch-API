import type { RequestHandler } from 'express'
import { type ZodType, z } from 'zod'
import { AppError } from '../shared/AppError'

interface ValidateSchemas {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validatedQuery?: Record<string, unknown>
    }
  }
}

export const validate =
  (schemas: ValidateSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as typeof req.body
      }
      // express 5 exposes params and query as getter only properties that rebuild on
      // every access, so parsed query values go on a plain custom property instead
      if (schemas.query) {
        req.validatedQuery = schemas.query.parse(req.query) as Record<string, unknown>
      }
      if (schemas.params) {
        Object.assign(req.params, schemas.params.parse(req.params))
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
