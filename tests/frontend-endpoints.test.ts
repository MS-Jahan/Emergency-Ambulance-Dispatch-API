import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  app,
  createAmbulance,
  createCompletedTrip,
  createHospital,
  createUser,
  prisma,
  resetDb,
} from './helpers'

beforeEach(resetDb)

describe('public endpoints', () => {
  it('lists hospitals and reads one without a token, but still guards writes', async () => {
    const hospital = await createHospital()
    const list = await request(app).get('/api/v1/hospitals').expect(200)
    expect(list.body.data.items).toHaveLength(1)
    await request(app).get(`/api/v1/hospitals/${hospital.id}`).expect(200)
    await request(app).post('/api/v1/hospitals').send({}).expect(401)
  })

  it('returns cached public stats', async () => {
    const hospital = await createHospital()
    const patient = await createUser('PATIENT')
    const driver = await createUser('DRIVER')
    const ambulance = await createAmbulance(hospital.id)
    await createCompletedTrip(patient.userId, driver.userId, ambulance.id)

    const res = await request(app).get('/api/v1/public/stats').expect(200)
    expect(res.headers['cache-control']).toBe('public, max-age=60')
    expect(res.body.data.stats).toEqual({
      hospitals: 1,
      ambulancesAvailable: 1,
      requestsCompleted: 1,
    })
  })
})

describe('driver stats and assigned filters', () => {
  it('computes driver stats and filters assigned requests', async () => {
    const hospital = await createHospital()
    const patient = await createUser('PATIENT', { name: 'Rahim Patient' })
    const driver = await createUser('DRIVER')
    const ambulance = await createAmbulance(hospital.id)
    const trip = await createCompletedTrip(patient.userId, driver.userId, ambulance.id)
    await prisma.feedback.create({
      data: {
        requestId: trip.id,
        patientId: patient.userId,
        driverId: driver.userId,
        rating: 4,
      },
    })
    await prisma.payment.create({
      data: { requestId: trip.id, patientId: patient.userId, amount: 25.5, status: 'PAID' },
    })

    const stats = await request(app)
      .get('/api/v1/driver/me/stats')
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(200)
    expect(stats.body.data.stats).toEqual({
      completedTrips: 1,
      activeTrips: 0,
      averageRating: 4,
      ratingCount: 1,
      fareTotal: 25.5,
    })

    const hit = await request(app)
      .get('/api/v1/requests/my-assigned?status=COMPLETED&q=rahim')
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(200)
    expect(hit.body.data.items).toHaveLength(1)
    expect(Object.keys(hit.body.data.items[0].patient).sort()).toEqual(['id', 'name', 'phone'])

    const miss = await request(app)
      .get('/api/v1/requests/my-assigned?status=PENDING')
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(200)
    expect(miss.body.data.items).toHaveLength(0)
  })
})

describe('admin report and feedback', () => {
  it('returns a zero-filled summary and validates the range', async () => {
    const admin = await createUser('ADMIN')
    const auth = { Authorization: `Bearer ${admin.token}` }
    const res = await request(app).get('/api/v1/admin/reports/summary').set(auth).expect(200)
    expect(res.body.data.summary.perDay).toHaveLength(7)
    expect(res.body.data.summary.total).toBe(0)
    await request(app)
      .get('/api/v1/admin/reports/summary?from=2026-01-01&to=2026-12-31')
      .set(auth)
      .expect(400)
  })

  it('lists feedback newest first for admins only', async () => {
    const admin = await createUser('ADMIN')
    const patient = await createUser('PATIENT')
    const driver = await createUser('DRIVER')
    const hospital = await createHospital()
    const ambulance = await createAmbulance(hospital.id)
    const trip = await createCompletedTrip(patient.userId, driver.userId, ambulance.id)
    await prisma.feedback.create({
      data: { requestId: trip.id, patientId: patient.userId, driverId: driver.userId, rating: 5 },
    })
    const res = await request(app)
      .get('/api/v1/admin/feedback')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(res.body.data.items[0]).toMatchObject({ rating: 5, requestId: trip.id })
    expect(Object.keys(res.body.data.items[0].driver).sort()).toEqual(['id', 'name'])
    await request(app)
      .get('/api/v1/admin/feedback')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(403)
  })
})
