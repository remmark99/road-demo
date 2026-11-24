import "server-only"

import { NotificationDeliveryError } from "@/lib/notifications/errors"
import { requestMax, uploadToMax } from "@/lib/notifications/max-http"
import { getEventLink, renderMaxEvent } from "@/lib/notifications/render"
import type { NotificationEventPayload } from "@/lib/notifications/types"

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
  const response = await requestMax(`/messages?user_id=${encodeURIComponent(userId)}`, getMaxToken(), {
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** MAX обрабатывает загруженный файл не сразу: паузы перед попытками отправки сообщения. */
const FILE_READY_DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 8_000]

/** Файл пользователю в MAX: адрес загрузки → загрузка → сообщение с вложением. */
export async function sendMaxFile(userId: string, text: string, file: { fileName: string; content: Buffer; contentType: string }) {
  const token = getMaxToken()
  const network = (error: unknown) => {
    throw new NotificationDeliveryError(error instanceof Error ? error.message : "MAX network error", { transient: true })
  }

  const slot = await requestMax("/uploads?type=file", token, {}).catch(network) as Response
  if (!slot.ok) throw new NotificationDeliveryError(`MAX upload slot ${slot.status}`, { transient: slot.status >= 500 })
  const slotBody = await slot.json().catch(() => null) as { url?: unknown; token?: unknown } | null
  if (typeof slotBody?.url !== "string") throw new NotificationDeliveryError("MAX did not return an upload URL", { transient: true })

  const uploaded = await uploadToMax(slotBody.url, file).catch(network) as Response
  const uploadedText = await uploaded.text()
  if (!uploaded.ok) throw new NotificationDeliveryError(`MAX upload ${uploaded.status}: ${uploadedText.slice(0, 200)}`, { transient: uploaded.status >= 500 })
  let uploadedBody: { token?: unknown } | null = null
  try { uploadedBody = JSON.parse(uploadedText) as { token?: unknown } } catch { /* у части типов ответ не JSON — токен тогда из первого шага */ }
  const fileToken = typeof uploadedBody?.token === "string" ? uploadedBody.token : typeof slotBody.token === "string" ? slotBody.token : null
  if (!fileToken) throw new NotificationDeliveryError("MAX did not return a file token", { transient: false })

  let last = ""
  for (const delay of FILE_READY_DELAYS_MS) {
    await wait(delay)
    const response = await requestMax(`/messages?user_id=${encodeURIComponent(userId)}`, token, {
      text,
      notify: true,
      attachments: [{ type: "file", payload: { token: fileToken } }],
    }).catch(network) as Response
    if (response.ok) return
    last = `MAX API ${response.status}: ${(await response.text()).slice(0, 300)}`
    if (response.status === 403 || response.status === 404) throw new NotificationDeliveryError(last, { transient: false, disableRecipient: true })
    // Файл ещё обрабатывается — пробуем снова с большей паузой; остальное повтором не лечится.
    if (!last.includes("attachment.not.ready") && response.status !== 429 && response.status < 500) break
  }
  throw new NotificationDeliveryError(last || "MAX file was not sent", { transient: true })
}
