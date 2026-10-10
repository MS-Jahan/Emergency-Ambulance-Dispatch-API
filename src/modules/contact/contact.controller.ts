import type { Request, Response } from 'express'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  createContactMessage,
  listContactMessages,
  updateContactMessageStatus,
} from './contact.service'
import type {
  CreateContactMessageInput,
  ListContactMessagesQuery,
  UpdateContactMessageStatusInput,
} from './contact.validation'

export const postContact = catchAsync(async (req: Request, res: Response) => {
  const result = await createContactMessage(req.body as CreateContactMessageInput)
  sendResponse(res, {
    statusCode: 201,
    message: 'Message received',
    data: { id: result.id },
  })
})

export const getContactMessages = catchAsync(async (req: Request, res: Response) => {
  const result = await listContactMessages(
    req.validatedQuery as unknown as ListContactMessagesQuery,
  )
  sendResponse(res, {
    message: 'Contact messages fetched',
    data: result,
  })
})

export const patchContactMessageStatus = catchAsync(async (req: Request, res: Response) => {
  const { status } = req.body as UpdateContactMessageStatusInput
  const message = await updateContactMessageStatus(req.params.id as string, status)
  sendResponse(res, {
    message: 'Contact message status updated',
    data: { message },
  })
})
