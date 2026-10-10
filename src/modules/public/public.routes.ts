import { Router } from 'express'
import { getStats } from './public.controller'

export const publicRouter = Router()

publicRouter.get('/stats', getStats)
