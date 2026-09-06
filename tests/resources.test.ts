import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, createAmbulance, createHospital, createUser, prisma, resetDb } from './helpers'

beforeEach(resetDb)

describe('hospitals', () => {
  it('creates, lists, and gets a hospital', async () => {
    const { token } = await createUser('ADMIN')

    const created = await request(app)
      .post('/api/v1/hospitals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'City Hospital',
        address: '12 City Road, Dhaka',
        lat: 23.75,
        lng: 90.39,
        phone: '+8801700000012',
      })
      .expect(201)

    const id = created.body.data.hospital.id as string

    const one = await request(app)
      .get(`/api/v1/hospitals/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(one.body.data.hospital.name).toBe('City Hospital')

    const list = await request(app)
      .get('/api/v1/hospitals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.data.items.length).toBe(1)
    expect(list.body.data.meta).toMatchObject({ page: 1, total: 1 })
  })

  it('supports search and pagination on the hospital list', async () => {
    const admin = await createUser('ADMIN')
    for (const name of ['Alpha Clinic', 'Beta Clinic', 'Gamma Care']) {
      await request(app)
        .post('/api/v1/hospitals')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name, address: 'Some Address Road', lat: 23.7, lng: 90.4, phone: '+8801700000000' })
        .expect(201)
    }

    const search = await request(app)
      .get('/api/v1/hospitals?q=beta')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(search.body.data.items).toHaveLength(1)
    expect(search.body.data.items[0].name).toBe('Beta Clinic')

    const paged = await request(app)
      .get('/api/v1/hospitals?page=2&limit=2&sortBy=name&sortOrder=asc')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
    expect(paged.body.data.items).toHaveLength(1)
    expect(paged.body.data.meta.totalPages).toBe(2)
  })

  it('soft deletes a hospital so it disappears from lists but stays in the database', async () => {
    const { token } = await createUser('ADMIN')
    const hospital = await createHospital({ name: 'Doomed Hospital' })

    await request(app)
      .delete(`/api/v1/hospitals/${hospital.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    await request(app)
      .get(`/api/v1/hospitals/${hospital.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
    const list = await request(app)
      .get('/api/v1/hospitals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.data.items).toHaveLength(0)

    const row = await prisma.hospital.findUnique({ where: { id: hospital.id } })
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })

  it('rejects hospital writes from non admins with 403', async () => {
    const { token } = await createUser('PATIENT')
    await request(app)
      .post('/api/v1/hospitals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope', address: 'somewhere street', lat: 1, lng: 1, phone: '+8801700000000' })
      .expect(403)
  })
})

describe('ambulances', () => {
  it('creates an ambulance tied to a hospital and filters the list by status and type', async () => {
    const hospital = await createHospital()
    const icu = await createAmbulance(hospital.id, { type: 'ICU' })
    await createAmbulance(hospital.id, { type: 'BASIC' })
    await createAmbulance(hospital.id, { type: 'BASIC' })

    const res = await request(app)
      .get('/api/v1/ambulances?status=AVAILABLE&type=ICU')
      .set('Authorization', `Bearer ${(await createUser('ADMIN')).token}`)
      .expect(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].id).toBe(icu.id)
  })

  it('searches by plate number', async () => {
    const hospital = await createHospital()
    const target = await createAmbulance(hospital.id, { plateNumber: 'ZZZ-9999' })
    await createAmbulance(hospital.id, { plateNumber: 'AAA-1111' })

    const res = await request(app)
      .get('/api/v1/ambulances?q=zzz')
      .set('Authorization', `Bearer ${(await createUser('ADMIN')).token}`)
      .expect(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].id).toBe(target.id)
  })

  it('finds nearby ambulances ordered by distance and respects the radius', async () => {
    const near = await createHospital({ name: 'Near Hospital', lat: 23.752, lng: 90.391 })
    const far = await createHospital({ name: 'Far Hospital', lat: 23.81, lng: 90.43 })
    await createAmbulance(near.id)
    await createAmbulance(far.id)

    const res = await request(app)
      .get('/api/v1/ambulances/nearby?lat=23.75&lng=90.39&radiusKm=5')
      .set('Authorization', `Bearer ${(await createUser('ADMIN')).token}`)
      .expect(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].homeHospital.name).toBe('Near Hospital')
    expect(res.body.data.items[0].distanceKm).toBeLessThan(5)
  })

  it('does not offer on trip or soft deleted ambulances in nearby search', async () => {
    const hospital = await createHospital({ lat: 23.75, lng: 90.39 })
    const busy = await createAmbulance(hospital.id)
    await prisma.ambulance.update({ where: { id: busy.id }, data: { status: 'ON_TRIP' } })
    const gone = await createAmbulance(hospital.id)
    await prisma.ambulance.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })
    await createAmbulance(hospital.id)

    const res = await request(app)
      .get('/api/v1/ambulances/nearby?lat=23.75&lng=90.39&radiusKm=10')
      .set('Authorization', `Bearer ${(await createUser('ADMIN')).token}`)
      .expect(200)
    expect(res.body.data.items).toHaveLength(1)
  })

  it('soft deletes an ambulance instead of removing the row', async () => {
    const { token } = await createUser('ADMIN')
    const hospital = await createHospital()
    const ambulance = await createAmbulance(hospital.id)

    await request(app)
      .delete(`/api/v1/ambulances/${ambulance.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    await request(app)
      .get(`/api/v1/ambulances/${ambulance.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
    const row = await prisma.ambulance.findUnique({ where: { id: ambulance.id } })
    expect(row).not.toBeNull()
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })
})
