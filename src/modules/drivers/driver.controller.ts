import type { Request, Response } from 'express'
import { AppError } from '../../shared/AppError'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import { getMyProfile, updateMyLocation, updateMyStatus } from './driver.service'
import type { UpdateDriverLocationInput, UpdateDriverStatusInput } from './driver.validation'

export const getMe = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const profile = await getMyProfile(req.user.id)
  sendResponse(res, { message: 'Driver profile fetched', data: { profile } })
})

export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const profile = await updateMyStatus(req.user.id, req.body as UpdateDriverStatusInput)
  sendResponse(res, { message: 'Driver status updated', data: { profile } })
})

export const updateLocation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const location = await updateMyLocation(req.user.id, req.body as UpdateDriverLocationInput)
  sendResponse(res, { message: 'Driver location updated', data: { location } })
})
