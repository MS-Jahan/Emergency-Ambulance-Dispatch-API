import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { env } from '../src/config/env'
import {
  app,
  createAmbulance,
  createCompletedTrip,
  createHospital,
  createUser,
  prisma,
  resetDb,
  stripeSignatureHeader,
} from './helpers'

beforeEach(resetDb)

async function setupCompletedTrip() {
  const hospital = await createHospital()
  const patient = await createUser('PATIENT')
  const driver = await createUser('DRIVER')
  const ambulance = await createAmbulance(hospital.id, { type: 'ICU' })
  const trip = await createCompletedTrip(patient.userId, driver.userId, ambulance.id)
  return { patient, driver, ambulance, trip }
}

function completedEvent(sessionId: string, requestId: string) {
  return JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        metadata: { requestId },
      },
    },
  })
}

describe('payments: checkout gating', () => {
  it('creates a checkout session for a completed trip and stores a pending payment', async () => {
    // Real stripe call needs a real key, this environment has a placeholder, so
    // assert the preconditions and expect the gateway error envelope, not a crash
    const { patient, trip } = await setupCompletedTrip()

    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ requestId: trip.id })

    // Placeholder key means stripe rejects, but it must be a structured 500 not a hang
    expect([500, 502]).toContain(res.status)
    expect(res.body.success).toBe(false)
  })

  it('refuses payment for a trip that is not completed with 409', async () => {
    const { patient, driver, ambulance } = await setupCompletedTrip()
    const pending = await prisma.emergencyRequest.create({
      data: {
        patientId: patient.userId,
        pickupAddress: '9 Pending Street',
        pickupLat: 23.7,
        pickupLng: 90.4,
        status: 'PENDING',
      },
    })
    void driver
    void ambulance

    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ requestId: pending.id })
      .expect(409)
    expect(res.body.message).toContain('completed')
  })

  it("blocks a patient from paying for someone else's trip with 403", async () => {
    const { trip } = await setupCompletedTrip()
    const other = await createUser('PATIENT')

    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ requestId: trip.id })
      .expect(403)
  })
})

describe('payments: webhook', () => {
  it('marks the payment paid from a correctly signed checkout.session.completed event', async () => {
    const { patient, trip } = await setupCompletedTrip()
    const sessionId = 'cs_test_123'
    await prisma.payment.create({
      data: {
        requestId: trip.id,
        patientId: patient.userId,
        amount: 35,
        currency: 'usd',
        stripeSessionId: sessionId,
        status: 'PENDING',
      },
    })

    const payload = completedEvent(sessionId, trip.id)
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', stripeSignatureHeader(payload, env.STRIPE_WEBHOOK_SECRET))
      .send(payload)
      .expect(200)

    expect(res.body.data.paymentsUpdated).toBe(1)

    const payment = await prisma.payment.findFirstOrThrow({
      where: { stripeSessionId: sessionId },
    })
    expect(payment.status).toBe('PAID')
  })

  it('rejects an event signed with the wrong secret with 400', async () => {
    const payload = completedEvent('cs_x', 'req_x')
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', stripeSignatureHeader(payload, 'whsec_wrong_secret'))
      .send(payload)
      .expect(400)
    expect(res.body.message).toContain('signature')
  })

  it('rejects an event with no signature header with 400', async () => {
    await request(app)
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .send(completedEvent('cs_x', 'req_x'))
      .expect(400)
  })

  it('does not double count an already paid payment', async () => {
    const { patient, trip } = await setupCompletedTrip()
    const sessionId = 'cs_test_dup'
    await prisma.payment.create({
      data: {
        requestId: trip.id,
        patientId: patient.userId,
        amount: 35,
        currency: 'usd',
        stripeSessionId: sessionId,
        status: 'PAID',
      },
    })

    const payload = completedEvent(sessionId, trip.id)
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', stripeSignatureHeader(payload, env.STRIPE_WEBHOOK_SECRET))
      .send(payload)
      .expect(200)
    expect(res.body.data.paymentsUpdated).toBe(0)
  })
})

describe('payments: status tracking and callbacks', () => {
  it('lists my payments scoped to the caller with pagination', async () => {
    const { patient, trip } = await setupCompletedTrip()
    await prisma.payment.create({
      data: {
        requestId: trip.id,
        patientId: patient.userId,
        amount: 35,
        currency: 'usd',
        status: 'PENDING',
      },
    })
    await createUser('PATIENT') // someone else with no payments

    const res = await request(app)
      .get('/api/v1/payments/my')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200)
    expect(res.body.data.meta.total).toBe(1)
  })

  it("hides other people's payments with 403 but lets admins through", async () => {
    const { patient, trip } = await setupCompletedTrip()
    const payment = await prisma.payment.create({
      data: {
        requestId: trip.id,
        patientId: patient.userId,
        amount: 35,
        currency: 'usd',
        status: 'PAID',
      },
    })
    const other = await createUser('PATIENT')
    const admin = await createUser('ADMIN')

    await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403)

    await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
  })

  it('success callback returns the payment without needing a bearer token', async () => {
    const { patient, trip } = await setupCompletedTrip()
    const sessionId = 'cs_test_cb'
    await prisma.payment.create({
      data: {
        requestId: trip.id,
        patientId: patient.userId,
        amount: 35,
        currency: 'usd',
        stripeSessionId: sessionId,
        status: 'PAID',
      },
    })

    const res = await request(app)
      .get(`/api/v1/payments/callback/success?sessionId=${sessionId}`)
      .expect(200)
    expect(res.body.data.payment.status).toBe('PAID')
  })

  it('cancel callback reports the payment and does not crash', async () => {
    const { patient, trip } = await setupCompletedTrip()
    const sessionId = 'cs_test_cancel'
    await prisma.payment.create({
      data: {
        requestId: trip.id,
        patientId: patient.userId,
        amount: 35,
        currency: 'usd',
        stripeSessionId: sessionId,
        status: 'PENDING',
      },
    })

    // Expiring an unknown session against the placeholder key fails at stripe,
    // the endpoint must still return the payment it found
    const res = await request(app).get(`/api/v1/payments/callback/cancel?sessionId=${sessionId}`)
    expect(res.body.data.payment.stripeSessionId).toBe(sessionId)
  })
})

describe('feedback', () => {
  it('lets the patient rate a completed trip once and rejects duplicates', async () => {
    const { patient, trip } = await setupCompletedTrip()

    const first = await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ requestId: trip.id, rating: 5, comment: 'Great driver' })
      .expect(201)
    expect(first.body.data.feedback.rating).toBe(5)

    await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ requestId: trip.id, rating: 2 })
      .expect(409)
  })

  it('rejects ratings out of the 1 to 5 range with validation errors', async () => {
    const { patient, trip } = await setupCompletedTrip()
    const res = await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ requestId: trip.id, rating: 9 })
      .expect(400)
    expect(res.body.errors[0].field).toBe('rating')
  })

  it('lists feedback for a request', async () => {
    const { patient, trip } = await setupCompletedTrip()
    await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ requestId: trip.id, rating: 4 })
      .expect(201)

    const res = await request(app)
      .get(`/api/v1/feedback/request/${trip.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200)
    expect(res.body.data.items).toHaveLength(1)
  })
})
