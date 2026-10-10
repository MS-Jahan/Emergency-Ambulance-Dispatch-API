import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, createUser, prisma, resetDb } from './helpers'

describe('Item 5: Password change, maintenance toggle, fare estimate', () => {
  beforeEach(async () => {
    await resetDb()
  })

  describe('PATCH /api/v1/users/me/password', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me/password')
        .send({ currentPassword: 'OldPassword123', newPassword: 'NewPassword123' })
        .expect(401)

      expect(res.body.success).toBe(false)
    })

    it('rejects weak new passwords (missing letter, missing digit, or < 8 chars)', async () => {
      const user = await createUser('PATIENT', { password: 'OldPassword123' })

      // Too short
      await request(app)
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'OldPassword123', newPassword: 'Short1' })
        .expect(400)

      // No number
      await request(app)
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'OldPassword123', newPassword: 'OnlyLettersHere' })
        .expect(400)

      // No letter
      await request(app)
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'OldPassword123', newPassword: '1234567890' })
        .expect(400)
    })

    it('rejects wrong current password', async () => {
      const user = await createUser('PATIENT', { password: 'OldPassword123' })

      const res = await request(app)
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'WrongPassword999', newPassword: 'NewPassword123' })
        .expect(400)

      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('Current password is incorrect')
    })

    it('updates password, allows login with new password, and revokes active refresh tokens', async () => {
      const user = await createUser('PATIENT', { password: 'OldPassword123' })

      // Seed a refresh token for this user
      const refreshToken = await prisma.refreshToken.create({
        data: {
          tokenHash: 'sample-refresh-hash',
          userId: user.userId,
          expiresAt: new Date(Date.now() + 1000000),
        },
      })

      const res = await request(app)
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'OldPassword123', newPassword: 'NewPassword123' })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.message).toContain('Password updated successfully')

      // Verify old refresh token was revoked
      const updatedToken = await prisma.refreshToken.findUnique({
        where: { id: refreshToken.id },
      })
      expect(updatedToken?.revokedAt).not.toBeNull()

      // Verify login succeeds with new password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'NewPassword123' })
        .expect(200)

      expect(loginRes.body.success).toBe(true)
      expect(loginRes.body.data.user.id).toBe(user.userId)

      // Verify login fails with old password
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'OldPassword123' })
        .expect(401)
    })
  })

  describe('PATCH /api/v1/driver/ambulance/status', () => {
    it('requires DRIVER role', async () => {
      const patient = await createUser('PATIENT')

      await request(app)
        .patch('/api/v1/driver/ambulance/status')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ status: 'MAINTENANCE' })
        .expect(403)
    })

    it('allows driver to mark assigned ambulance as MAINTENANCE and back to AVAILABLE', async () => {
      const driver = await createUser('DRIVER')

      // Assign an ambulance to driver
      const ambulance = await prisma.ambulance.create({
        data: {
          plateNumber: 'AMB-TEST-01',
          type: 'BASIC',
          status: 'AVAILABLE',
        },
      })
      await prisma.driverProfile.update({
        where: { userId: driver.userId },
        data: { ambulanceId: ambulance.id },
      })

      // Mark MAINTENANCE
      const res1 = await request(app)
        .patch('/api/v1/driver/ambulance/status')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ status: 'MAINTENANCE' })
        .expect(200)

      expect(res1.body.success).toBe(true)
      expect(res1.body.data.ambulance.status).toBe('MAINTENANCE')

      const ambInDb = await prisma.ambulance.findUnique({ where: { id: ambulance.id } })
      expect(ambInDb?.status).toBe('MAINTENANCE')

      // Mark back to AVAILABLE
      const res2 = await request(app)
        .patch('/api/v1/driver/ambulance/status')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ status: 'AVAILABLE' })
        .expect(200)

      expect(res2.body.data.ambulance.status).toBe('AVAILABLE')
    })

    it('refuses maintenance change with 409 when driver is on an active trip', async () => {
      const driver = await createUser('DRIVER')
      const patient = await createUser('PATIENT')
      const ambulance = await prisma.ambulance.create({
        data: { plateNumber: 'AMB-TEST-02', type: 'ICU', status: 'AVAILABLE' },
      })
      await prisma.driverProfile.update({
        where: { userId: driver.userId },
        data: { ambulanceId: ambulance.id },
      })

      // Create an active request assigned to driver
      await prisma.emergencyRequest.create({
        data: {
          patientId: patient.userId,
          driverId: driver.userId,
          ambulanceId: ambulance.id,
          pickupAddress: 'Road 5, Dhanmondi',
          pickupLat: 23.74,
          pickupLng: 90.38,
          priority: 'CRITICAL',
          status: 'EN_ROUTE_PICKUP',
        },
      })

      const res = await request(app)
        .patch('/api/v1/driver/ambulance/status')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ status: 'MAINTENANCE' })
        .expect(409)

      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('active trip')
    })
  })

  describe('GET /api/v1/fares/estimate', () => {
    it('returns estimate for BASIC ambulance', async () => {
      const res = await request(app).get('/api/v1/fares/estimate?type=BASIC').expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.estimate).toEqual({
        type: 'BASIC',
        amount: 15,
        currency: 'USD',
      })
    })

    it('returns estimate for ICU ambulance', async () => {
      const res = await request(app).get('/api/v1/fares/estimate?type=ICU').expect(200)

      expect(res.body.data.estimate).toEqual({
        type: 'ICU',
        amount: 35,
        currency: 'USD',
      })
    })

    it('returns estimate for CARDIAC ambulance', async () => {
      const res = await request(app).get('/api/v1/fares/estimate?type=CARDIAC').expect(200)

      expect(res.body.data.estimate).toEqual({
        type: 'CARDIAC',
        amount: 60,
        currency: 'USD',
      })
    })

    it('returns all fare estimates when no type query is provided', async () => {
      const res = await request(app).get('/api/v1/fares/estimate').expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.estimates).toHaveLength(3)
      expect(res.body.data.rates).toEqual({
        BASIC: 15,
        ICU: 35,
        CARDIAC: 60,
      })
      expect(res.body.data.currency).toBe('USD')
    })
  })
})
