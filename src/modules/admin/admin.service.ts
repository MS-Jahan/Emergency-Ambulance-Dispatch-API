import type { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../shared/AppError'
import { buildMeta } from '../../shared/paginate'
import { buildSummary, resolveRange } from './admin.reports'
import type {
  CreateDriverInput,
  ListAuditLogsQuery,
  ListFeedbackQuery,
  ListUsersQuery,
  ReportSummaryQuery,
  UpdateUserRoleInput,
} from './admin.validation'

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isVerified: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect

export async function createDriver(input: CreateDriverInput) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        password: await bcrypt.hash(input.password, 10),
        phone: input.phone,
        role: 'DRIVER',
        isVerified: true,
      },
      select: USER_LIST_SELECT,
    })
    const profile = await tx.driverProfile.create({
      data: {
        userId: user.id,
        licenseNumber: input.licenseNumber,
        status: 'OFFLINE',
      },
      select: { id: true, licenseNumber: true, status: true },
    })
    return { user, profile }
  })
}

export async function listUsers(query: ListUsersQuery) {
  const { page, limit, role, q, sortBy, sortOrder } = query

  const where: Prisma.UserWhereInput = { deletedAt: null }
  if (role) {
    where.role = role
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ]
  }

  const allowedSortFields = ['name', 'email', 'createdAt'] as const
  const sortField = allowedSortFields.find((f) => f === sortBy) ?? 'createdAt'

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}

export async function updateUserRole(userId: string, input: UpdateUserRoleInput) {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } })
  if (!user) {
    throw AppError.notFound('User not found')
  }
  if (user.role === input.role) {
    throw AppError.badRequest(`User already has the ${input.role} role`)
  }

  return prisma.$transaction(async (tx) => {
    // Switching someone into the driver role needs a profile to exist
    if (input.role === 'DRIVER') {
      const existingProfile = await tx.driverProfile.findUnique({ where: { userId } })
      if (!existingProfile) {
        await tx.driverProfile.create({
          data: {
            userId,
            licenseNumber: `PENDING-${userId.slice(-6).toUpperCase()}`,
            status: 'OFFLINE',
          },
        })
      }
    }
    return tx.user.update({
      where: { id: userId },
      data: { role: input.role },
      select: USER_LIST_SELECT,
    })
  })
}

export async function getDashboardStats() {
  const [
    totalUsers,
    totalPatients,
    totalDrivers,
    totalAmbulances,
    availableAmbulances,
    totalRequests,
    pendingRequests,
    completedRequests,
    cancelledRequests,
    totalRevenueAgg,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, role: 'PATIENT' } }),
    prisma.user.count({ where: { deletedAt: null, role: 'DRIVER' } }),
    prisma.ambulance.count({ where: { deletedAt: null } }),
    prisma.ambulance.count({ where: { deletedAt: null, status: 'AVAILABLE' } }),
    prisma.emergencyRequest.count(),
    prisma.emergencyRequest.count({ where: { status: 'PENDING' } }),
    prisma.emergencyRequest.count({ where: { status: 'COMPLETED' } }),
    prisma.emergencyRequest.count({ where: { status: 'CANCELLED' } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
  ])

  return {
    users: { total: totalUsers, patients: totalPatients, drivers: totalDrivers },
    ambulances: { total: totalAmbulances, available: availableAmbulances },
    requests: {
      total: totalRequests,
      pending: pendingRequests,
      completed: completedRequests,
      cancelled: cancelledRequests,
    },
    revenue: { paidTotal: totalRevenueAgg._sum.amount ?? 0 },
  }
}

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const { page, limit, requestId } = query

  const where: Prisma.RequestStatusLogWhereInput = {}
  if (requestId) {
    where.requestId = requestId
  }

  const [items, total] = await prisma.$transaction([
    prisma.requestStatusLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        requestId: true,
        fromStatus: true,
        toStatus: true,
        note: true,
        createdAt: true,
        actor: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.requestStatusLog.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}

const DAY_MS = 86_400_000

export async function getReportSummary(query: ReportSummaryQuery) {
  const { start, days } = resolveRange(query.from, query.to)
  const end = new Date(start.getTime() + days * DAY_MS)

  const rows = await prisma.emergencyRequest.findMany({
    where: { requestedAt: { gte: start, lt: end } },
    select: {
      requestedAt: true,
      assignedAt: true,
      priority: true,
      cancelReason: true,
      ambulance: { select: { type: true } },
    },
  })

  return buildSummary(
    rows.map((r) => ({
      requestedAt: r.requestedAt,
      assignedAt: r.assignedAt,
      priority: r.priority,
      cancelReason: r.cancelReason,
      ambulanceType: r.ambulance?.type ?? null,
    })),
    start,
    days,
  )
}

export async function listAllFeedback(query: ListFeedbackQuery) {
  const { page, limit } = query
  const where: Prisma.FeedbackWhereInput = { deletedAt: null }

  const [items, total] = await prisma.$transaction([
    prisma.feedback.findMany({
      where,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        requestId: true,
        driver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.feedback.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}
