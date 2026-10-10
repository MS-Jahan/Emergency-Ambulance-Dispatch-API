import type { Request, Response } from 'express'
import { TRIP_RATES } from '../../lib/stripe'
import { sendResponse } from '../../shared/sendResponse'

export function getFareEstimate(req: Request, res: Response) {
  const type = req.query.type as 'BASIC' | 'ICU' | 'CARDIAC' | undefined

  if (type && TRIP_RATES[type] !== undefined) {
    return sendResponse(res, {
      message: 'Fare estimate calculated',
      data: {
        estimate: {
          type,
          amount: TRIP_RATES[type],
          currency: 'USD',
        },
      },
    })
  }

  return sendResponse(res, {
    message: 'Fare estimates list',
    data: {
      estimates: [
        { type: 'BASIC', amount: TRIP_RATES.BASIC, currency: 'USD' },
        { type: 'ICU', amount: TRIP_RATES.ICU, currency: 'USD' },
        { type: 'CARDIAC', amount: TRIP_RATES.CARDIAC, currency: 'USD' },
      ],
      rates: TRIP_RATES,
      currency: 'USD',
    },
  })
}
