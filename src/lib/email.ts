import { env } from '../config/env'
import { logger } from './logger'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export interface SendEmailResult {
  sent: boolean
  skipped?: 'not_configured'
  error?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(
    env.RESEND_API_KEY &&
      env.RESEND_API_KEY.trim().length > 0 &&
      env.EMAIL_FROM &&
      env.EMAIL_FROM.trim().length > 0,
  )
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailOptions): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    logger.warn(
      { to, subject },
      'Email not configured (RESEND_API_KEY or EMAIL_FROM missing), skipping send',
    )
    return { sent: false, skipped: 'not_configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject,
        html,
        ...(text ? { text } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      logger.error(
        { status: res.status, to, subject },
        `Resend API returned error status ${res.status}`,
      )
      return { sent: false, error: `Resend error: HTTP ${res.status} ${errText}`.trim() }
    }

    return { sent: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error({ to, subject, error: errorMessage }, 'Failed to send email via Resend')
    return { sent: false, error: errorMessage }
  }
}
