import type { Request, Response } from 'express'
import { AppError } from '../../shared/AppError'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  getPaymentById,
  handleCancelCallback,
  handleStripeWebhook,
  handleSuccessCallback,
  initiatePayment,
  listMyPayments,
} from './payment.service'
import type { InitiatePaymentInput, ListPaymentsQuery } from './payment.validation'

export const initiate = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const result = await initiatePayment(req.user.id, req.body as InitiatePaymentInput)
  sendResponse(res, { statusCode: 201, message: 'Checkout session created', data: result })
})

export const myPayments = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const result = await listMyPayments(
    req.user.id,
    req.validatedQuery as unknown as ListPaymentsQuery,
  )
  sendResponse(res, { message: 'Payments fetched', data: result })
})

export const getOne = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const payment = await getPaymentById(req.params.id as string, req.user)
  sendResponse(res, { message: 'Payment fetched', data: { payment } })
})

// Stripe redirects the payer's browser here, so these stay unauthenticated and
// only expose the status of one checkout session id
export const successCallback = catchAsync(async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined
  if (!sessionId) {
    throw AppError.badRequest('Missing sessionId query parameter')
  }
  const payment = await handleSuccessCallback(sessionId)
  sendResponse(res, { message: 'Payment completed, thank you', data: { payment } })
})

export const cancelCallback = catchAsync(async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined
  if (!sessionId) {
    throw AppError.badRequest('Missing sessionId query parameter')
  }
  const payment = await handleCancelCallback(sessionId)
  sendResponse(res, {
    message: 'Checkout was cancelled, start a new payment whenever you are ready',
    data: { payment },
  })
})

export const webhook = catchAsync(async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer
  const signature = req.headers['stripe-signature']
  const result = await handleStripeWebhook(
    rawBody,
    Array.isArray(signature) ? signature[0] : signature,
  )
  sendResponse(res, { message: 'Webhook processed', data: result })
})
