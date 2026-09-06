import type { DriverProfile, DriverStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../shared/AppError'
import type { UpdateDriverLocationInput, UpdateDriverStatusInput } from './driver.validation'

const PROFILE_SELECT = {
  id: true,
  userId: true,
  licenseNumber: true,
  status: true,
  currentLat: true,
  currentLng: true,
  ambulanceId: true,
  ambulance: { select: { id: true, plateNumber: true, type: true } },
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const

type ProfileWithRelations = PrismaDriverProfile

type PrismaDriverProfile = DriverProfile & {
  ambulance: { id: string; plateNumber: string; type: string } | null
  user: { id: string; name: string; email: string; phone: string | null }
}

async function getProfileOrThrow(userId: string): Promise<PrismaDriverProfile> {
  const profile = await prisma.driverProfile.findFirst({
    where: { userId, user: { deletedAt: null } },
    include: {
      ambulance: { select: { id: true, plateNumber: true, type: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  })
  if (!profile) {
    throw AppError.notFound('No driver profile exists for this account')
  }
  return profile
}

export async function getMyProfile(userId: string): Promise<ProfileWithRelations> {
  return getProfileOrThrow(userId)
}

export async function updateMyStatus(
  userId: string,
  input: UpdateDriverStatusInput,
): Promise<ProfileWithRelations> {
  const profile = await getProfileOrThrow(userId)

  // A driver in the middle of a trip cannot mark themselves offline
  if (profile.status === 'ON_TRIP' && input.status === 'OFFLINE') {
    throw AppError.conflict('You cannot go offline while on a trip')
  }

  const updated = await prisma.driverProfile.update({
    where: { id: profile.id },
    data: { status: input.status as DriverStatus },
    include: {
      ambulance: { select: { id: true, plateNumber: true, type: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  })
  return updated
}

export async function updateMyLocation(
  userId: string,
  input: UpdateDriverLocationInput,
): Promise<{ currentLat: number; currentLng: number }> {
  const profile = await getProfileOrThrow(userId)
  await prisma.driverProfile.update({
    where: { id: profile.id },
    data: { currentLat: input.lat, currentLng: input.lng },
  })
  return { currentLat: input.lat, currentLng: input.lng }
}
