import { z } from 'zod'
import { paginationQuerySchema } from '../../shared/paginate'

export const createHospitalSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().min(5).max(250),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().min(6).max(20),
})

export const updateHospitalSchema = createHospitalSchema.partial()

export const listHospitalsQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(120).optional(),
})

export type CreateHospitalInput = z.infer<typeof createHospitalSchema>
export type UpdateHospitalInput = z.infer<typeof updateHospitalSchema>
export type ListHospitalsQuery = z.infer<typeof listHospitalsQuerySchema>
