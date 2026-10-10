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

async function setupDispatchFixture() {
  const hospital = await createHospital()
  const admin = await createUser('ADMIN')
  const patient = await createUser('PATIENT')
  const driver = await createUser('DRIVER')
  const ambulance = await createAmbulance(hospital.id)
  return { hospital, admin, patient, driver, ambulance }
}

async function createPendingRequest(patientToken: string) {
  const res = await request(app)
    .post('/api/v1/requests')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({
      pickupAddress: 'House 42, Road 11, Banani',
      pickupLat: 23.7936,
      pickupLng: 90.4043,
      priority: 'HIGH',
    })
    .expect(201)
  return res.body.data.request.id as string
}

describe('emergency requests: creation and listing', () => {
  it('creates a pending request with an audit log entry in the same transaction', async () => {
    const { patient } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)

    const logs = await prisma.requestStatusLog.findMany({ where: { requestId } })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.toStatus).toBe('PENDING')
  })

  it('supports pagination, status filter, priority filter, search, and sorting', async () => {
    const { patient, admin } = await setupDispatchFixture()
    for (const [i, priority] of ['NORMAL', 'HIGH', 'CRITICAL', 'NORMAL'].entries()) {
      await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({
          pickupAddress: `Pickup point number ${i}`,
          pickupLat: 23.7,
          pickupLng: 90.4,
          priority,
        })
        .expect(201)
    }

    const paged = await request(app)
      .get('/api/v1/requests?page=1&limit=2')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(paged.body.data.items).toHaveLength(2)
    expect(paged.body.data.meta.total).toBe(4)
    expect(paged.body.data.meta.totalPages).toBe(2)

    const filtered = await request(app)
      .get('/api/v1/requests?priority=CRITICAL')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(filtered.body.data.items).toHaveLength(1)

    const searched = await request(app)
      .get('/api/v1/requests?q=number 3')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(searched.body.data.items).toHaveLength(1)

    const sorted = await request(app)
      .get('/api/v1/requests?sortBy=priority&sortOrder=asc&limit=10')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(sorted.body.data.items[0].priority).toBe('CRITICAL')
  })

  it('scopes the list so a patient only sees their own requests', async () => {
    const { patient } = await setupDispatchFixture()
    const other = await createUser('PATIENT')
    await createPendingRequest(patient.token)
    await createPendingRequest(other.token)

    const res = await request(app)
      .get('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200)
    expect(res.body.data.meta.total).toBe(1)
  })

  it('hides request details from unrelated users with 403', async () => {
    const { patient, ambulance, driver } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)
    const outsider = await createUser('PATIENT')

    await request(app)
      .get(`/api/v1/requests/${requestId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    // The assigned driver can see it after assignment
    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${(await createUser('ADMIN')).token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    await request(app)
      .get(`/api/v1/requests/${requestId}`)
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(200)
  })
})

describe('assignment: transaction safety', () => {
  it('assigns an ambulance and auto picks an available driver', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)

    const res = await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id })
      .expect(201)

    expect(res.body.data.request.status).toBe('ASSIGNED')
    expect(res.body.data.request.driverId).toBe(driver.userId)
    expect(res.body.data.request.ambulanceId).toBe(ambulance.id)

    const amb = await prisma.ambulance.findUniqueOrThrow({ where: { id: ambulance.id } })
    expect(amb.status).toBe('ON_TRIP')
  })

  it('rejects assigning the same ambulance to two requests with 409', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const first = await createPendingRequest(patient.token)
    await request(app)
      .post(`/api/v1/requests/${first}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    const secondPatient = await createUser('PATIENT')
    const second = await createPendingRequest(secondPatient.token)

    const res = await request(app)
      .post(`/api/v1/requests/${second}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id })
      .expect(409)
    expect(res.body.success).toBe(false)

    // The failed assignment left no partial state behind
    const req2 = await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: second } })
    expect(req2.status).toBe('PENDING')
    expect(req2.ambulanceId).toBeNull()
  })

  it('rolls back cleanly when the chosen driver disappears mid assignment', async () => {
    const { admin, patient, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)

    // Flip the ambulance to MAINTENANCE right before assigning so the claim fails
    await prisma.ambulance.update({
      where: { id: ambulance.id },
      data: { status: 'MAINTENANCE' },
    })

    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id })
      .expect(409)

    const logs = await prisma.requestStatusLog.findMany({ where: { requestId } })
    expect(logs).toHaveLength(1) // only the creation entry, no ASSIGNED entry
  })

  it('refuses to assign a request that is not pending', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)
    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id })
      .expect(409)
  })
})

describe('status transitions: state machine and audit', () => {
  it('walks the full legal path and records every audit log row', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)
    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    const steps = ['EN_ROUTE_PICKUP', 'PICKED_UP', 'EN_ROUTE_HOSPITAL', 'COMPLETED'] as const
    for (const status of steps) {
      await request(app)
        .patch(`/api/v1/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ status })
        .expect(200)
    }

    const logs = await prisma.requestStatusLog.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    })
    expect(logs.map((l) => l.toStatus)).toEqual([
      'PENDING',
      'ASSIGNED',
      'EN_ROUTE_PICKUP',
      'PICKED_UP',
      'EN_ROUTE_HOSPITAL',
      'COMPLETED',
    ])

    const req = await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: requestId } })
    expect(req.completedAt).toBeInstanceOf(Date)
  })

  it('rejects illegal transitions like ASSIGNED to COMPLETED with 409', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)
    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    const res = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ status: 'COMPLETED' })
      .expect(409)
    expect(res.body.message).toContain('Cannot move request')
  })

  it('blocks a driver who is not assigned to the request', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)
    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    const other = await createUser('DRIVER')
    await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ status: 'EN_ROUTE_PICKUP' })
      .expect(403)
  })

  it('returns the ambulance and driver to available after completion', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)
    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    for (const status of [
      'EN_ROUTE_PICKUP',
      'PICKED_UP',
      'EN_ROUTE_HOSPITAL',
      'COMPLETED',
    ] as const) {
      await request(app)
        .patch(`/api/v1/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ status })
        .expect(200)
    }

    const amb = await prisma.ambulance.findUniqueOrThrow({ where: { id: ambulance.id } })
    const prof = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: driver.userId } })
    expect(amb.status).toBe('AVAILABLE')
    expect(prof.status).toBe('AVAILABLE')
  })

  it('lets the patient cancel a pending request and frees the resources when already assigned', async () => {
    const { admin, patient, driver, ambulance } = await setupDispatchFixture()
    const requestId = await createPendingRequest(patient.token)

    await request(app)
      .post(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ambulanceId: ambulance.id, driverId: driver.userId })
      .expect(201)

    const res = await request(app)
      .post(`/api/v1/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ cancelReason: 'Family took the patient to hospital by car' })
      .expect(200)
    expect(res.body.data.request.status).toBe('CANCELLED')

    const amb = await prisma.ambulance.findUniqueOrThrow({ where: { id: ambulance.id } })
    expect(amb.status).toBe('AVAILABLE')
  })

  it('refuses to cancel a trip that is already on the way to the hospital', async () => {
    const { patient, driver } = await setupDispatchFixture()
    const hospital = await createHospital()
    const ambulance = await createAmbulance(hospital.id)
    await prisma.ambulance.update({ where: { id: ambulance.id }, data: { status: 'ON_TRIP' } })
    await prisma.driverProfile.update({
      where: { userId: driver.userId },
      data: { status: 'ON_TRIP', ambulanceId: ambulance.id },
    })
    const trip = await createCompletedTrip(patient.userId, driver.userId, ambulance.id)
    await prisma.emergencyRequest.update({
      where: { id: trip.id },
      data: { status: 'EN_ROUTE_HOSPITAL' },
    })

    await request(app)
      .post(`/api/v1/requests/${trip.id}/cancel`)
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ cancelReason: 'too late' })
      .expect(409)
  })

  it('lists assigned trips for the driver through my-assigned', async () => {
    const { patient, driver, ambulance } = await setupDispatchFixture()
    await createCompletedTrip(patient.userId, driver.userId, ambulance.id)
    await createCompletedTrip(patient.userId, driver.userId, ambulance.id)

    const res = await request(app)
      .get('/api/v1/requests/my-assigned')
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(200)
    expect(res.body.data.meta.total).toBe(2)
  })

  it('returns destinationHospital with address, lat, lng and phone on request detail', async () => {
    const { patient, hospital } = await setupDispatchFixture()
    const resCreate = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        pickupAddress: 'House 42, Road 11, Banani',
        pickupLat: 23.7936,
        pickupLng: 90.4043,
        priority: 'HIGH',
        destinationHospitalId: hospital.id,
      })
      .expect(201)

    const requestId = resCreate.body.data.request.id
    const res = await request(app)
      .get(`/api/v1/requests/${requestId}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200)

    const hosp = res.body.data.request.destinationHospital
    expect(hosp).toBeDefined()
    expect(hosp.id).toBe(hospital.id)
    expect(hosp.name).toBe(hospital.name)
    expect(hosp.address).toBe(hospital.address)
    expect(typeof hosp.lat).toBe('number')
    expect(typeof hosp.lng).toBe('number')
    expect(hosp.phone).toBe(hospital.phone)
  })

  it('creates a request with intake fields and returns them in list and detail', async () => {
    const { patient } = await setupDispatchFixture()
    const resCreate = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        pickupAddress: 'House 42, Road 11, Banani',
        pickupLat: 23.7936,
        pickupLng: 90.4043,
        priority: 'CRITICAL',
        requestedAmbulanceType: 'ICU',
        patientName: 'Jane Doe',
        patientAge: 42,
        notes: 'Severe chest pain, oxygen required',
        callbackPhone: '+8801812345678',
      })
      .expect(201)

    const req = resCreate.body.data.request
    expect(req.requestedAmbulanceType).toBe('ICU')
    expect(req.patientName).toBe('Jane Doe')
    expect(req.patientAge).toBe(42)
    expect(req.notes).toBe('Severe chest pain, oxygen required')
    expect(req.callbackPhone).toBe('+8801812345678')

    // Detail check
    const resDetail = await request(app)
      .get(`/api/v1/requests/${req.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200)
    const detail = resDetail.body.data.request
    expect(detail.requestedAmbulanceType).toBe('ICU')
    expect(detail.patientName).toBe('Jane Doe')
    expect(detail.patientAge).toBe(42)
    expect(detail.notes).toBe('Severe chest pain, oxygen required')
    expect(detail.callbackPhone).toBe('+8801812345678')

    // List check
    const resList = await request(app)
      .get('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200)
    const listItem = resList.body.data.items[0]
    expect(listItem.requestedAmbulanceType).toBe('ICU')
    expect(listItem.patientName).toBe('Jane Doe')
    expect(listItem.patientAge).toBe(42)
    expect(listItem.notes).toBe('Severe chest pain, oxygen required')
    expect(listItem.callbackPhone).toBe('+8801812345678')
  })

  it('defaults patientName and callbackPhone from account when omitted', async () => {
    const { patient } = await setupDispatchFixture()
    const resCreate = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        pickupAddress: 'House 42, Road 11, Banani',
        pickupLat: 23.7936,
        pickupLng: 90.4043,
        priority: 'NORMAL',
      })
      .expect(201)

    const req = resCreate.body.data.request
    expect(req.patientName).toBe(patient.name)
    expect(req.callbackPhone).toBe(patient.phone)
    expect(req.requestedAmbulanceType).toBeNull()
    expect(req.patientAge).toBeNull()
    expect(req.notes).toBeNull()
  })

  it('validates intake fields on request creation', async () => {
    const { patient } = await setupDispatchFixture()
    await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        pickupAddress: 'House 42, Road 11, Banani',
        pickupLat: 23.7936,
        pickupLng: 90.4043,
        requestedAmbulanceType: 'INVALID_TYPE',
      })
      .expect(400)

    await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        pickupAddress: 'House 42, Road 11, Banani',
        pickupLat: 23.7936,
        pickupLng: 90.4043,
        patientAge: 150,
      })
      .expect(400)

    await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        pickupAddress: 'House 42, Road 11, Banani',
        pickupLat: 23.7936,
        pickupLng: 90.4043,
        callbackPhone: '123',
      })
      .expect(400)
  })
})
