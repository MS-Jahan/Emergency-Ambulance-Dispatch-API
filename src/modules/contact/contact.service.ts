import type { ContactStatus, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../shared/AppError'
import { buildMeta } from '../../shared/paginate'
import type { CreateContactMessageInput, ListContactMessagesQuery } from './contact.validation'

export async function createContactMessage(input: CreateContactMessageInput) {
  // Honeypot check: hidden website field must remain empty
  if (input.website && input.website.trim().length > 0) {
    throw AppError.badRequest('Invalid submission')
  }

  const message = await prisma.contactMessage.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ? input.phone : null,
      category: input.category,
      message: input.message,
      status: 'NEW',
    },
    select: { id: true },
  })

  return message
}

export async function listContactMessages(query: ListContactMessagesQuery) {
  const { page, limit, status, q } = query

  const where: Prisma.ContactMessageWhereInput = {}
  if (status) {
    where.status = status
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { message: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await prisma.$transaction([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contactMessage.count({ where }),
  ])

  return { items, meta: buildMeta(page, limit, total) }
}

export async function updateContactMessageStatus(id: string, status: ContactStatus) {
  const existing = await prisma.contactMessage.findUnique({
    where: { id },
  })
  if (!existing) {
    throw AppError.notFound('Contact message not found')
  }

  const updated = await prisma.contactMessage.update({
    where: { id },
    data: { status },
  })

  return updated
}
