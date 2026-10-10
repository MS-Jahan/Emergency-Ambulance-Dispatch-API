import { env } from '../config/env'
import { isEmailConfigured, sendEmail } from './email'
import { escapeHtml, tripCompletedEmail } from './emailTemplates'
import { logger } from './logger'
import { prisma } from './prisma'
import { isSmsConfigured, sendSms } from './sms'

export type RequestEventType = 'ASSIGNED' | 'PICKED_UP' | 'COMPLETED' | 'CANCELLED'

export async function notifyRequestEvent(
  requestId: string,
  event: RequestEventType,
): Promise<void> {
  const timeoutMs = 10000

  try {
    let timer: NodeJS.Timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Notification timed out')), timeoutMs)
    })

    await Promise.race([
      performNotifyRequestEvent(requestId, event).finally(() => clearTimeout(timer)),
      timeoutPromise,
    ])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ requestId, event, error: message }, 'Failed to dispatch request notification')
  }
}

async function performNotifyRequestEvent(
  requestId: string,
  event: RequestEventType,
): Promise<void> {
  const request = await prisma.emergencyRequest.findUnique({
    where: { id: requestId },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          notifySms: true,
          notifyEmail: true,
        },
      },
      payments: {
        select: { amount: true },
        take: 1,
      },
    },
  })

  if (!request || !request.patient) {
    return
  }

  const patient = request.patient
  let smsText: string | null = null
  let emailData: { subject: string; html: string; text?: string } | null = null

  switch (event) {
    case 'ASSIGNED':
      smsText = `RapidAid: An ambulance has been assigned to your request (${requestId}). The driver is en route.`
      emailData = {
        subject: 'Ambulance Assigned - RapidAid',
        html: `<p>Hello ${escapeHtml(patient.name || 'there')},</p><p>An ambulance has been assigned to your request (<code>${requestId}</code>). The driver is on the way.</p>`,
        text: `Hello ${patient.name || 'there'},\n\nAn ambulance has been assigned to your request (${requestId}). The driver is on the way.\n\nRapidAid Emergency Ambulance Dispatch`,
      }
      break

    case 'PICKED_UP':
      smsText = 'RapidAid: Patient picked up. Ambulance is en route to hospital.'
      emailData = {
        subject: 'Ambulance Picked Up - RapidAid',
        html: `<p>Hello ${escapeHtml(patient.name || 'there')},</p><p>You have been picked up. The ambulance is en route to the hospital.</p>`,
        text: `Hello ${patient.name || 'there'},\n\nYou have been picked up. The ambulance is en route to the hospital.\n\nRapidAid Emergency Ambulance Dispatch`,
      }
      break

    case 'COMPLETED': {
      const paymentUrl = `${env.FRONTEND_URL}/dashboard/payments`
      smsText = `RapidAid: Your ambulance trip (${requestId}) is completed. View payments: ${paymentUrl}`
      const fare = request.payments[0]?.amount ? Number(request.payments[0].amount) : null
      const template = tripCompletedEmail({
        requestId,
        patientName: patient.name,
        paymentUrl,
        fare,
      })
      emailData = {
        subject: template.subject,
        html: template.html,
        text: template.text,
      }
      break
    }

    case 'CANCELLED':
      smsText = `RapidAid: Your ambulance request (${requestId}) has been cancelled.`
      emailData = {
        subject: 'Ambulance Request Cancelled - RapidAid',
        html: `<p>Hello ${escapeHtml(patient.name || 'there')},</p><p>Your ambulance request (<code>${requestId}</code>) has been cancelled.</p>`,
        text: `Hello ${patient.name || 'there'},\n\nYour ambulance request (${requestId}) has been cancelled.\n\nRapidAid Emergency Ambulance Dispatch`,
      }
      break
  }

  if (smsText && patient.notifySms && isSmsConfigured() && patient.phone) {
    await sendSms({ to: patient.phone, text: smsText }).catch((err) => {
      logger.error({ requestId, event, error: err }, 'Error sending notification SMS')
    })
  }

  if (emailData && patient.notifyEmail && isEmailConfigured() && patient.email) {
    await sendEmail({
      to: patient.email,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    }).catch((err) => {
      logger.error({ requestId, event, error: err }, 'Error sending notification email')
    })
  }
}
