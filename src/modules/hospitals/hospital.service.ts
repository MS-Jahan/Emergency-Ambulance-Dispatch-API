import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../shared/AppError'
import { buildMeta } from '../../shared/paginate'
import type {
  CreateHospitalInput,
  ListHospitalsQuery,
  UpdateHospitalInput,
} from './hospital.validation'

const LIST_SELECT = {
  id: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  phone: true,
  createdAt: true,
  _count: { select: { ambulances: true } },
} satisfies Prisma.HospitalSelect

export async function createHospital(input: CreateHospitalInput) {
  return prisma.hospital.create({ data: input, select: LIST_SELECT })
}

export async function listHospitals(query: ListHospitalsQuery) {
  const { page, limit, sortBy, sortOrder, q } = query

  const where: Prisma.HospitalWhereInput = { deletedAt: null }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
    ]
  }

  const allowedSortFields = ['name', 'createdAt'] as const
  const sortField = allowedSortFields.find((f) => f === sortBy) ?? 'createdAt'

  const [items, total] = await prisma.$transaction([
    prisma.hospital.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.hospital.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}

export async function getHospital(id: string) {
  const hospital = await prisma.hospital.findFirst({
    where: { id, deletedAt: null },
    select: LIST_SELECT,
  })
  if (!hospital) {
    throw AppError.notFound('Hospital not found')
  }
  return hospital
}

export async function updateHospital(id: string, input: UpdateHospitalInput) {
  await getHospital(id)
  return prisma.hospital.update({ where: { id }, data: input, select: LIST_SELECT })
}

export async function softDeleteHospital(id: string) {
  await getHospital(id)
  await prisma.hospital.update({ where: { id }, data: { deletedAt: new Date() } })
}
