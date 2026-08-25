import "server-only"

import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { NotificationDeliveryError } from "@/lib/notifications/errors"
import { sendTestEmail } from "@/lib/notifications/email"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface UpdateEmailBody {
  email?: unknown
  emailEnabled?: unknown
}

export async function updateEmailPreference(request: Request, defaultEnabled?: boolean) {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError("Требуется авторизация", 401)

  let body: UpdateEmailBody
  try {
    body = await request.json() as UpdateEmailBody
  } catch {
    return jsonError("Некорректный JSON", 400)
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const emailEnabled = typeof body.emailEnabled === "boolean"
    ? body.emailEnabled
    : defaultEnabled

  if (typeof emailEnabled !== "boolean") {
    return jsonError("Поле emailEnabled обязательно", 400)
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    return jsonError("Неверный формат email", 400)
  }
  if (email.length > 320) {
    return jsonError("Email слишком длинный", 400)
  }
  if (emailEnabled && !email) {
    return jsonError("Введите email", 400)
  }

  try {
    const admin = createNotificationAdminClient()
    const { data: current, error: currentError } = await admin
      .from("notification_preferences")
      .select("email,email_enabled")
      .eq("user_id", user.id)
      .maybeSingle()

    if (currentError) throw currentError

    const requiresTest = emailEnabled && (
      current?.email !== email || current?.email_enabled !== true
    )

    if (requiresTest) {
      const { data: testClaimed, error: claimError } = await admin.rpc(
        "claim_notification_email_test",
        { requested_user_id: user.id },
      )
      if (claimError) throw claimError
      if (!testClaimed) {
        return jsonError("Повторная отправка будет доступна через минуту", 429)
      }
      await sendTestEmail(email)
    }

    const { error: saveError } = await admin
      .from("notification_preferences")
      .upsert({
        user_id: user.id,
        email: email || null,
        email_enabled: emailEnabled,
      }, { onConflict: "user_id" })

    if (saveError) throw saveError

    if (emailEnabled) {
      const { error: queueError } = await admin
        .from("notification_deliveries")
        .update({ recipient: email })
        .eq("user_id", user.id)
        .eq("channel", "email")
        .eq("status", "pending")
      if (queueError) console.error("Unable to update pending email recipients", queueError)
    } else {
      const { error: queueError } = await admin
        .from("notification_deliveries")
        .update({ status: "cancelled", lease_until: null, lease_token: null })
        .eq("user_id", user.id)
        .eq("channel", "email")
        .eq("status", "pending")
      if (queueError) console.error("Unable to cancel pending email deliveries", queueError)
    }

    return NextResponse.json({
      success: true,
      email,
      emailEnabled,
      testEmailSent: requiresTest,
    })
  } catch (error) {
    if (error instanceof NotificationDeliveryError) {
      const status = error.message === "SMTP is not configured" ? 503 : 502
      return jsonError(
        status === 503
          ? "Отправка email пока не настроена администратором"
          : "Не удалось отправить тестовое письмо. Проверьте адрес и попробуйте позже.",
        status,
      )
    }
    console.error("Notification email preference error", error)
    return jsonError("Не удалось сохранить настройки уведомлений", 500)
  }
}
