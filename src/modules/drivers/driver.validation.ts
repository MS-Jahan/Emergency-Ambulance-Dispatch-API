import { z } from 'zod'

export const updateDriverStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'ON_TRIP', 'OFFLINE']),
})

export const updateDriverLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export type UpdateDriverStatusInput = z.infer<typeof updateDriverStatusSchema>
export type UpdateDriverLocationInput = z.infer<typeof updateDriverLocationSchema>
