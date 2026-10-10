import type { Request, Response } from 'express'
import { sendEmail } from '../../lib/email'
import { sendSms } from '../../lib/sms'

import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  createDriver,
  getDashboardStats,
  getReportSummary,
  listAllFeedback,
  listAuditLogs,
  listUsers,
  updateUserRole,
} from './admin.service'
import type {
  CreateDriverInput,
  ListAuditLogsQuery,
  ListFeedbackQuery,
  ListUsersQuery,
  ReportSummaryQuery,
  TestEmailInput,
  TestSmsInput,
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

export const getReport = catchAsync(async (req: Request, res: Response) => {
  const summary = await getReportSummary(req.validatedQuery as unknown as ReportSummaryQuery)
  sendResponse(res, { message: 'Report summary fetched', data: { summary } })
})

export const getFeedback = catchAsync(async (req: Request, res: Response) => {
  const result = await listAllFeedback(req.validatedQuery as unknown as ListFeedbackQuery)
  sendResponse(res, { message: 'Feedback fetched', data: result })
})

export const postTestEmail = catchAsync(async (req: Request, res: Response) => {
  const { to } = req.body as TestEmailInput
  const result = await sendEmail({
    to,
    subject: 'RapidAid Integration Test',
    html: '<p>This is a test email from RapidAid to verify your Resend integration settings.</p>',
    text: 'This is a test email from RapidAid to verify your Resend integration settings.',
  })
  sendResponse(res, {
    message: result.sent ? 'Test email sent successfully' : 'Test email dispatch completed',
    data: result,
  })
})

export const postTestSms = catchAsync(async (req: Request, res: Response) => {
  const { to } = req.body as TestSmsInput
  const result = await sendSms({
    to,
    text: 'RapidAid test message: Your SMS integration is working.',
  })
  sendResponse(res, {
    message: result.sent ? 'Test SMS sent successfully' : 'Test SMS dispatch completed',
    data: result,
  })
})
