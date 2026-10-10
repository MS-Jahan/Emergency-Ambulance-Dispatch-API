import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, createUser, prisma, resetDb } from './helpers'

beforeEach(resetDb)

describe('contact form and admin messages', () => {
  it('validates input and rejects bad emails and short messages', async () => {
    // Too short message
    await request(app)
      .post('/api/v1/contact')
      .set('x-forwarded-for', '10.1.0.1')
      .send({
        name: 'John',
        email: 'john@example.com',
        message: 'short',
      })
      .expect(400)

    // Bad email
    await request(app)
      .post('/api/v1/contact')
      .set('x-forwarded-for', '10.1.0.2')
      .send({
        name: 'John',
        email: 'not-an-email',
        message: 'This is a valid long message about a billing issue.',
      })
      .expect(400)
  })

  it('rejects submissions with filled honeypot field', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .set('x-forwarded-for', '10.1.0.3')
      .send({
        name: 'Spam Bot',
        email: 'spammer@example.com',
        message: 'This is an automated spam message that should be caught.',
        website: 'https://spam-link.example.com',
      })
      .expect(400)

    expect(res.body.success).toBe(false)
  })

  it('submits a valid contact message and stores it in the database', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .set('x-forwarded-for', '10.1.0.4')
      .send({
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '+8801712345678',
        category: 'BILLING',
        message: 'I have an inquiry about my recent ambulance trip invoice.',
      })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe('Message received')
    expect(res.body.data.id).toBeDefined()

    const saved = await prisma.contactMessage.findUnique({
      where: { id: res.body.data.id },
    })
    expect(saved).not.toBeNull()
    expect(saved?.name).toBe('Alice Smith')
    expect(saved?.email).toBe('alice@example.com')
    expect(saved?.category).toBe('BILLING')
    expect(saved?.status).toBe('NEW')
  })

  it('rate limits submissions: returns 429 on the sixth call from the same IP', async () => {
    const testIp = '10.99.99.99'
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/contact')
        .set('x-forwarded-for', testIp)
        .send({
          name: `Sender ${i}`,
          email: `sender${i}@example.com`,
          message: `This is a test inquiry number ${i} regarding service.`,
        })
        .expect(201)
    }

    const sixth = await request(app)
      .post('/api/v1/contact')
      .set('x-forwarded-for', testIp)
      .send({
        name: 'Sender 6',
        email: 'sender6@example.com',
        message: 'This should trigger the rate limit error.',
      })
      .expect(429)

    expect(sixth.body.success).toBe(false)
    expect(sixth.body.message).toContain('Too many requests')
  })

  it('restricts admin list and status patch to ADMIN role', async () => {
    const patient = await createUser('PATIENT')
    const admin = await createUser('ADMIN')

    // Create a message
    const msg = await prisma.contactMessage.create({
      data: {
        name: 'Bob',
        email: 'bob@example.com',
        message: 'Need help with hospital transfer request.',
        status: 'NEW',
      },
    })

    // Non-admin gets 403
    await request(app)
      .get('/api/v1/admin/contact-messages')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(403)

    await request(app)
      .patch(`/api/v1/admin/contact-messages/${msg.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ status: 'READ' })
      .expect(403)

    // Admin gets list
    const resList = await request(app)
      .get('/api/v1/admin/contact-messages')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    expect(resList.body.data.items).toHaveLength(1)
    expect(resList.body.data.items[0].id).toBe(msg.id)

    // Admin patches status
    const resPatch = await request(app)
      .patch(`/api/v1/admin/contact-messages/${msg.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'RESOLVED' })
      .expect(200)

    expect(resPatch.body.data.message.status).toBe('RESOLVED')

    const updated = await prisma.contactMessage.findUnique({ where: { id: msg.id } })
    expect(updated?.status).toBe('RESOLVED')
  })
})
