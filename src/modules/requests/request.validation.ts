import { z } from 'zod'
import { paginationQuerySchema } from '../../shared/paginate'

export const createRequestSchema = z.object({
  pickupAddress: z.string().min(5).max(250),
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL']).default('NORMAL'),
  destinationHospitalId: z.string().cuid().optional(),
})

export const listRequestsQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum([
      'PENDING',
      'ASSIGNED',
      'EN_ROUTE_PICKUP',
      'PICKED_UP',
      'EN_ROUTE_HOSPITAL',
      'COMPLETED',
      'CANCELLED',
    ])
    .optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL']).optional(),
  q: z.string().max(250).optional(),
})

export const assignRequestSchema = z.object({
  ambulanceId: z.string().cuid(),
  driverId: z.string().cuid().optional(),
})

export const updateStatusSchema = z.object({
  status: z.enum(['EN_ROUTE_PICKUP', 'PICKED_UP', 'EN_ROUTE_HOSPITAL', 'COMPLETED']),
  note: z.string().max(250).optional(),
  destinationHospitalId: z.string().cuid().optional(),
})

export const cancelRequestSchema = z.object({
  cancelReason: z.string().min(3).max(250),
})

export type CreateRequestInput = z.infer<typeof createRequestSchema>
export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>
export type AssignRequestInput = z.infer<typeof assignRequestSchema>
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>
export type CancelRequestInput = z.infer<typeof cancelRequestSchema>
