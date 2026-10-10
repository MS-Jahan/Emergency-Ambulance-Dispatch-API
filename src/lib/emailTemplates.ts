export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export interface PasswordResetEmailParams {
  resetUrl: string
  userName?: string | null
}

export function passwordResetEmail({ resetUrl, userName }: PasswordResetEmailParams): {
  subject: string
  html: string
  text: string
} {
  const safeName = userName ? escapeHtml(userName) : 'there'
  const subject = 'Reset your password - RapidAid'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px;">
    <h2 style="color: #111827; margin-top: 0; margin-bottom: 16px;">Password Reset Request</h2>
    <p style="font-size: 15px; line-height: 1.5; margin-bottom: 16px;">Hello ${safeName},</p>
    <p style="font-size: 15px; line-height: 1.5; margin-bottom: 24px;">We received a request to reset your password for your RapidAid account. Click the button below to choose a new password. This link is valid for 30 minutes.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(resetUrl)}" style="background-color: #dc2626; color: #ffffff; display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">Reset Password</a>
    </div>
    <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin-top: 24px;">If you did not request this, you can safely ignore this email. Your password will remain unchanged.</p>
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
      RapidAid Emergency Ambulance Dispatch
    </div>
  </div>
</body>
</html>`

  const text = `Hello ${userName || 'there'},\n\nWe received a request to reset your password for your RapidAid account.\n\nClick the link below to choose a new password (valid for 30 minutes):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.\n\nRapidAid Emergency Ambulance Dispatch`

  return { subject, html, text }
}

export interface AdminContactEmailParams {
  name: string
  email: string
  phone?: string | null
  category: string
  message: string
}

export function adminContactEmail({
  name,
  email,
  phone,
  category,
  message,
}: AdminContactEmailParams): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safePhone = phone ? escapeHtml(phone) : 'Not provided'
  const safeCategory = escapeHtml(category)
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>')
  const subject = `[RapidAid Contact] New submission: ${name} (${category})`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px;">
    <h2 style="color: #111827; margin-top: 0; margin-bottom: 16px;">New Contact Submission</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 6px 0; color: #6b7280; width: 100px;"><strong>Name:</strong></td>
        <td style="padding: 6px 0; color: #111827;">${safeName}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280;"><strong>Email:</strong></td>
        <td style="padding: 6px 0; color: #111827;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280;"><strong>Phone:</strong></td>
        <td style="padding: 6px 0; color: #111827;">${safePhone}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280;"><strong>Category:</strong></td>
        <td style="padding: 6px 0; color: #111827;">${safeCategory}</td>
      </tr>
    </table>
    <div style="background-color: #f3f4f6; border-radius: 6px; padding: 16px; font-size: 14px; line-height: 1.6; color: #374151;">
      ${safeMessage}
    </div>
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
      RapidAid Admin Notification System
    </div>
  </div>
</body>
</html>`

  const text = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nCategory: ${category}\n\nMessage:\n${message}\n\nRapidAid Admin Notification System`

  return { subject, html, text }
}

export interface TripCompletedEmailParams {
  requestId: string
  patientName?: string | null
  paymentUrl: string
  fare?: number | null
}

export function tripCompletedEmail({
  requestId,
  patientName,
  paymentUrl,
  fare,
}: TripCompletedEmailParams): { subject: string; html: string; text: string } {
  const safeName = patientName ? escapeHtml(patientName) : 'Valued Patient'
  const safeRequestId = escapeHtml(requestId)
  const fareDisplay = fare != null ? `$${fare.toFixed(2)}` : 'Calculated on invoice'
  const subject = 'Your ambulance trip has been completed - RapidAid'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px;">
    <h2 style="color: #111827; margin-top: 0; margin-bottom: 16px;">Trip Completed</h2>
    <p style="font-size: 15px; line-height: 1.5; margin-bottom: 16px;">Hello ${safeName},</p>
    <p style="font-size: 15px; line-height: 1.5; margin-bottom: 16px;">Your ambulance dispatch request (<code>${safeRequestId}</code>) has been completed safely.</p>
    <div style="background-color: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 14px;">
      <p style="margin: 0 0 8px 0; color: #6b7280;">Trip Fare:</p>
      <p style="margin: 0; font-size: 20px; font-weight: 700; color: #111827;">${fareDisplay}</p>
    </div>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(paymentUrl)}" style="background-color: #dc2626; color: #ffffff; display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">View Payments &amp; Receipts</a>
    </div>
    <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin-top: 24px;">Thank you for using RapidAid. We wish you good health and recovery.</p>
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
      RapidAid Emergency Ambulance Dispatch
    </div>
  </div>
</body>
</html>`

  const text = `Hello ${patientName || 'Valued Patient'},\n\nYour ambulance dispatch request (${requestId}) has been completed safely.\n\nTrip Fare: ${fareDisplay}\n\nYou can review payment details and receipts here:\n${paymentUrl}\n\nThank you for using RapidAid.\n\nRapidAid Emergency Ambulance Dispatch`

  return { subject, html, text }
}
