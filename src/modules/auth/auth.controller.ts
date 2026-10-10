import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../shared/AppError'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  changePassword,
  googleLogin,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeRefreshToken,
  rotateRefreshToken,
  updateProfile,
} from './auth.service'
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  GoogleLoginInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './auth.validation'

export const register = catchAsync(async (req: Request, res: Response) => {
  const result = await registerUser(req.body as RegisterInput)
  sendResponse(res, { statusCode: 201, message: 'Account created', data: result })
})

export const login = catchAsync(async (req: Request, res: Response) => {
  const result = await loginUser(req.body as LoginInput)
  sendResponse(res, { message: 'Logged in', data: result })
})

export const googleAuth = catchAsync(async (req: Request, res: Response) => {
  const result = await googleLogin(req.body as GoogleLoginInput)
  sendResponse(res, { message: 'Logged in with Google', data: result })
})

export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const result = await rotateRefreshToken(req.body as RefreshTokenInput)
  sendResponse(res, { message: 'Token refreshed', data: result })
})

export const logout = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string }
  await revokeRefreshToken(refreshToken)
  sendResponse(res, { message: 'Logged out', data: null })
})

export const getMe = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw AppError.unauthorized()
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isVerified: true,
      createdAt: true,
    },
  })
  sendResponse(res, { message: 'Profile fetched', data: { user } })
})

export const updateMe = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw AppError.unauthorized()
  }
  const user = await updateProfile(req.user.id, req.body as UpdateProfileInput)
  sendResponse(res, { message: 'Profile updated', data: { user } })
})

export const changeMyPassword = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw AppError.unauthorized()
  }
  await changePassword(req.user.id, req.body as ChangePasswordInput)
  sendResponse(res, { message: 'Password updated successfully', data: null })
})

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordInput
  await requestPasswordReset(email)
  sendResponse(res, {
    message: 'If an account exists for that address, a reset link has been sent',
    data: null,
  })
})

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await resetPasswordWithToken(req.body as ResetPasswordInput)
  sendResponse(res, { message: 'Password has been reset successfully', data: null })
})
