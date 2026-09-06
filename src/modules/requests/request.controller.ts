import type { Request, Response } from 'express'
import { AppError } from '../../shared/AppError'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  assignRequest,
  cancelRequest,
  createRequest,
  getRequest,
  listMyAssignedRequests,
  listRequests,
  transitionStatus,
} from './request.service'
import type {
  AssignRequestInput,
  CancelRequestInput,
  CreateRequestInput,
  ListRequestsQuery,
  UpdateStatusInput,
} from './request.validation'

export const create = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const request = await createRequest(req.user.id, req.body as CreateRequestInput)
  sendResponse(res, { statusCode: 201, message: 'Emergency request created', data: { request } })
})

export const list = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const result = await listRequests(req.user, req.validatedQuery as unknown as ListRequestsQuery)
  sendResponse(res, { message: 'Requests fetched', data: result })
})

export const getOne = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const request = await getRequest(req.params.id as string, req.user)
  sendResponse(res, { message: 'Request fetched', data: { request } })
})

export const assign = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const request = await assignRequest(
    req.params.id as string,
    req.user.id,
    req.body as AssignRequestInput,
  )
  sendResponse(res, {
    statusCode: 201,
    message: 'Ambulance assigned to request',
    data: { request },
  })
})

export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const request = await transitionStatus(
    req.params.id as string,
    req.user,
    req.body as UpdateStatusInput,
  )
  sendResponse(res, { message: 'Request status updated', data: { request } })
})

export const cancel = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const request = await cancelRequest(
    req.params.id as string,
    req.user,
    req.body as CancelRequestInput,
  )
  sendResponse(res, { message: 'Request cancelled', data: { request } })
})

export const myAssigned = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const result = await listMyAssignedRequests(
    req.user.id,
    req.validatedQuery as unknown as ListRequestsQuery,
  )
  sendResponse(res, { message: 'Assigned requests fetched', data: result })
})
