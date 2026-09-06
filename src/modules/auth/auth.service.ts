import { Role, type User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import {
  hashToken,
  refreshExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/tokens'
import { AppError } from '../../shared/AppError'
import type {
  GoogleLoginInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
} from './auth.validation'

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isVerified: true,
  createdAt: true,
} as const

export interface AuthResult {
  user: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role' | 'isVerified' | 'createdAt'>
  accessToken: string
  refreshToken: string
}

async function issueTokens(user: Pick<User, 'id' | 'role'>): Promise<{
  accessToken: string
  refreshToken: string
}> {
  const accessToken = signAccessToken(user.id, user.role)
  const { token: refreshToken, jti } = signRefreshToken(user.id)
  await prisma.refreshToken.create({
    data: {
      id: jti,
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + refreshExpiry.ms),
    },
  })
  return { accessToken, refreshToken }
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const email = input.email.toLowerCase()

  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true },
  })
  if (existing) {
    throw AppError.conflict('An account with this email already exists')
  }

  // Self registration only creates patients, admins create staff accounts through admin endpoints
  const passwordHash = await bcrypt.hash(input.password, 10)
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      password: passwordHash,
      phone: input.phone,
      role: Role.PATIENT,
      isVerified: false,
    },
    select: PUBLIC_USER_SELECT,
  })

  const tokens = await issueTokens({ id: user.id, role: user.role })
  return { user, ...tokens }
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const email = input.email.toLowerCase()
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  })
  if (!user?.password) {
    throw AppError.unauthorized('Invalid email or password')
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password)
  if (!passwordMatches) {
    throw AppError.unauthorized('Invalid email or password')
  }

  const publicUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: PUBLIC_USER_SELECT,
  })
  const tokens = await issueTokens(user)
  return { user: publicUser, ...tokens }
}

export async function googleLogin(input: GoogleLoginInput): Promise<AuthResult> {
  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID)
  let ticket
  try {
    ticket = await client.verifyIdToken({
      idToken: input.idToken,
      audience: env.GOOGLE_CLIENT_ID,
    })
  } catch {
    throw AppError.unauthorized('Invalid Google ID token')
  }

  const payload = ticket.getPayload()
  if (!payload?.email) {
    throw AppError.unauthorized('Google token did not contain an email')
  }

  const email = payload.email.toLowerCase()
  let user = await prisma.user.findFirst({ where: { email, deletedAt: null } })

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: payload.name ?? email.split('@')[0] ?? 'Google user',
        email,
        googleId: payload.sub,
        role: Role.PATIENT,
        isVerified: true,
      },
    })
  } else if (!user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: payload.sub, isVerified: true },
    })
  }

  const publicUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: PUBLIC_USER_SELECT,
  })
  const tokens = await issueTokens(user)
  return { user: publicUser, ...tokens }
}

export async function rotateRefreshToken(input: RefreshTokenInput): Promise<AuthResult> {
  let payload
  try {
    payload = verifyRefreshToken(input.refreshToken)
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token')
  }
  if (payload.type !== 'refresh') {
    throw AppError.unauthorized('Invalid token type')
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(input.refreshToken) },
  })
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Refresh token is no longer valid')
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null },
  })
  if (!user) {
    throw AppError.unauthorized('User no longer exists')
  }

  // Rotate: revoke the used token and issue a fresh pair
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  })

  const publicUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: PUBLIC_USER_SELECT,
  })
  const tokens = await issueTokens(user)
  return { user: publicUser, ...tokens }
}

export async function revokeRefreshToken(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) {
    return
  }
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  })
  if (stored && !stored.revokedAt) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })
  }
}

export async function updateProfile(
  userId: string,
  input: { name?: string; phone?: string },
): Promise<AuthResult['user']> {
  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: PUBLIC_USER_SELECT,
  })
}
