import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { getFareEstimate } from './fares.controller'
import { fareEstimateQuerySchema } from './fares.validation'

export const faresRouter = Router()

faresRouter.get('/estimate', validate({ query: fareEstimateQuerySchema }), getFareEstimate)
