import type { Prisma, RequestStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { AuthUser } from '../../middleware/auth'
import { AppError } from '../../shared/AppError'
import { buildMeta } from '../../shared/paginate'
import type {
  AssignRequestInput,
  CancelRequestInput,
  CreateRequestInput,
  ListRequestsQuery,
  UpdateStatusInput,
} from './request.validation'

// One directional transitions, anything not listed here is rejected server side
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE_PICKUP', 'CANCELLED'],
  EN_ROUTE_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['EN_ROUTE_HOSPITAL'],
  EN_ROUTE_HOSPITAL: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

const DETAIL_INCLUDE = {
  patient: { select: { id: true, name: true, email: true, phone: true } },
  driver: { select: { id: true, name: true, email: true, phone: true } },
  ambulance: { select: { id: true, plateNumber: true, type: true, status: true } },
  destinationHospital: { select: { id: true, name: true, address: true, phone: true } },
  statusLogs: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
      actorId: true,
    },
  },
} satisfies Prisma.EmergencyRequestInclude

type RequestDetail = Prisma.EmergencyRequestGetPayload<{ include: typeof DETAIL_INCLUDE }>

const LIST_SELECT = {
  id: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  priority: true,
  status: true,
  requestedAt: true,
  assignedAt: true,
  completedAt: true,
  ambulance: { select: { id: true, plateNumber: true, type: true } },
  destinationHospital: { select: { id: true, name: true } },
} satisfies Prisma.EmergencyRequestSelect

async function loadDetail(id: string): Promise<RequestDetail> {
  const request = await prisma.emergencyRequest.findFirst({
    where: { id },
    include: DETAIL_INCLUDE,
  })
  if (!request) {
    throw AppError.notFound('Emergency request not found')
  }
  return request
}

function assertCanView(request: RequestDetail, requester: AuthUser): void {
  const isOwner = request.patientId === requester.id
  const isAssignedDriver = request.driverId === requester.id
  const isAdmin = requester.role === 'ADMIN'
  if (!isOwner && !isAssignedDriver && !isAdmin) {
    throw AppError.forbidden('You can only view your own requests')
  }
}

function scopeForRequester(requester: AuthUser): Prisma.EmergencyRequestWhereInput {
  if (requester.role === 'ADMIN') {
    return {}
  }
  if (requester.role === 'DRIVER') {
    return { driverId: requester.id }
  }
  return { patientId: requester.id }
}

export async function createRequest(patientId: string, input: CreateRequestInput) {
  if (input.destinationHospitalId) {
    const hospital = await prisma.hospital.findFirst({
      where: { id: input.destinationHospitalId, deletedAt: null },
      select: { id: true },
    })
    if (!hospital) {
      throw AppError.badRequest('Destination hospital does not exist', [
        { field: 'destinationHospitalId', message: 'Hospital not found' },
      ])
    }
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.emergencyRequest.create({
      data: {
        patientId,
        pickupAddress: input.pickupAddress,
        pickupLat: input.pickupLat,
        pickupLng: input.pickupLng,
        priority: input.priority,
        destinationHospitalId: input.destinationHospitalId,
        status: 'PENDING',
      },
    })
    await tx.requestStatusLog.create({
      data: {
        requestId: request.id,
        actorId: patientId,
        fromStatus: null,
        toStatus: 'PENDING',
        note: 'Request created',
      },
    })
    return request
  })
}

export async function listRequests(requester: AuthUser, query: ListRequestsQuery) {
  const { page, limit, sortBy, sortOrder, status, priority, q } = query

  const where: Prisma.EmergencyRequestWhereInput = {
    ...scopeForRequester(requester),
  }
  if (status) {
    where.status = status
  }
  if (priority) {
    where.priority = priority
  }
  if (q) {
    where.pickupAddress = { contains: q, mode: 'insensitive' }
  }

  const allowedSortFields = ['requestedAt', 'priority', 'status'] as const
  const sortField = allowedSortFields.find((f) => f === sortBy) ?? 'requestedAt'

  const [items, total] = await prisma.$transaction([
    prisma.emergencyRequest.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emergencyRequest.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}

export async function getRequest(id: string, requester: AuthUser) {
  const request = await loadDetail(id)
  assertCanView(request, requester)
  return request
}

export async function assignRequest(requestId: string, adminId: string, input: AssignRequestInput) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.emergencyRequest.findFirst({ where: { id: requestId } })
    if (!request) {
      throw AppError.notFound('Emergency request not found')
    }
    if (request.status !== 'PENDING') {
      throw AppError.conflict(
        `Only pending requests can be assigned, this one is ${request.status}`,
      )
    }

    const ambulanceClaim = await tx.ambulance.updateMany({
      // Conditional update acts as the lock, if the ambulance was taken between
      // page load and this call the count comes back 0 and we bail out
      where: { id: input.ambulanceId, status: 'AVAILABLE', deletedAt: null },
      data: { status: 'ON_TRIP' },
    })
    if (ambulanceClaim.count === 0) {
      throw AppError.conflict('Ambulance is not available anymore')
    }

    let driverUserId = input.driverId
    if (!driverUserId) {
      const freeDriver = await tx.driverProfile.findFirst({
        where: { status: 'AVAILABLE', user: { deletedAt: null } },
        select: { userId: true },
        orderBy: { updatedAt: 'asc' },
      })
      driverUserId = freeDriver?.userId
    }

    if (!driverUserId) {
      throw AppError.conflict('No available drivers right now')
    }

    const driverClaim = await tx.driverProfile.updateMany({
      where: { userId: driverUserId, status: 'AVAILABLE' },
      data: { status: 'ON_TRIP', ambulanceId: input.ambulanceId },
    })
    if (driverClaim.count === 0) {
      throw AppError.conflict('Driver is not available anymore')
    }

    const updated = await tx.emergencyRequest.update({
      where: { id: requestId },
      data: {
        status: 'ASSIGNED',
        ambulanceId: input.ambulanceId,
        driverId: driverUserId,
        assignedAt: new Date(),
      },
      include: DETAIL_INCLUDE,
    })

    await tx.requestStatusLog.create({
      data: {
        requestId,
        actorId: adminId,
        fromStatus: 'PENDING',
        toStatus: 'ASSIGNED',
        note: input.driverId
          ? 'Ambulance and driver assigned'
          : 'Ambulance assigned, driver auto selected',
      },
    })

    return updated
  })
}

export async function transitionStatus(
  requestId: string,
  actor: AuthUser,
  input: UpdateStatusInput,
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.emergencyRequest.findFirst({ where: { id: requestId } })
    if (!request) {
      throw AppError.notFound('Emergency request not found')
    }

    const isAssignedDriver = request.driverId === actor.id
    const isAdmin = actor.role === 'ADMIN'
    if (!isAssignedDriver && !isAdmin) {
      throw AppError.forbidden('Only the assigned driver or an admin can update trip status')
    }

    const allowed = TRANSITIONS[request.status]
    if (!allowed.includes(input.status)) {
      throw AppError.conflict(`Cannot move request from ${request.status} to ${input.status}`)
    }

    const data: Prisma.EmergencyRequestUpdateInput = { status: input.status }
    if (input.destinationHospitalId) {
      data.destinationHospital = { connect: { id: input.destinationHospitalId } }
    }
    if (input.status === 'COMPLETED') {
      data.completedAt = new Date()
    }

    const updated = await tx.emergencyRequest.update({
      where: { id: requestId },
      data,
      include: DETAIL_INCLUDE,
    })

    // Trip finished, give the ambulance and driver back to the pool
    if (input.status === 'COMPLETED' && request.ambulanceId) {
      await tx.ambulance.update({
        where: { id: request.ambulanceId },
        data: { status: 'AVAILABLE' },
      })
      await tx.driverProfile.updateMany({
        where: { userId: request.driverId ?? '' },
        data: { status: 'AVAILABLE', ambulanceId: null },
      })
    }

    await tx.requestStatusLog.create({
      data: {
        requestId,
        actorId: actor.id,
        fromStatus: request.status,
        toStatus: input.status,
        note: input.note,
      },
    })

    return updated
  })
}

export async function cancelRequest(requestId: string, actor: AuthUser, input: CancelRequestInput) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.emergencyRequest.findFirst({ where: { id: requestId } })
    if (!request) {
      throw AppError.notFound('Emergency request not found')
    }

    const isOwner = request.patientId === actor.id
    if (!isOwner && actor.role !== 'ADMIN') {
      throw AppError.forbidden(
        'Only the patient who created this request or an admin can cancel it',
      )
    }

    const cancellable: RequestStatus[] = ['PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP']
    if (!cancellable.includes(request.status)) {
      throw AppError.conflict(`A request that is ${request.status} can no longer be cancelled`)
    }

    if (request.ambulanceId) {
      await tx.ambulance.update({
        where: { id: request.ambulanceId },
        data: { status: 'AVAILABLE' },
      })
      await tx.driverProfile.updateMany({
        where: { userId: request.driverId ?? '' },
        data: { status: 'AVAILABLE', ambulanceId: null },
      })
    }

    const updated = await tx.emergencyRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED', cancelReason: input.cancelReason },
      include: DETAIL_INCLUDE,
    })

    await tx.requestStatusLog.create({
      data: {
        requestId,
        actorId: actor.id,
        fromStatus: request.status,
        toStatus: 'CANCELLED',
        note: input.cancelReason,
      },
    })

    return updated
  })
}

export async function listMyAssignedRequests(driverId: string, query: ListRequestsQuery) {
  const { page, limit } = query

  const where: Prisma.EmergencyRequestWhereInput = { driverId }

  const [items, total] = await prisma.$transaction([
    prisma.emergencyRequest.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { requestedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emergencyRequest.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}
