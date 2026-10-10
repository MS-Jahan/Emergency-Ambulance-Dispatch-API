import type { Request, Response } from 'express'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import { getPublicStats } from './public.service'

export const getStats = catchAsync(async (_req: Request, res: Response) => {
  const stats = await getPublicStats()
  res.set('Cache-Control', 'public, max-age=60')
  sendResponse(res, { message: 'Public stats fetched', data: { stats } })
})
