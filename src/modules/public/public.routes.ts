import { Router } from 'express'
import { getCapabilities, getStats } from './public.controller'

export const publicRouter = Router()

publicRouter.get('/stats', getStats)
publicRouter.get('/capabilities', getCapabilities)
