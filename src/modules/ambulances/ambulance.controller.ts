import type { Request, Response } from 'express'
import { catchAsync } from '../../shared/catchAsync'
import { sendResponse } from '../../shared/sendResponse'
import {
  createAmbulance,
  findNearbyAmbulances,
  getAmbulance,
  listAmbulances,
  softDeleteAmbulance,
  updateAmbulance,
} from './ambulance.service'
import type {
  CreateAmbulanceInput,
  ListAmbulancesQuery,
  NearbyQuery,
  UpdateAmbulanceInput,
} from './ambulance.validation'

export const create = catchAsync(async (req: Request, res: Response) => {
  const ambulance = await createAmbulance(req.body as CreateAmbulanceInput)
  sendResponse(res, { statusCode: 201, message: 'Ambulance created', data: { ambulance } })
})

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await listAmbulances(req.validatedQuery as unknown as ListAmbulancesQuery)
  sendResponse(res, { message: 'Ambulances fetched', data: result })
})

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const ambulance = await getAmbulance(req.params.id as string)
  sendResponse(res, { message: 'Ambulance fetched', data: { ambulance } })
})

export const update = catchAsync(async (req: Request, res: Response) => {
  const ambulance = await updateAmbulance(req.params.id as string, req.body as UpdateAmbulanceInput)
  sendResponse(res, { message: 'Ambulance updated', data: { ambulance } })
})

export const remove = catchAsync(async (req: Request, res: Response) => {
  await softDeleteAmbulance(req.params.id as string)
  sendResponse(res, { message: 'Ambulance deleted', data: null })
})

export const nearby = catchAsync(async (req: Request, res: Response) => {
  const result = await findNearbyAmbulances(req.validatedQuery as unknown as NearbyQuery)
  sendResponse(res, { message: 'Nearby ambulances fetched', data: { items: result } })
})
