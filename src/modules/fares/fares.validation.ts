import { z } from 'zod'

export const fareEstimateQuerySchema = z.object({
  type: z.enum(['BASIC', 'ICU', 'CARDIAC']).optional(),
})

export type FareEstimateQuery = z.infer<typeof fareEstimateQuerySchema>
