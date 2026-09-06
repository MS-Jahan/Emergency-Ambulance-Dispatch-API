import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../shared/AppError'
import { buildMeta } from '../../shared/paginate'
import type { CreateFeedbackInput } from './feedback.validation'

const FEEDBACK_SELECT = {
  id: true,
  requestId: true,
  rating: true,
  comment: true,
  createdAt: true,
  patient: { select: { id: true, name: true } },
  driver: { select: { id: true, name: true } },
} satisfies Prisma.FeedbackSelect

export async function createFeedback(patientId: string, input: CreateFeedbackInput) {
  const request = await prisma.emergencyRequest.findFirst({
    where: { id: input.requestId },
    select: { id: true, patientId: true, status: true, driverId: true },
  })
  if (!request) {
    throw AppError.notFound('Emergency request not found')
  }
  if (request.patientId !== patientId) {
    throw AppError.forbidden('You can only rate your own trips')
  }
  if (request.status !== 'COMPLETED') {
    throw AppError.conflict('You can only rate completed trips')
  }
  if (!request.driverId) {
    throw AppError.conflict('This trip has no driver to rate')
  }

  const existing = await prisma.feedback.findFirst({
    where: { requestId: request.id, patientId },
    select: { id: true },
  })
  if (existing) {
    throw AppError.conflict('You already rated this trip')
  }

  return prisma.feedback.create({
    data: {
      requestId: request.id,
      patientId,
      driverId: request.driverId,
      rating: input.rating,
      comment: input.comment,
    },
    select: FEEDBACK_SELECT,
  })
}

export async function listFeedbackForRequest(requestId: string) {
  return prisma.feedback.findMany({
    where: { requestId },
    select: FEEDBACK_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}
