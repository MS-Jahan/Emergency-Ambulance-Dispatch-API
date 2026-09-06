import { z } from 'zod'
import { paginationQuerySchema } from '../../shared/paginate'

export const createAmbulanceSchema = z.object({
  plateNumber: z
    .string()
    .min(4)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Plate number can only contain letters, numbers, and dashes'),
  type: z.enum(['BASIC', 'ICU', 'CARDIAC']).default('BASIC'),
  homeHospitalId: z.string().cuid().optional(),
  status: z.enum(['AVAILABLE', 'ON_TRIP', 'MAINTENANCE']).optional(),
})

export const updateAmbulanceSchema = z.object({
  type: z.enum(['BASIC', 'ICU', 'CARDIAC']).optional(),
  homeHospitalId: z.string().cuid().nullable().optional(),
  status: z.enum(['AVAILABLE', 'ON_TRIP', 'MAINTENANCE']).optional(),
})

export const listAmbulancesQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(20).optional(),
  status: z.enum(['AVAILABLE', 'ON_TRIP', 'MAINTENANCE']).optional(),
  type: z.enum(['BASIC', 'ICU', 'CARDIAC']).optional(),
})

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(50).default(10),
  type: z.enum(['BASIC', 'ICU', 'CARDIAC']).optional(),
})

export type CreateAmbulanceInput = z.infer<typeof createAmbulanceSchema>
export type UpdateAmbulanceInput = z.infer<typeof updateAmbulanceSchema>
export type ListAmbulancesQuery = z.infer<typeof listAmbulancesQuerySchema>
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>
