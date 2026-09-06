import type { Prisma } from '@prisma/client'
import type Stripe from 'stripe'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { stripe, TRIP_RATES } from '../../lib/stripe'
import type { AuthUser } from '../../middleware/auth'
import { AppError } from '../../shared/AppError'
import { buildMeta } from '../../shared/paginate'
import type { InitiatePaymentInput, ListPaymentsQuery } from './payment.validation'

const PAYMENT_SELECT = {
  id: true,
  requestId: true,
  patientId: true,
  amount: true,
  currency: true,
  status: true,
  stripeSessionId: true,
  createdAt: true,
  request: {
    select: {
      id: true,
      status: true,
      pickupAddress: true,
      patient: { select: { id: true, name: true, email: true } },
      ambulance: { select: { id: true, plateNumber: true, type: true } },
    },
  },
} satisfies Prisma.PaymentSelect

export async function initiatePayment(patientId: string, input: InitiatePaymentInput) {
  const request = await prisma.emergencyRequest.findFirst({
    where: { id: input.requestId },
    include: { ambulance: { select: { id: true, type: true } } },
  })
  if (!request) {
    throw AppError.notFound('Emergency request not found')
  }
  if (request.patientId !== patientId) {
    throw AppError.forbidden('You can only pay for your own trips')
  }
  if (request.status !== 'COMPLETED') {
    throw AppError.conflict('Payment can only be started for completed trips')
  }
  if (!request.ambulance) {
    throw AppError.conflict('This trip has no ambulance on record, cannot price it')
  }

  const paid = await prisma.payment.findFirst({
    where: { requestId: request.id, status: 'PAID' },
    select: { id: true },
  })
  if (paid) {
    throw AppError.conflict('This trip is already paid')
  }

  const ambulanceType = request.ambulance.type
  const amount = TRIP_RATES[ambulanceType]

  // Reuse a leftover pending row instead of stacking duplicates per retry
  const pending = await prisma.payment.findFirst({
    where: { requestId: request.id, status: 'PENDING' },
  })

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: env.STRIPE_CURRENCY,
          unit_amount: amount * 100,
          product_data: {
            name: `Ambulance trip (${ambulanceType})`,
            description: `Trip ${request.id} from ${request.pickupAddress}`,
          },
        },
      },
    ],
    success_url: `${env.APP_BASE_URL}/api/v1/payments/callback/success?sessionId={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_BASE_URL}/api/v1/payments/callback/cancel?sessionId={CHECKOUT_SESSION_ID}`,
    metadata: { requestId: request.id, patientId: request.patientId },
  })

  const payment = pending
    ? await prisma.payment.update({
        where: { id: pending.id },
        data: { amount, currency: env.STRIPE_CURRENCY, stripeSessionId: session.id },
        select: PAYMENT_SELECT,
      })
    : await prisma.payment.create({
        data: {
          requestId: request.id,
          patientId: request.patientId,
          amount,
          currency: env.STRIPE_CURRENCY,
          stripeSessionId: session.id,
          status: 'PENDING',
        },
        select: PAYMENT_SELECT,
      })

  return { payment, checkoutUrl: session.url }
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!signature) {
    throw AppError.badRequest('Missing stripe signature header')
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch {
    throw AppError.badRequest('Invalid stripe signature')
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const updated = await prisma.payment.updateMany({
      where: { stripeSessionId: session.id, status: 'PENDING' },
      data: { status: 'PAID' },
    })
    return { received: true, eventType: event.type, paymentsUpdated: updated.count }
  }

  return { received: true, eventType: event.type, paymentsUpdated: 0 }
}

export async function handleSuccessCallback(sessionId: string) {
  const payment = await prisma.payment.findFirst({
    where: { stripeSessionId: sessionId },
    select: PAYMENT_SELECT,
  })
  if (!payment) {
    throw AppError.notFound('No payment found for this checkout session')
  }
  // Webhook already did the real state change, nothing to verify
  if (payment.status === 'PAID') {
    return payment
  }

  // Still pending, double check with stripe before showing success
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status === 'paid') {
      return prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID' },
        select: PAYMENT_SELECT,
      })
    }
    return payment
  } catch {
    throw new AppError(502, 'Could not verify the payment with stripe right now')
  }
}

export async function handleCancelCallback(sessionId: string) {
  const payment = await prisma.payment.findFirst({
    where: { stripeSessionId: sessionId },
    select: PAYMENT_SELECT,
  })
  if (!payment) {
    throw AppError.notFound('No payment found for this checkout session')
  }

  // Expire the session so a stale link cannot be paid later, a fresh one is
  // created on the next initiate call
  try {
    await stripe.checkout.sessions.expire(sessionId)
  } catch {
    // Session may already be expired or completed, nothing to do about it here
  }

  return payment
}

export async function listMyPayments(patientId: string, query: ListPaymentsQuery) {
  const { page, limit, status } = query

  const where: Prisma.PaymentWhereInput = { patientId }
  if (status) {
    where.status = status
  }

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      select: PAYMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}

export async function getPaymentById(id: string, requester: AuthUser) {
  const payment = await prisma.payment.findFirst({ where: { id }, select: PAYMENT_SELECT })
  if (!payment) {
    throw AppError.notFound('Payment not found')
  }
  const isOwner = payment.patientId === requester.id
  if (!isOwner && requester.role !== 'ADMIN') {
    throw AppError.forbidden('You can only view your own payments')
  }
  return payment
}
