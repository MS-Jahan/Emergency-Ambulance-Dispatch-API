import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../shared/AppError'
import { buildMeta } from '../../shared/paginate'
import type {
  CreateAmbulanceInput,
  ListAmbulancesQuery,
  NearbyQuery,
  UpdateAmbulanceInput,
} from './ambulance.validation'

const LIST_SELECT = {
  id: true,
  plateNumber: true,
  type: true,
  status: true,
  homeHospitalId: true,
  homeHospital: { select: { id: true, name: true } },
  createdAt: true,
} satisfies Prisma.AmbulanceSelect

export async function createAmbulance(input: CreateAmbulanceInput) {
  if (input.homeHospitalId) {
    const hospital = await prisma.hospital.findFirst({
      where: { id: input.homeHospitalId, deletedAt: null },
      select: { id: true },
    })
    if (!hospital) {
      throw AppError.badRequest('Home hospital does not exist', [
        { field: 'homeHospitalId', message: 'Hospital not found' },
      ])
    }
  }
  return prisma.ambulance.create({ data: input, select: LIST_SELECT })
}

export async function listAmbulances(query: ListAmbulancesQuery) {
  const { page, limit, sortBy, sortOrder, q, status, type } = query

  const where: Prisma.AmbulanceWhereInput = { deletedAt: null }
  if (q) {
    where.plateNumber = { contains: q, mode: 'insensitive' }
  }
  if (status) {
    where.status = status
  }
  if (type) {
    where.type = type
  }

  const allowedSortFields = ['plateNumber', 'status', 'createdAt'] as const
  const sortField = allowedSortFields.find((f) => f === sortBy) ?? 'createdAt'

  const [items, total] = await prisma.$transaction([
    prisma.ambulance.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ambulance.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}

export async function getAmbulance(id: string) {
  const ambulance = await prisma.ambulance.findFirst({
    where: { id, deletedAt: null },
    select: LIST_SELECT,
  })
  if (!ambulance) {
    throw AppError.notFound('Ambulance not found')
  }
  return ambulance
}

export async function updateAmbulance(id: string, input: UpdateAmbulanceInput) {
  await getAmbulance(id)
  if (input.homeHospitalId) {
    const hospital = await prisma.hospital.findFirst({
      where: { id: input.homeHospitalId, deletedAt: null },
      select: { id: true },
    })
    if (!hospital) {
      throw AppError.badRequest('Home hospital does not exist', [
        { field: 'homeHospitalId', message: 'Hospital not found' },
      ])
    }
  }
  return prisma.ambulance.update({ where: { id }, data: input, select: LIST_SELECT })
}

export async function softDeleteAmbulance(id: string) {
  await getAmbulance(id)
  await prisma.ambulance.update({ where: { id }, data: { deletedAt: new Date() } })
}

export async function findNearbyAmbulances(query: NearbyQuery) {
  const { lat, lng, radiusKm, type } = query

  // Bounding box prefilter in sql, then exact haversine distance in js
  const latDelta = radiusKm / 111.32
  const lngDelta = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))

  const where: Prisma.AmbulanceWhereInput = {
    deletedAt: null,
    status: 'AVAILABLE',
    homeHospital: { deletedAt: null },
  }
  if (type) {
    where.type = type
  }

  const candidates = await prisma.ambulance.findMany({
    where,
    select: {
      ...LIST_SELECT,
      homeHospital: { select: { id: true, name: true, lat: true, lng: true } },
    },
  })

  const inBox = candidates.filter((a) => {
    const h = a.homeHospital
    if (!h) return false
    return Math.abs(h.lat - lat) <= latDelta && Math.abs(h.lng - lng) <= lngDelta
  })

  return inBox
    .map((a) => {
      const h = a.homeHospital
      const distanceKm = h ? haversineKm(lat, lng, h.lat, h.lng) : Number.POSITIVE_INFINITY
      return { ...a, distanceKm: Number(distanceKm.toFixed(2)) }
    })
    .filter((a) => a.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
