import type { ContactStatus, Prisma } from '@prisma/client'
import { env } from '../../config/env'
import { isEmailConfigured, sendEmail } from '../../lib/email'
import { adminContactEmail } from '../../lib/emailTemplates'
import { logger } from '../../lib/logger'
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

  if (env.ADMIN_NOTIFY_EMAIL && isEmailConfigured()) {
    try {
      const emailContent = adminContactEmail({
        name: input.name,
        email: input.email,
        phone: input.phone,
        category: input.category,
        message: input.message,
      })
      await sendEmail({
        to: env.ADMIN_NOTIFY_EMAIL,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })
    } catch (err) {
      logger.error(
        { err, messageId: message.id },
        'Failed to send admin contact email notification',
      )
    }
  }

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
