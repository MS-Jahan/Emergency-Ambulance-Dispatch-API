import type { ApiErrorItem } from './types'

export class AppError extends Error {
  readonly statusCode: number
  readonly errors: ApiErrorItem[]

  constructor(statusCode: number, message: string, errors: ApiErrorItem[] = []) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.errors = errors
  }

  static badRequest(message: string, errors: ApiErrorItem[] = []): AppError {
    return new AppError(400, message, errors)
  }

  static unauthorized(message = 'You are not authenticated'): AppError {
    return new AppError(401, message)
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppError {
    return new AppError(403, message)
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, message)
  }

  static conflict(message: string): AppError {
    return new AppError(409, message)
  }
}
