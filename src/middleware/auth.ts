import type { Role } from '@prisma/client'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { verifyAccessToken } from '../lib/tokens'
import { AppError } from '../shared/AppError'

export interface AuthUser {
  id: string
  role: Role
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing bearer token')
  }
  const token = header.slice('Bearer '.length)

  let payload
  try {
    payload = verifyAccessToken(token)
  } catch {
    throw AppError.unauthorized('Invalid or expired token')
  }

  if (payload.type !== 'access') {
    throw AppError.unauthorized('Invalid token type')
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null },
    select: { id: true, role: true },
  })
  if (!user) {
    throw AppError.unauthorized('User no longer exists')
  }

  req.user = { id: user.id, role: user.role }
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw AppError.unauthorized()
    }
    if (!roles.includes(req.user.role)) {
      throw AppError.forbidden(
        `This action requires one of the following roles: ${roles.join(', ')}`,
      )
    }
    next()
  }
}
