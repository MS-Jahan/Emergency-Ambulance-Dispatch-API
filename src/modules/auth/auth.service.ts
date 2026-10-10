import crypto from 'node:crypto'
import { Role, type User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../../config/env'
import { isEmailConfigured, sendEmail } from '../../lib/email'
import { passwordResetEmail } from '../../lib/emailTemplates'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { normalizePhone } from '../../lib/sms'
import {
  hashToken,
  refreshExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/tokens'
import { AppError } from '../../shared/AppError'
import type {
  ForgotPasswordInput,
  GoogleLoginInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './auth.validation'

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isVerified: true,
  notifySms: true,
  notifyEmail: true,
  createdAt: true,
} as const

export interface AuthResult {
  user: Pick<
    User,
    | 'id'
    | 'name'
    | 'email'
    | 'phone'
    | 'role'
    | 'isVerified'
    | 'notifySms'
    | 'notifyEmail'
    | 'createdAt'
  >
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
  input: UpdateProfileInput,
): Promise<AuthResult['user']> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, notifySms: true },
  })
  if (!existing) {
    throw AppError.notFound('User not found')
  }

  const effectivePhone = input.phone !== undefined ? input.phone : existing.phone
  const effectiveNotifySms = input.notifySms !== undefined ? input.notifySms : existing.notifySms

  if (effectiveNotifySms) {
    if (!effectivePhone || !normalizePhone(effectivePhone)) {
      throw AppError.badRequest('A valid phone number is required to enable SMS notifications')
    }
  }

  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: PUBLIC_USER_SELECT,
  })
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  })
  if (!user) {
    throw AppError.notFound('User not found')
  }
  if (!user.password) {
    throw AppError.badRequest('Google-authenticated accounts do not have a password')
  }

  const matches = await bcrypt.compare(input.currentPassword, user.password)
  if (!matches) {
    throw AppError.badRequest('Current password is incorrect')
  }

  const newHash = await bcrypt.hash(input.newPassword, 10)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { password: newHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn({ email }, 'Password reset requested but email service is not configured')
    return
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), deletedAt: null },
    select: { id: true, name: true, email: true, password: true },
  })

  if (!user || !user.password) {
    return
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    }),
  ])

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`
  const { subject, html, text } = passwordResetEmail({ resetUrl, userName: user.name })
  await sendEmail({
    to: user.email,
    subject,
    html,
    text,
  })
}

export async function resetPasswordWithToken(input: ResetPasswordInput): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(input.token.trim()).digest('hex')

  const resetRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  if (
    !resetRecord ||
    resetRecord.usedAt ||
    resetRecord.expiresAt < new Date() ||
    resetRecord.user.deletedAt
  ) {
    throw AppError.badRequest('Invalid or expired token')
  }

  const newHash = await bcrypt.hash(input.newPassword, 10)
  const now = new Date()

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: { password: newHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { usedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: resetRecord.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ])
}
