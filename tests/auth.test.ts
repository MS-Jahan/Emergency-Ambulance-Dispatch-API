import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, createUser, prisma, resetDb } from './helpers'

beforeEach(resetDb)

describe('auth: registration and login', () => {
  it('registers a patient and returns tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'New Patient', email: 'reg@test.local', password: 'Password123' })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.user.role).toBe('PATIENT')
    expect(res.body.data.accessToken).toBeTruthy()
    expect(res.body.data.refreshToken).toBeTruthy()
    expect(res.body.data.user.password).toBeUndefined()
  })

  it('rejects duplicate email registration with 409', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'First', email: 'dup@test.local', password: 'Password123' })
      .expect(201)

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Second', email: 'dup@test.local', password: 'Password123' })
      .expect(409)

    expect(res.body.success).toBe(false)
  })

  it('returns structured validation errors on bad input', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'x', email: 'not-an-email', password: 'short' })
      .expect(400)

    expect(res.body.success).toBe(false)
    expect(res.body.errors.length).toBeGreaterThan(0)
    for (const item of res.body.errors) {
      expect(item).toHaveProperty('message')
    }
  })

  it('logs in with valid credentials and rejects bad ones with 401', async () => {
    await createUser('PATIENT', { email: 'login@test.local', password: 'Password123' })

    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.local', password: 'Password123' })
      .expect(200)
    expect(ok.body.data.accessToken).toBeTruthy()

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.local', password: 'WrongPass123' })
      .expect(401)
  })

  it('cannot login as a soft deleted user', async () => {
    const { email } = await createUser('PATIENT', { email: 'gone@test.local' })
    await prisma.user.update({ where: { email }, data: { deletedAt: new Date() } })

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123' })
      .expect(401)
  })
})

describe('auth: tokens and session', () => {
  it('refreshes tokens and invalidates the used refresh token', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Refresher', email: 'refresh@test.local', password: 'Password123' })
    const oldRefresh = reg.body.data.refreshToken as string

    const rotated = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: oldRefresh })
      .expect(200)
    expect(rotated.body.data.accessToken).toBeTruthy()

    await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: oldRefresh })
      .expect(401)
  })

  it('revokes the refresh token on logout', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Logout User', email: 'logout@test.local', password: 'Password123' })
    const refreshToken = reg.body.data.refreshToken as string

    await request(app).post('/api/v1/auth/logout').send({ refreshToken }).expect(200)
    await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken }).expect(401)
  })

  it('guards /users/me with the bearer token', async () => {
    await request(app).get('/api/v1/users/me').expect(401)

    const { token } = await createUser('PATIENT')
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.data.user.role).toBe('PATIENT')
  })

  it('updates the profile through PATCH /users/me', async () => {
    const { token } = await createUser('PATIENT')
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Person', phone: '+8801999999999' })
      .expect(200)
    expect(res.body.data.user.name).toBe('Renamed Person')
  })
})

describe('rbac: role enforcement', () => {
  it('blocks patients from admin routes with 403', async () => {
    const { token } = await createUser('PATIENT')
    const res = await request(app)
      .get('/api/v1/admin/dashboard-stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
    expect(res.body.success).toBe(false)
  })

  it('blocks drivers from admin routes with 403', async () => {
    const { token } = await createUser('DRIVER')
    await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })

  it('blocks patients from driver routes with 403', async () => {
    const { token } = await createUser('PATIENT')
    await request(app)
      .patch('/api/v1/driver/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'AVAILABLE' })
      .expect(403)
  })

  it('blocks drivers from creating emergency requests', async () => {
    const { token } = await createUser('DRIVER')
    await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ pickupAddress: 'somewhere over there', pickupLat: 23.7, pickupLng: 90.4 })
      .expect(403)
  })

  it('rejects garbage bearer tokens with 401', async () => {
    await request(app).get('/api/v1/users/me').set('Authorization', 'Bearer not.a.jwt').expect(401)
  })
})
