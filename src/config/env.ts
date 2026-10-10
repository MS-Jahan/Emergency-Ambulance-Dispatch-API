import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  GOOGLE_CLIENT_ID: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_CURRENCY: z.string().default('usd'),

  // Public base url of this api, used to build stripe checkout callback urls
  APP_BASE_URL: z.string().url().default('http://localhost:5000'),

  // Public base url of the web frontend, stripe sends the payer back here after checkout
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Email configuration (Resend) - optional
  RESEND_API_KEY: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
  EMAIL_FROM: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
  // Shared with the web frontend so rate limits key on the visitor, not on the frontend's address.
  // Optional: when unset the api falls back to the connecting address.
  PROXY_SHARED_SECRET: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(16).optional(),
  ),

  ADMIN_NOTIFY_EMAIL: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().email().optional(),
  ),

  // SMS configuration - optional
  SMS_PROVIDER: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.enum(['twilio', 'webhook']).optional(),
  ),
  TWILIO_ACCOUNT_SID: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
  TWILIO_AUTH_TOKEN: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
  TWILIO_FROM: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
  TWILIO_MESSAGING_SERVICE_SID: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
  SMS_WEBHOOK_URL: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().url().optional(),
  ),
  SMS_WEBHOOK_TOKEN: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
  SMS_SENDER_ID: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ')
  throw new Error(`Invalid environment variables: ${missing}`)
}

export const env = parsed.data
export type Env = z.infer<typeof envSchema>
