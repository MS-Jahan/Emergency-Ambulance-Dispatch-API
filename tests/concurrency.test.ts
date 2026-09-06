import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, createAmbulance, createHospital, createUser, prisma, resetDb } from './helpers'

beforeEach(resetDb)

describe('dispatch concurrency', () => {
  it('lets only one of two simultaneous assignments claim the same ambulance', async () => {
    const hospital = await createHospital()
    const admin = await createUser('ADMIN')
    const patientA = await createUser('PATIENT')
    const patientB = await createUser('PATIENT')
    await createUser('DRIVER') // only one driver on purpose
    const ambulance = await createAmbulance(hospital.id)

    const createReq = async (token: string) => {
      const res = await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ pickupAddress: '1 Race Street', pickupLat: 23.7, pickupLng: 90.4 })
        .expect(201)
      return res.body.data.request.id as string
    }

    const requestA = await createReq(patientA.token)
    const requestB = await createReq(patientB.token)

    // Fire both admin assignments at the same time, no await between them
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/requests/${requestA}/assign`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ ambulanceId: ambulance.id }),
      request(app)
        .post(`/api/v1/requests/${requestB}/assign`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ ambulanceId: ambulance.id }),
    ])

    const outcomes = [resA.status, resB.status].sort()
    expect(outcomes).toEqual([201, 409])

    // Exactly one request ended up assigned and it owns the ambulance
    const assigned = [resA, resB].find((r) => r.status === 201)
    expect(assigned).toBeDefined()
    const assignedId = (assigned as { status: number }).status === resA.status ? requestA : requestB
    const winner = await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: assignedId } })
    expect(winner.status).toBe('ASSIGNED')
    expect(winner.ambulanceId).toBe(ambulance.id)

    // The loser request is untouched and no audit row was written for it
    const loserId = assignedId === requestA ? requestB : requestA
    const loser = await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: loserId } })
    expect(loser.status).toBe('PENDING')
    const loserLogs = await prisma.requestStatusLog.findMany({ where: { requestId: loserId } })
    expect(loserLogs.map((l) => l.toStatus)).toEqual(['PENDING'])
  })
})
