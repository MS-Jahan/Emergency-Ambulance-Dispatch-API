import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { catchAsync } from '../shared/catchAsync'
import { sendResponse } from '../shared/sendResponse'

export const healthRouter = Router()

healthRouter.get(
  '/',
  catchAsync(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    sendResponse(res, { message: 'API and database are healthy', data: null })
  }),
)
