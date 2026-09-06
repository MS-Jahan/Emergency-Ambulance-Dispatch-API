import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { signAccessToken } from '../src/lib/tokens'

export const app = createApp()
export { prisma }

const TABLES = [
  'RequestStatusLog',
  'Feedback',
  'Payment',
  'EmergencyRequest',
  'DriverProfile',
  'RefreshToken',
  'Ambulance',
  'Hospital',
  'User',
] as const

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
}

interface UserFixture {
  token: string
  userId: string
  email: string
}

export async function createUser(
  role: 'PATIENT' | 'DRIVER' | 'ADMIN',
  overrides: { email?: string; password?: string; name?: string; licenseNumber?: string } = {},
): Promise<UserFixture> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const email = overrides.email ?? `${role.toLowerCase()}-${suffix}@test.local`
  const password = overrides.password ?? 'Password123'

  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `${role} ${suffix}`,
      email,
      password: await bcrypt.hash(password, 4),
      phone: '+8801700000000',
      role,
      isVerified: true,
    },
  })

  if (role === 'DRIVER') {
    await prisma.driverProfile.create({
      data: {
        userId: user.id,
        licenseNumber: overrides.licenseNumber ?? `DL-${suffix}`,
        status: 'AVAILABLE',
      },
    })
  }

  // Sign directly instead of calling the login endpoint so the suite never
  // trips the auth rate limiter
  return { token: signAccessToken(user.id, role), userId: user.id, email }
}

export async function createHospital(
  overrides: { name?: string; lat?: number; lng?: number } = {},
) {
  return prisma.hospital.create({
    data: {
      name: overrides.name ?? 'Test General Hospital',
      address: '1 Test Road, Dhaka',
      lat: overrides.lat ?? 23.75,
      lng: overrides.lng ?? 90.39,
      phone: '+8801700000001',
    },
  })
}

export async function createAmbulance(
  hospitalId: string,
  overrides: { type?: 'BASIC' | 'ICU' | 'CARDIAC'; plateNumber?: string } = {},
) {
  return prisma.ambulance.create({
    data: {
      plateNumber:
        overrides.plateNumber ?? `TST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      type: overrides.type ?? 'BASIC',
      status: 'AVAILABLE',
      homeHospitalId: hospitalId,
    },
  })
}

/** Builds a trip that has already gone through the whole lifecycle */
export async function createCompletedTrip(
  patientId: string,
  driverId: string,
  ambulanceId: string,
  overrides: { priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' } = {},
) {
  const request = await prisma.emergencyRequest.create({
    data: {
      patientId,
      pickupAddress: '42 Pickup Lane, Banani',
      pickupLat: 23.7936,
      pickupLng: 90.4043,
      priority: overrides.priority ?? 'NORMAL',
      status: 'COMPLETED',
      ambulanceId,
      driverId,
      assignedAt: new Date(),
      completedAt: new Date(),
    },
  })
  await prisma.requestStatusLog.create({
    data: {
      requestId: request.id,
      actorId: patientId,
      fromStatus: null,
      toStatus: 'PENDING',
      note: 'Request created',
    },
  })
  await prisma.requestStatusLog.create({
    data: {
      requestId: request.id,
      actorId: patientId,
      fromStatus: 'PENDING',
      toStatus: 'COMPLETED',
      note: 'Seeded complete',
    },
  })
  return request
}

export function stripeSignatureHeader(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const signature = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex')
  return `t=${ts},v1=${signature}`
}
