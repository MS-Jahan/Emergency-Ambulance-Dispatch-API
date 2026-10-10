import { env } from '../config/env'
import { logger } from './logger'
import { maskPhone } from './mask'

export interface SendSmsOptions {
  to: string
  text: string
}

export interface SendSmsResult {
  sent: boolean
  skipped?: 'not_configured'
  error?: string
}

export function normalizePhone(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.trim().replace(/[\s\-()]/g, '')
  if (!cleaned) return null

  // Bangladeshi local format: 01xxxxxxxxx (11 digits, valid operator prefix 013-019)
  if (/^01[3-9]\d{8}$/.test(cleaned)) {
    return `+88${cleaned}`
  }

  // Bangladeshi format with 88 country code without leading +: 8801xxxxxxxxx (13 digits)
  if (/^8801[3-9]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`
  }

  // Bangladeshi E.164 format: +8801xxxxxxxxx (14 chars)
  if (/^\+8801[3-9]\d{8}$/.test(cleaned)) {
    return cleaned
  }

  // Any other number starting with +880, 880, or 01 is an invalid Bangladeshi mobile number
  if (cleaned.startsWith('+880') || cleaned.startsWith('880') || cleaned.startsWith('01')) {
    return null
  }

  // Other international numbers starting with + and 8..15 digits (E.164)
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return cleaned
  }

  return null
}

export function isSmsConfigured(): boolean {
  if (env.SMS_PROVIDER === 'twilio') {
    return Boolean(
      env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_ACCOUNT_SID.trim().length > 0 &&
        env.TWILIO_AUTH_TOKEN &&
        env.TWILIO_AUTH_TOKEN.trim().length > 0 &&
        ((env.TWILIO_FROM && env.TWILIO_FROM.trim().length > 0) ||
          (env.TWILIO_MESSAGING_SERVICE_SID && env.TWILIO_MESSAGING_SERVICE_SID.trim().length > 0)),
    )
  }

  if (env.SMS_PROVIDER === 'webhook') {
    return Boolean(env.SMS_WEBHOOK_URL && env.SMS_WEBHOOK_URL.trim().length > 0)
  }

  return false
}

export async function sendSms({ to, text }: SendSmsOptions): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    logger.warn({ to: maskPhone(to) }, 'SMS not configured, skipping send')
    return { sent: false, skipped: 'not_configured' }
  }

  const targetPhone = normalizePhone(to) ?? to

  try {
    if (env.SMS_PROVIDER === 'twilio') {
      const accountSid = env.TWILIO_ACCOUNT_SID as string
      const authToken = env.TWILIO_AUTH_TOKEN as string
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`

      const params = new URLSearchParams({
        To: targetPhone,
        Body: text,
      })

      if (env.TWILIO_MESSAGING_SERVICE_SID && env.TWILIO_MESSAGING_SERVICE_SID.trim().length > 0) {
        params.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID.trim())
      } else if (env.TWILIO_FROM && env.TWILIO_FROM.trim().length > 0) {
        params.set('From', env.TWILIO_FROM.trim())
      }

      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        logger.error(
          { status: res.status, to: maskPhone(targetPhone) },
          `Twilio API returned error status ${res.status}`,
        )
        return { sent: false, error: `Twilio error: HTTP ${res.status} ${errText}`.trim() }
      }

      return { sent: true }
    }

    if (env.SMS_PROVIDER === 'webhook') {
      const webhookUrl = env.SMS_WEBHOOK_URL as string
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (env.SMS_WEBHOOK_TOKEN && env.SMS_WEBHOOK_TOKEN.trim().length > 0) {
        headers.Authorization = `Bearer ${env.SMS_WEBHOOK_TOKEN.trim()}`
      }

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: targetPhone,
          message: text,
          sender: env.SMS_SENDER_ID || null,
        }),
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        logger.error(
          { status: res.status, to: maskPhone(targetPhone) },
          `SMS Webhook returned error status ${res.status}`,
        )
        return { sent: false, error: `Webhook error: HTTP ${res.status} ${errText}`.trim() }
      }

      return { sent: true }
    }

    return { sent: false, skipped: 'not_configured' }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error({ to: maskPhone(targetPhone), error: errorMessage }, 'Failed to send SMS')
    return { sent: false, error: errorMessage }
  }
}
