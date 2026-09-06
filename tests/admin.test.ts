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

describe('admin: driver staff creation', () => {
  it('creates a driver with a profile in one call', async () => {
    const admin = await createUser('ADMIN')
    const res = await request(app)
      .post('/api/v1/admin/drivers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Karim Driver',
        email: 'karim@test.local',
        password: 'Password123',
        phone: '+8801711223344',
        licenseNumber: 'DL-990011',
      })
      .expect(201)

    expect(res.body.data.user.role).toBe('DRIVER')
    expect(res.body.data.profile.licenseNumber).toBe('DL-990011')

    // The new driver can actually log in
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'karim@test.local', password: 'Password123' })
      .expect(200)
  })

  it('rejects duplicate license numbers through the database constraint', async () => {
    const admin = await createUser('ADMIN')
    await request(app)
      .post('/api/v1/admin/drivers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'First Driver',
        email: 'first@test.local',
        password: 'Password123',
        phone: '+8801711223344',
        licenseNumber: 'DL-SAME-1',
      })
      .expect(201)

    const res = await request(app)
      .post('/api/v1/admin/drivers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Second Driver',
        email: 'second@test.local',
        password: 'Password123',
        phone: '+8801711223345',
        licenseNumber: 'DL-SAME-1',
      })
      .expect(409)
    expect(res.body.message).toContain('licenseNumber')
  })

  it('is admin only', async () => {
    const { token } = await createUser('PATIENT')
    await request(app)
      .post('/api/v1/admin/drivers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Sneaky Driver',
        email: 'sneaky@test.local',
        password: 'Password123',
        phone: '+8801711223344',
        licenseNumber: 'DL-SNEAKY',
      })
      .expect(403)
  })
})

describe('admin: users', () => {
  it('lists users with role filter and search', async () => {
    const admin = await createUser('ADMIN')
    await createUser('PATIENT', { name: 'Zara Patient' })
    await createUser('DRIVER', { name: 'Yusuf Driver' })

    const onlyDrivers = await request(app)
      .get('/api/v1/admin/users?role=DRIVER')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(onlyDrivers.body.data.items).toHaveLength(1)
    expect(onlyDrivers.body.data.items[0].role).toBe('DRIVER')

    const search = await request(app)
      .get('/api/v1/admin/users?q=zara')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(search.body.data.items).toHaveLength(1)
    expect(search.body.data.items[0].name).toContain('Zara')
  })

  it('updates a role to driver and back creates and keeps the profile', async () => {
    const admin = await createUser('ADMIN')
    const patient = await createUser('PATIENT')

    const up = await request(app)
      .patch(`/api/v1/admin/users/${patient.userId}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'DRIVER' })
      .expect(200)
    expect(up.body.data.user.role).toBe('DRIVER')
    expect(
      await prisma.driverProfile.findUnique({ where: { userId: patient.userId } }),
    ).toBeTruthy()

    const down = await request(app)
      .patch(`/api/v1/admin/users/${patient.userId}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'PATIENT' })
      .expect(200)
    expect(down.body.data.user.role).toBe('PATIENT')
  })

  it('rejects setting a role the user already has with 400', async () => {
    const admin = await createUser('ADMIN')
    const patient = await createUser('PATIENT')
    await request(app)
      .patch(`/api/v1/admin/users/${patient.userId}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'PATIENT' })
      .expect(400)
  })
})

describe('admin: stats and audit logs', () => {
  it('aggregates dashboard stats across the system', async () => {
    const admin = await createUser('ADMIN')
    const hospital = await createHospital()
    const patient = await createUser('PATIENT')
    const driver = await createUser('DRIVER')
    const ambulance = await createAmbulance(hospital.id)
    await createCompletedTrip(patient.userId, driver.userId, ambulance.id)
    await prisma.payment.create({
      data: {
        requestId: (await prisma.emergencyRequest.findFirstOrThrow()).id,
        patientId: patient.userId,
        amount: 35,
        currency: 'usd',
        status: 'PAID',
      },
    })

    const res = await request(app)
      .get('/api/v1/admin/dashboard-stats')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    expect(res.body.data.stats.users.total).toBeGreaterThanOrEqual(3)
    expect(res.body.data.stats.requests.completed).toBe(1)
    expect(res.body.data.stats.ambulances.total).toBe(1)
    expect(Number(res.body.data.stats.revenue.paidTotal)).toBe(35)
  })

  it('lists audit logs newest first with actor info', async () => {
    const admin = await createUser('ADMIN')
    const hospital = await createHospital()
    const patient = await createUser('PATIENT')
    const driver = await createUser('DRIVER')
    const ambulance = await createAmbulance(hospital.id)
    await createCompletedTrip(patient.userId, driver.userId, ambulance.id)

    const res = await request(app)
      .get('/api/v1/admin/audit-logs?limit=5')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    expect(res.body.data.meta.total).toBeGreaterThanOrEqual(2)
    expect(res.body.data.items[0].actor).toHaveProperty('name')
    const dates = res.body.data.items.map((i: { createdAt: string }) => i.createdAt) as string[]
    const first = dates[0]
    const second = dates[1]
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    if (first && second) {
      expect(new Date(first).getTime()).toBeGreaterThanOrEqual(new Date(second).getTime())
    }
  })

  it('filters audit logs by request id', async () => {
    const admin = await createUser('ADMIN')
    const hospital = await createHospital()
    const patient = await createUser('PATIENT')
    const driver = await createUser('DRIVER')
    const ambulance = await createAmbulance(hospital.id)
    const trip = await createCompletedTrip(patient.userId, driver.userId, ambulance.id)

    const res = await request(app)
      .get(`/api/v1/admin/audit-logs?requestId=${trip.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(res.body.data.meta.total).toBe(2)
    for (const item of res.body.data.items) {
      expect(item.requestId).toBe(trip.id)
    }
  })
})
