import express, { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import {
  cancelCallback,
  getOne,
  initiate,
  myPayments,
  successCallback,
  webhook,
} from './payment.controller'
import { initiatePaymentSchema, listPaymentsQuerySchema } from './payment.validation'

export const paymentsRouter = Router()

paymentsRouter.use(authenticate)

paymentsRouter.post(
  '/initiate',
  requireRole('PATIENT'),
  validate({ body: initiatePaymentSchema }),
  initiate,
)
paymentsRouter.get(
  '/my',
  requireRole('PATIENT'),
  validate({ query: listPaymentsQuerySchema }),
  myPayments,
)
paymentsRouter.get('/:id', getOne)

export const paymentCallbackRouter = Router()

paymentCallbackRouter.get('/success', successCallback)
paymentCallbackRouter.get('/cancel', cancelCallback)

// Raw body is required so the stripe signature verifies, mounted above the json
// parser in app.ts
export const paymentWebhookRouter = Router()

paymentWebhookRouter.post('/', express.raw({ type: 'application/json' }), webhook)
