import { NextResponse } from "next/server"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"
import { sendSupportRequestEmail } from "@/lib/notifications/email"
import { NotificationDeliveryError } from "@/lib/notifications/errors"
import { isSupportTopic, getSupportTopicLabel } from "@/lib/support/topics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_MESSAGE_LENGTH = 4000

interface SupportRequestBody {
  topic?: unknown
  message?: unknown
}

export async function POST(request: Request) {
  let body: SupportRequestBody
  try {
    body = (await request.json()) as SupportRequestBody
  } catch {
    return jsonError("Некорректный JSON", 400)
  }

  const topic = typeof body.topic === "string" ? body.topic : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""

  if (!isSupportTopic(topic)) {
    return jsonError("Выберите тему обращения", 400)
  }
  if (!message) {
    return jsonError("Введите текст обращения", 400)
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonError("Слишком длинное сообщение", 400)
  }

  const user = await getAuthenticatedUser()
  const pageUrl = request.headers.get("referer")

  try {
    await sendSupportRequestEmail({
      topicLabel: getSupportTopicLabel(topic),
      message,
      reporterEmail: user?.email,
      pageUrl,
    })
  } catch (error) {
    if (error instanceof NotificationDeliveryError) {
      const status = error.message === "SMTP is not configured" ? 503 : 502
      return jsonError(
        status === 503
          ? "Отправка обращений пока не настроена администратором"
          : "Не удалось отправить обращение. Попробуйте позже.",
        status,
      )
    }
    console.error("Support request delivery error", error)
    return jsonError("Не удалось отправить обращение", 500)
  }

  return NextResponse.json({ success: true })
}
