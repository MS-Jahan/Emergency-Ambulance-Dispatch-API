import crypto from 'node:crypto'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/config/env'
import { isEmailConfigured, sendEmail } from '../src/lib/email'
import { notifyRequestEvent } from '../src/lib/notify'
import { isSmsConfigured, normalizePhone, sendSms } from '../src/lib/sms'
import { app, createAmbulance, createHospital, createUser, prisma, resetDb } from './helpers'

describe('Email, SMS, and Password Reset integration', () => {
  beforeEach(async () => {
    await resetDb()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('normalizePhone', () => {
    it('normalizes Bangladeshi numbers to E.164 and handles edge cases', () => {
      expect(normalizePhone('01712345678')).toBe('+8801712345678')
      expect(normalizePhone('8801712345678')).toBe('+8801712345678')
      expect(normalizePhone('+8801712345678')).toBe('+8801712345678')
      expect(normalizePhone('01812345678')).toBe('+8801812345678')
      expect(normalizePhone('01912345678')).toBe('+8801912345678')
      expect(normalizePhone(' 01712-345678 ')).toBe('+8801712345678')

      // Other international numbers pass through
      expect(normalizePhone('+15005550006')).toBe('+15005550006')
      expect(normalizePhone('+447911123456')).toBe('+447911123456')

      // Invalid numbers return null
      expect(normalizePhone('01012345678')).toBeNull()
      expect(normalizePhone('01212345678')).toBeNull()
      expect(normalizePhone('12345')).toBeNull()
      expect(normalizePhone('+12345')).toBeNull()
      expect(normalizePhone('invalid')).toBeNull()
      expect(normalizePhone('')).toBeNull()
    })
  })

  describe('Resend email client', () => {
    it('returns skipped when email is not configured', async () => {
      const origKey = env.RESEND_API_KEY
      const origFrom = env.EMAIL_FROM
      try {
        ;(env as any).RESEND_API_KEY = undefined
        ;(env as any).EMAIL_FROM = undefined

        const fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)

        const result = await sendEmail({
          to: 'patient@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        })

        expect(result).toEqual({ sent: false, skipped: 'not_configured' })
        expect(fetchSpy).not.toHaveBeenCalled()
      } finally {
        ;(env as any).RESEND_API_KEY = origKey
        ;(env as any).EMAIL_FROM = origFrom
      }
    })

    it('sends email with correct URL, headers, and body when configured', async () => {
      const origKey = env.RESEND_API_KEY
      const origFrom = env.EMAIL_FROM
      try {
        ;(env as any).RESEND_API_KEY = 're_test_key_123'
        ;(env as any).EMAIL_FROM = 'RapidAid <no-reply@example.com>'

        let capturedUrl = ''
        let capturedOptions: any = null

        vi.stubGlobal(
          'fetch',
          vi.fn(async (url: string, opts: any) => {
            capturedUrl = url
            capturedOptions = opts
            return new Response(JSON.stringify({ id: 'msg_123' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }),
        )

        const result = await sendEmail({
          to: 'patient@example.com',
          subject: 'Trip Update',
          html: '<p>Your trip is confirmed</p>',
          text: 'Your trip is confirmed',
        })

        expect(result).toEqual({ sent: true })
        expect(capturedUrl).toBe('https://api.resend.com/emails')
        expect(capturedOptions.method).toBe('POST')
        expect(capturedOptions.headers.Authorization).toBe('Bearer re_test_key_123')
        expect(capturedOptions.headers['Content-Type']).toBe('application/json')

        const body = JSON.parse(capturedOptions.body)
        expect(body).toEqual({
          from: 'RapidAid <no-reply@example.com>',
          to: ['patient@example.com'],
          subject: 'Trip Update',
          html: '<p>Your trip is confirmed</p>',
          text: 'Your trip is confirmed',
        })
      } finally {
        ;(env as any).RESEND_API_KEY = origKey
        ;(env as any).EMAIL_FROM = origFrom
      }
    })

    it('handles HTTP 500 and network rejections without throwing', async () => {
      const origKey = env.RESEND_API_KEY
      const origFrom = env.EMAIL_FROM
      try {
        ;(env as any).RESEND_API_KEY = 're_test_key_123'
        ;(env as any).EMAIL_FROM = 'RapidAid <no-reply@example.com>'

        // 500 response
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => new Response('Internal error', { status: 500 })),
        )
        const res500 = await sendEmail({
          to: 'p@test.local',
          subject: 'S',
          html: '<p>H</p>',
        })
        expect(res500.sent).toBe(false)
        expect(res500.error).toContain('HTTP 500')

        // Network rejection
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => {
            throw new Error('Connection refused')
          }),
        )
        const resReject = await sendEmail({
          to: 'p@test.local',
          subject: 'S',
          html: '<p>H</p>',
        })
        expect(resReject.sent).toBe(false)
        expect(resReject.error).toBe('Connection refused')
      } finally {
        ;(env as any).RESEND_API_KEY = origKey
        ;(env as any).EMAIL_FROM = origFrom
      }
    })
  })

  describe('SMS client', () => {
    it('returns skipped when SMS is not configured', async () => {
      const origProvider = env.SMS_PROVIDER
      try {
        ;(env as any).SMS_PROVIDER = undefined
        const fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)

        const result = await sendSms({ to: '+8801700000000', text: 'Alert' })
        expect(result).toEqual({ sent: false, skipped: 'not_configured' })
        expect(fetchSpy).not.toHaveBeenCalled()
      } finally {
        ;(env as any).SMS_PROVIDER = origProvider
      }
    })

    it('sends SMS via Twilio using From number', async () => {
      const origProvider = env.SMS_PROVIDER
      const origSid = env.TWILIO_ACCOUNT_SID
      const origToken = env.TWILIO_AUTH_TOKEN
      const origFrom = env.TWILIO_FROM
      const origMsSid = env.TWILIO_MESSAGING_SERVICE_SID
      try {
        ;(env as any).SMS_PROVIDER = 'twilio'
        ;(env as any).TWILIO_ACCOUNT_SID = 'ACtest123'
        ;(env as any).TWILIO_AUTH_TOKEN = 'secrettoken'
        ;(env as any).TWILIO_FROM = '+15005550006'
        ;(env as any).TWILIO_MESSAGING_SERVICE_SID = undefined

        let capturedUrl = ''
        let capturedOptions: any = null

        vi.stubGlobal(
          'fetch',
          vi.fn(async (url: string, opts: any) => {
            capturedUrl = url
            capturedOptions = opts
            return new Response(JSON.stringify({ sid: 'SM123' }), { status: 200 })
          }),
        )

        const result = await sendSms({ to: '01712345678', text: 'Driver arrived' })
        expect(result).toEqual({ sent: true })
        expect(capturedUrl).toBe(
          'https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json',
        )
        expect(capturedOptions.headers.Authorization).toBe(
          `Basic ${Buffer.from('ACtest123:secrettoken').toString('base64')}`,
        )

        const params = new URLSearchParams(capturedOptions.body)
        expect(params.get('To')).toBe('+8801712345678')
        expect(params.get('Body')).toBe('Driver arrived')
        expect(params.get('From')).toBe('+15005550006')
      } finally {
        ;(env as any).SMS_PROVIDER = origProvider
        ;(env as any).TWILIO_ACCOUNT_SID = origSid
        ;(env as any).TWILIO_AUTH_TOKEN = origToken
        ;(env as any).TWILIO_FROM = origFrom
        ;(env as any).TWILIO_MESSAGING_SERVICE_SID = origMsSid
      }
    })

    it('sends SMS via Twilio using MessagingServiceSid', async () => {
      const origProvider = env.SMS_PROVIDER
      const origSid = env.TWILIO_ACCOUNT_SID
      const origToken = env.TWILIO_AUTH_TOKEN
      const origFrom = env.TWILIO_FROM
      const origMsSid = env.TWILIO_MESSAGING_SERVICE_SID
      try {
        ;(env as any).SMS_PROVIDER = 'twilio'
        ;(env as any).TWILIO_ACCOUNT_SID = 'ACtest123'
        ;(env as any).TWILIO_AUTH_TOKEN = 'secrettoken'
        ;(env as any).TWILIO_FROM = undefined
        ;(env as any).TWILIO_MESSAGING_SERVICE_SID = 'MGtest999'

        let capturedOptions: any = null

        vi.stubGlobal(
          'fetch',
          vi.fn(async (_url: string, opts: any) => {
            capturedOptions = opts
            return new Response(JSON.stringify({ sid: 'SM123' }), { status: 200 })
          }),
        )

        const result = await sendSms({ to: '+8801712345678', text: 'Test' })
        expect(result).toEqual({ sent: true })
        const params = new URLSearchParams(capturedOptions.body)
        expect(params.get('MessagingServiceSid')).toBe('MGtest999')
        expect(params.get('From')).toBeNull()
      } finally {
        ;(env as any).SMS_PROVIDER = origProvider
        ;(env as any).TWILIO_ACCOUNT_SID = origSid
        ;(env as any).TWILIO_AUTH_TOKEN = origToken
        ;(env as any).TWILIO_FROM = origFrom
        ;(env as any).TWILIO_MESSAGING_SERVICE_SID = origMsSid
      }
    })

    it('sends SMS via custom Webhook', async () => {
      const origProvider = env.SMS_PROVIDER
      const origUrl = env.SMS_WEBHOOK_URL
      const origToken = env.SMS_WEBHOOK_TOKEN
      const origSender = env.SMS_SENDER_ID
      try {
        ;(env as any).SMS_PROVIDER = 'webhook'
        ;(env as any).SMS_WEBHOOK_URL = 'https://gateway.example.com/sms'
        ;(env as any).SMS_WEBHOOK_TOKEN = 'hook_token_123'
        ;(env as any).SMS_SENDER_ID = 'RapidAid'

        let capturedUrl = ''
        let capturedOptions: any = null

        vi.stubGlobal(
          'fetch',
          vi.fn(async (url: string, opts: any) => {
            capturedUrl = url
            capturedOptions = opts
            return new Response(JSON.stringify({ success: true }), { status: 200 })
          }),
        )

        const result = await sendSms({ to: '01812345678', text: 'Webhook SMS' })
        expect(result).toEqual({ sent: true })
        expect(capturedUrl).toBe('https://gateway.example.com/sms')
        expect(capturedOptions.headers.Authorization).toBe('Bearer hook_token_123')
        expect(JSON.parse(capturedOptions.body)).toEqual({
          to: '+8801812345678',
          message: 'Webhook SMS',
          sender: 'RapidAid',
        })
      } finally {
        ;(env as any).SMS_PROVIDER = origProvider
        ;(env as any).SMS_WEBHOOK_URL = origUrl
        ;(env as any).SMS_WEBHOOK_TOKEN = origToken
        ;(env as any).SMS_SENDER_ID = origSender
      }
    })

    it('handles SMS HTTP 500 and network rejections without throwing', async () => {
      const origProvider = env.SMS_PROVIDER
      const origSid = env.TWILIO_ACCOUNT_SID
      const origToken = env.TWILIO_AUTH_TOKEN
      const origFrom = env.TWILIO_FROM
      try {
        ;(env as any).SMS_PROVIDER = 'twilio'
        ;(env as any).TWILIO_ACCOUNT_SID = 'ACtest123'
        ;(env as any).TWILIO_AUTH_TOKEN = 'secrettoken'
        ;(env as any).TWILIO_FROM = '+15005550006'

        vi.stubGlobal(
          'fetch',
          vi.fn(async () => new Response('Twilio down', { status: 500 })),
        )
        const res500 = await sendSms({ to: '+8801700000000', text: 'Hi' })
        expect(res500.sent).toBe(false)
        expect(res500.error).toContain('Twilio error')

        vi.stubGlobal(
          'fetch',
          vi.fn(async () => {
            throw new Error('Timeout')
          }),
        )
        const resTimeout = await sendSms({ to: '+8801700000000', text: 'Hi' })
        expect(resTimeout.sent).toBe(false)
        expect(resTimeout.error).toBe('Timeout')
      } finally {
        ;(env as any).SMS_PROVIDER = origProvider
        ;(env as any).TWILIO_ACCOUNT_SID = origSid
        ;(env as any).TWILIO_AUTH_TOKEN = origToken
        ;(env as any).TWILIO_FROM = origFrom
      }
    })
  })

  describe('Capabilities endpoint', () => {
    it('returns capabilities flags with Cache-Control header', async () => {
      const res = await request(app).get('/api/v1/public/capabilities')
      expect(res.status).toBe(200)
      expect(res.headers['cache-control']).toBe('public, max-age=60')
      expect(res.body.success).toBe(true)
      expect(res.body.data.capabilities).toHaveProperty('email')
      expect(res.body.data.capabilities).toHaveProperty('sms')
      expect(res.body.data.capabilities).toHaveProperty('passwordReset')
      expect(res.body.data.capabilities.passwordReset).toBe(res.body.data.capabilities.email)
    })
  })

  describe('Admin integration test endpoints', () => {
    it('guards test endpoints to ADMIN role only', async () => {
      const patient = await createUser('PATIENT')
      const driver = await createUser('DRIVER')

      // Unauthenticated
      const unauth = await request(app)
        .post('/api/v1/admin/integrations/test-email')
        .send({ to: 'admin@example.com' })
      expect(unauth.status).toBe(401)

      // Patient
      const patientRes = await request(app)
        .post('/api/v1/admin/integrations/test-email')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ to: 'admin@example.com' })
      expect(patientRes.status).toBe(403)

      // Driver
      const driverRes = await request(app)
        .post('/api/v1/admin/integrations/test-sms')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ to: '+8801700000000' })
      expect(driverRes.status).toBe(403)
    })

    it('allows admin to dispatch test email and returns dispatch status', async () => {
      const admin = await createUser('ADMIN')

      const res = await request(app)
        .post('/api/v1/admin/integrations/test-email')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ to: 'verify@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('sent')
    })

    it('allows admin to dispatch test sms and returns dispatch status', async () => {
      const admin = await createUser('ADMIN')

      const res = await request(app)
        .post('/api/v1/admin/integrations/test-sms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ to: '+8801700000000' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('sent')
    })
  })

  describe('Password reset flow', () => {
    it('returns the same response for unknown and known emails', async () => {
      const patient = await createUser('PATIENT', { email: 'known@test.local' })

      const resKnown = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: patient.email })

      const resUnknown = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown-nonexistent@test.local' })

      expect(resKnown.status).toBe(200)
      expect(resUnknown.status).toBe(200)
      expect(resKnown.body.message).toBe(resUnknown.body.message)
    })

    it('creates hashed token, invalidates prior tokens, and completes reset', async () => {
      const origKey = env.RESEND_API_KEY
      const origFrom = env.EMAIL_FROM
      try {
        ;(env as any).RESEND_API_KEY = 're_test_key_123'
        ;(env as any).EMAIL_FROM = 'RapidAid <no-reply@example.com>'

        let capturedResetUrl = ''
        vi.stubGlobal(
          'fetch',
          vi.fn(async (_url: string, opts: any) => {
            const body = JSON.parse(opts.body)
            const match = body.text.match(
              /http:\/\/localhost:3000\/reset-password\?token=([a-f0-9]+)/,
            )
            if (match) {
              capturedResetUrl = match[1]
            }
            return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 })
          }),
        )

        const patient = await createUser('PATIENT', {
          email: 'resetme@test.local',
          password: 'OldPassword123',
        })

        // Trigger forgot password
        await request(app).post('/api/v1/auth/forgot-password').send({ email: patient.email })

        expect(capturedResetUrl).toBeTruthy()
        const rawToken1 = capturedResetUrl

        // Verify token is stored hashed in DB
        const tokenHash1 = crypto.createHash('sha256').update(rawToken1).digest('hex')
        const dbToken1 = await prisma.passwordResetToken.findUnique({
          where: { tokenHash: tokenHash1 },
        })
        expect(dbToken1).not.toBeNull()
        expect(dbToken1?.userId).toBe(patient.userId)
        expect(dbToken1?.usedAt).toBeNull()

        // Trigger a second forgot password request to verify invalidation of the first
        await request(app).post('/api/v1/auth/forgot-password').send({ email: patient.email })

        const dbToken1After = await prisma.passwordResetToken.findUnique({
          where: { tokenHash: tokenHash1 },
        })
        expect(dbToken1After?.usedAt).not.toBeNull() // Prior token invalidated

        const rawToken2 = capturedResetUrl
        const tokenHash2 = crypto.createHash('sha256').update(rawToken2).digest('hex')

        // Attempting to reset with the invalidated token fails
        const failFirstRes = await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken1, newPassword: 'NewPassword123' })
        expect(failFirstRes.status).toBe(400)
        expect(failFirstRes.body.message).toBe('Invalid or expired token')

        // Reset with valid second token succeeds
        const resetRes = await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken2, newPassword: 'NewPassword123' })
        expect(resetRes.status).toBe(200)

        // Token is now used
        const dbToken2After = await prisma.passwordResetToken.findUnique({
          where: { tokenHash: tokenHash2 },
        })
        expect(dbToken2After?.usedAt).not.toBeNull()

        // Reusing token fails
        const reuseRes = await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken2, newPassword: 'AnotherPassword123' })
        expect(reuseRes.status).toBe(400)
        expect(reuseRes.body.message).toBe('Invalid or expired token')

        // Login with old password fails
        const oldLoginRes = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: patient.email, password: 'OldPassword123' })
        expect(oldLoginRes.status).toBe(401)

        // Login with new password succeeds
        const newLoginRes = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: patient.email, password: 'NewPassword123' })
        expect(newLoginRes.status).toBe(200)
        expect(newLoginRes.body.data.user.email).toBe(patient.email)
      } finally {
        ;(env as any).RESEND_API_KEY = origKey
        ;(env as any).EMAIL_FROM = origFrom
      }
    })

    it('rejects expired tokens and revokes existing refresh tokens on reset', async () => {
      const patient = await createUser('PATIENT', {
        email: 'expiretest@test.local',
        password: 'Password123',
      })

      // Issue a refresh token
      await prisma.refreshToken.create({
        data: {
          id: 'test-refresh-id',
          tokenHash: 'test-hash-123456',
          userId: patient.userId,
          expiresAt: new Date(Date.now() + 86400000),
        },
      })

      // Create an expired reset token in DB
      const expiredRawToken = 'expiredrawtoken123'
      const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex')
      await prisma.passwordResetToken.create({
        data: {
          userId: patient.userId,
          tokenHash: expiredHash,
          expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
        },
      })

      const expiredRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: expiredRawToken, newPassword: 'NewPassword123' })

      expect(expiredRes.status).toBe(400)
      expect(expiredRes.body.message).toBe('Invalid or expired token')

      // Create a valid token and reset
      const validRawToken = 'validrawtoken456'
      const validHash = crypto.createHash('sha256').update(validRawToken).digest('hex')
      await prisma.passwordResetToken.create({
        data: {
          userId: patient.userId,
          tokenHash: validHash,
          expiresAt: new Date(Date.now() + 1800000),
        },
      })

      const validRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: validRawToken, newPassword: 'NewPassword123' })
      expect(validRes.status).toBe(200)

      // Refresh token must be revoked
      const rf = await prisma.refreshToken.findUnique({
        where: { tokenHash: 'test-hash-123456' },
      })
      expect(rf?.revokedAt).not.toBeNull()
    })
  })

  describe('Notification preferences and event dispatch', () => {
    it('requires a valid phone number to enable SMS notifications', async () => {
      const patient = await createUser('PATIENT', { phone: undefined } as any)
      // Wipe phone
      await prisma.user.update({
        where: { id: patient.userId },
        data: { phone: null },
      })

      const resNoPhone = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ notifySms: true })

      expect(resNoPhone.status).toBe(400)
      expect(resNoPhone.body.message).toContain('valid phone number')

      // With an invalid phone number
      const resBadPhone = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ phone: '1234', notifySms: true })

      expect(resBadPhone.status).toBe(400)

      // With a valid phone number
      const resGood = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ phone: '01712345678', notifySms: true, notifyEmail: false })

      expect(resGood.status).toBe(200)
      expect(resGood.body.data.user.notifySms).toBe(true)
      expect(resGood.body.data.user.notifyEmail).toBe(false)
    })

    it('gates notification dispatch based on patient preferences and provider status', async () => {
      const origEmailKey = env.RESEND_API_KEY
      const origEmailFrom = env.EMAIL_FROM
      const origSmsProvider = env.SMS_PROVIDER
      const origSid = env.TWILIO_ACCOUNT_SID
      const origToken = env.TWILIO_AUTH_TOKEN
      const origFrom = env.TWILIO_FROM

      try {
        ;(env as any).RESEND_API_KEY = 're_test_key'
        ;(env as any).EMAIL_FROM = 'RapidAid <no-reply@example.com>'
        ;(env as any).SMS_PROVIDER = 'twilio'
        ;(env as any).TWILIO_ACCOUNT_SID = 'AC123'
        ;(env as any).TWILIO_AUTH_TOKEN = 'token123'
        ;(env as any).TWILIO_FROM = '+15005550006'

        let fetchCalls: { url: string; opts: any }[] = []
        vi.stubGlobal(
          'fetch',
          vi.fn(async (url: string, opts: any) => {
            fetchCalls.push({ url, opts })
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
          }),
        )

        // Patient with SMS disabled, Email enabled
        const patient = await createUser('PATIENT')
        await prisma.user.update({
          where: { id: patient.userId },
          data: { notifySms: false, notifyEmail: true },
        })

        const hospital = await createHospital()
        const ambulance = await createAmbulance(hospital.id)

        const emergencyReq = await prisma.emergencyRequest.create({
          data: {
            patientId: patient.userId,
            pickupAddress: 'Dhaka',
            pickupLat: 23.7,
            pickupLng: 90.4,
            status: 'ASSIGNED',
            ambulanceId: ambulance.id,
          },
        })

        await notifyRequestEvent(emergencyReq.id, 'ASSIGNED')

        // Only email was called, SMS was not
        expect(fetchCalls.length).toBe(1)
        expect(fetchCalls[0]?.url).toBe('https://api.resend.com/emails')

        // Now disable email too
        fetchCalls = []
        await prisma.user.update({
          where: { id: patient.userId },
          data: { notifySms: false, notifyEmail: false },
        })

        await notifyRequestEvent(emergencyReq.id, 'ASSIGNED')
        expect(fetchCalls.length).toBe(0)
      } finally {
        ;(env as any).RESEND_API_KEY = origEmailKey
        ;(env as any).EMAIL_FROM = origEmailFrom
        ;(env as any).SMS_PROVIDER = origSmsProvider
        ;(env as any).TWILIO_ACCOUNT_SID = origSid
        ;(env as any).TWILIO_AUTH_TOKEN = origToken
        ;(env as any).TWILIO_FROM = origFrom
      }
    })

    it('request status transition still succeeds when notification dispatch fails', async () => {
      const origKey = env.RESEND_API_KEY
      const origFrom = env.EMAIL_FROM
      try {
        ;(env as any).RESEND_API_KEY = 're_test_key'
        ;(env as any).EMAIL_FROM = 'RapidAid <no-reply@example.com>'

        // Simulate failing fetch
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => {
            throw new Error('Email server exploded')
          }),
        )

        const patient = await createUser('PATIENT')
        const admin = await createUser('ADMIN')
        const driver = await createUser('DRIVER')
        const hospital = await createHospital()
        const ambulance = await createAmbulance(hospital.id)

        // Assign ambulance to driver
        await prisma.driverProfile.update({
          where: { userId: driver.userId },
          data: { ambulanceId: ambulance.id },
        })

        const emergencyReq = await prisma.emergencyRequest.create({
          data: {
            patientId: patient.userId,
            pickupAddress: 'Banani',
            pickupLat: 23.7,
            pickupLng: 90.4,
            status: 'PENDING',
          },
        })

        // Admin assigns request
        const assignRes = await request(app)
          .post(`/api/v1/requests/${emergencyReq.id}/assign`)
          .set('Authorization', `Bearer ${admin.token}`)
          .send({ ambulanceId: ambulance.id, driverId: driver.userId })

        expect(assignRes.status).toBe(201)
        expect(assignRes.body.data.request.status).toBe('ASSIGNED')
      } finally {
        ;(env as any).RESEND_API_KEY = origKey
        ;(env as any).EMAIL_FROM = origFrom
      }
    })
  })
})
