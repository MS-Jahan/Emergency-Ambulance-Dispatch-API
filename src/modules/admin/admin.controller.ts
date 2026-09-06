import type { Request, Response } from 'express'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  createDriver,
  getDashboardStats,
  listAuditLogs,
  listUsers,
  updateUserRole,
} from './admin.service'
import type {
  CreateDriverInput,
  ListAuditLogsQuery,
  ListUsersQuery,
  UpdateUserRoleInput,
} from './admin.validation'

export const postDriver = catchAsync(async (req: Request, res: Response) => {
  const result = await createDriver(req.body as CreateDriverInput)
  sendResponse(res, { statusCode: 201, message: 'Driver account created', data: result })
})

export const getUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await listUsers(req.validatedQuery as unknown as ListUsersQuery)
  sendResponse(res, { message: 'Users fetched', data: result })
})

export const patchUserRole = catchAsync(async (req: Request, res: Response) => {
  const user = await updateUserRole(req.params.id as string, req.body as UpdateUserRoleInput)
  sendResponse(res, { message: 'User role updated', data: { user } })
})

export const getStats = catchAsync(async (_req: Request, res: Response) => {
  const stats = await getDashboardStats()
  sendResponse(res, { message: 'Dashboard stats fetched', data: { stats } })
})

export const getAuditLogs = catchAsync(async (req: Request, res: Response) => {
  const result = await listAuditLogs(req.validatedQuery as unknown as ListAuditLogsQuery)
  sendResponse(res, { message: 'Audit logs fetched', data: result })
})
