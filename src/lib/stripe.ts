import Stripe from 'stripe'
import { env } from '../config/env'

export const stripe = new Stripe(env.STRIPE_SECRET_KEY)

// Flat trip rates by ambulance type, in the checkout currency
export const TRIP_RATES: Record<'BASIC' | 'ICU' | 'CARDIAC', number> = {
  BASIC: 15,
  ICU: 35,
  CARDIAC: 60,
}
