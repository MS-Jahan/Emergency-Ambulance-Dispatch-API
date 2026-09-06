import { Router } from 'express'
import { authenticate, requireRole } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { create, listForRequest } from './feedback.controller'
import { createFeedbackSchema } from './feedback.validation'

export const feedbackRouter = Router()

feedbackRouter.use(authenticate)

feedbackRouter.post('/', requireRole('PATIENT'), validate({ body: createFeedbackSchema }), create)
feedbackRouter.get('/request/:requestId', listForRequest)
