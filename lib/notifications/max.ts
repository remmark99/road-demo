import "server-only"

import { NotificationDeliveryError } from "@/lib/notifications/errors"
import { getEventLink, renderMaxEvent } from "@/lib/notifications/render"
import type { NotificationEventPayload } from "@/lib/notifications/types"

const MAX_API_URL = "https://platform-api2.max.ru"

function getMaxToken() {
  const token = process.env.MAX_BOT_TOKEN
  if (!token) {
    throw new NotificationDeliveryError("MAX bot is not configured", { transient: false })
  }
  return token
}

export function getMaxBotUsername() {
  const username = process.env.MAX_BOT_USERNAME?.trim().replace(/^@/, "")
  if (!username || !/^[A-Za-z0-9_.-]+$/.test(username)) {
    throw new NotificationDeliveryError("MAX bot username is not configured", { transient: false })
  }
  return username
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined
  const seconds = Number.parseInt(value, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

export async function sendMaxMessage(userId: string, text: string, link?: string | null) {
  const response = await fetch(`${MAX_API_URL}/messages?user_id=${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: {
      Authorization: getMaxToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      format: "markdown",
      notify: true,
      attachments: link
        ? [{
            type: "inline_keyboard",
            payload: {
              buttons: [[{ type: "link", text: "Открыть событие", url: link }]],
            },
          }]
        : undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    throw new NotificationDeliveryError(
      error instanceof Error ? error.message : "MAX network error",
      { transient: true },
    )
  })

  if (response.ok) return

  const responseText = (await response.text()).slice(0, 300)
  const message = `MAX API ${response.status}${responseText ? `: ${responseText}` : ""}`
  if (response.status === 429) {
    throw new NotificationDeliveryError(message, {
      transient: true,
      retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
    })
  }
  if (response.status >= 500) {
    throw new NotificationDeliveryError(message, { transient: true })
  }
  if (response.status === 403 || response.status === 404) {
    throw new NotificationDeliveryError(message, {
      transient: false,
      disableRecipient: true,
    })
  }

  throw new NotificationDeliveryError(message, { transient: false })
}

export async function sendEventToMax(userId: string, payload: NotificationEventPayload) {
  await sendMaxMessage(userId, renderMaxEvent(payload), getEventLink(payload))
}
