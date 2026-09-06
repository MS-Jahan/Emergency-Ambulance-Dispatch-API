import type { Request, Response } from 'express'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  createHospital,
  getHospital,
  listHospitals,
  softDeleteHospital,
  updateHospital,
} from './hospital.service'
import type {
  CreateHospitalInput,
  ListHospitalsQuery,
  UpdateHospitalInput,
} from './hospital.validation'

export const create = catchAsync(async (req: Request, res: Response) => {
  const hospital = await createHospital(req.body as CreateHospitalInput)
  sendResponse(res, { statusCode: 201, message: 'Hospital created', data: { hospital } })
})

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await listHospitals(req.validatedQuery as unknown as ListHospitalsQuery)
  sendResponse(res, { message: 'Hospitals fetched', data: result })
})

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const hospital = await getHospital(req.params.id as string)
  sendResponse(res, { message: 'Hospital fetched', data: { hospital } })
})

export const update = catchAsync(async (req: Request, res: Response) => {
  const hospital = await updateHospital(req.params.id as string, req.body as UpdateHospitalInput)
  sendResponse(res, { message: 'Hospital updated', data: { hospital } })
})

export const remove = catchAsync(async (req: Request, res: Response) => {
  await softDeleteHospital(req.params.id as string)
  sendResponse(res, { message: 'Hospital deleted', data: null })
})
