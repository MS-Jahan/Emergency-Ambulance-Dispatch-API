import { Router } from 'express'
import { contactLimiter } from '../../middleware/rateLimiter'
import { validate } from '../../middleware/validate'
import { postContact } from './contact.controller'
import { createContactMessageSchema } from './contact.validation'

export const contactRouter = Router()

contactRouter.post('/', contactLimiter, validate({ body: createContactMessageSchema }), postContact)
