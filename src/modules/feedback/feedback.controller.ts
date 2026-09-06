import type { Request, Response } from 'express'
import { AppError } from '../../shared/AppError'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import { createFeedback, listFeedbackForRequest } from './feedback.service'
import type { CreateFeedbackInput } from './feedback.validation'

export const create = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const feedback = await createFeedback(req.user.id, req.body as CreateFeedbackInput)
  sendResponse(res, { statusCode: 201, message: 'Feedback recorded', data: { feedback } })
})

export const listForRequest = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const items = await listFeedbackForRequest(req.params.requestId as string, req.user)
  sendResponse(res, { message: 'Feedback fetched', data: { items } })
})
