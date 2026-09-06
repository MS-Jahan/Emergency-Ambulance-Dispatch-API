import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'

export interface AccessTokenPayload {
  sub: string
  role: 'PATIENT' | 'DRIVER' | 'ADMIN'
  type: 'access'
}

export interface RefreshTokenPayload {
  sub: string
  type: 'refresh'
  jti: string
}

const accessExpiresInSeconds = parseDuration(env.JWT_ACCESS_EXPIRES_IN)
const refreshExpiresInSeconds = parseDuration(env.JWT_REFRESH_EXPIRES_IN)

export const refreshExpiry = {
  seconds: refreshExpiresInSeconds,
  ms: refreshExpiresInSeconds * 1000,
}

export function signAccessToken(userId: string, role: AccessTokenPayload['role']): string {
  const payload: AccessTokenPayload = { sub: userId, role, type: 'access' }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: accessExpiresInSeconds,
  })
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = crypto.randomUUID()
  const payload: RefreshTokenPayload = { sub: userId, type: 'refresh', jti }
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: refreshExpiresInSeconds,
  })
  return { token, jti }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value)
  if (!match) {
    throw new Error(`Invalid JWT expiry format: ${value}`)
  }
  const amount = Number(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
  const multiplier = unit !== undefined ? multipliers[unit] : undefined
  if (multiplier === undefined) {
    throw new Error(`Invalid JWT expiry unit: ${value}`)
  }
  return amount * multiplier
}
