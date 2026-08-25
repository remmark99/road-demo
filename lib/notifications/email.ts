import "server-only"

import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"
import { NotificationDeliveryError } from "@/lib/notifications/errors"
import { renderEmailEvent } from "@/lib/notifications/render"
import type { NotificationEventPayload } from "@/lib/notifications/types"

function getSmtpConfig() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || user

  if (!host || !user || !pass || !from) {
    throw new NotificationDeliveryError("SMTP is not configured", { transient: false })
  }

  const port = Number.parseInt(process.env.SMTP_PORT || "587", 10)
  if (!Number.isInteger(port) || port <= 0) {
    throw new NotificationDeliveryError("SMTP port is invalid", { transient: false })
  }

  return {
    transport: {
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    },
    from,
  }
}

function classifySmtpError(error: unknown) {
  if (error instanceof NotificationDeliveryError) return error

  const smtpError = error as SMTPTransport.SentMessageInfo & {
    responseCode?: number
    code?: string
    message?: string
  }
  const responseCode = smtpError?.responseCode
  const transient = responseCode
    ? responseCode >= 400 && responseCode < 500
    : ["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "ESOCKET", "EDNS"].includes(smtpError?.code || "")

  return new NotificationDeliveryError(smtpError?.message || "SMTP delivery failed", {
    transient,
  })
}

async function sendMail(options: { to: string; subject: string; text: string; html: string }) {
  const config = getSmtpConfig()
  const transporter = nodemailer.createTransport(config.transport)

  try {
    await transporter.sendMail({ from: config.from, ...options })
  } catch (error) {
    throw classifySmtpError(error)
  }
}

export async function sendTestEmail(to: string) {
  await sendMail({
    to,
    subject: "Уведомления Вектор Города подключены",
    text: "Email успешно подключён. Новые события доступных вам модулей будут приходить на этот адрес.",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#172033">
        <h1 style="font-size:22px;color:#0f766e">Вектор Города</h1>
        <p>Email успешно подключён.</p>
        <p>Новые события доступных вам модулей будут приходить на этот адрес.</p>
      </div>
    `,
  })
}

export async function sendEventEmail(to: string, payload: NotificationEventPayload) {
  await sendMail({ to, ...renderEmailEvent(payload) })
}
