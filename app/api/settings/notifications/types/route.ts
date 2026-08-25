import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { getAvailableNotificationEventTypes } from "@/lib/notifications/catalog"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"

const MAX_SELECTED_TYPES = 100

interface UpdateTypesBody {
  emailEventTypes?: unknown
  maxEventTypes?: unknown
}

function parseSelection(value: unknown, allowed: Set<string>) {
  if (value === null) return { value: null as string[] | null }
  if (!Array.isArray(value) || value.length > MAX_SELECTED_TYPES) {
    return { error: "Некорректный список типов уведомлений" }
  }

  const selected = [...new Set(value)]
  if (selected.some((key) => typeof key !== "string" || !allowed.has(key))) {
    return { error: "Выбран неизвестный или недоступный тип уведомления" }
  }
  return { value: selected as string[] }
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError("Требуется авторизация", 401)

  let body: UpdateTypesBody
  try {
    body = await request.json() as UpdateTypesBody
  } catch {
    return jsonError("Некорректный JSON", 400)
  }

  if (!("emailEventTypes" in body) || !("maxEventTypes" in body)) {
    return jsonError("Передайте настройки типов для Email и MAX", 400)
  }

  try {
    const admin = createNotificationAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("modules")
      .eq("id", user.id)
      .maybeSingle()
    if (profileError) throw profileError

    const available = getAvailableNotificationEventTypes(
      Array.isArray(profile?.modules) ? profile.modules : [],
    )
    const allowed = new Set(available.map((item) => item.key))
    const emailSelection = parseSelection(body.emailEventTypes, allowed)
    const maxSelection = parseSelection(body.maxEventTypes, allowed)
    if (emailSelection.error) return jsonError(emailSelection.error, 400)
    if (maxSelection.error) return jsonError(maxSelection.error, 400)

    const { error } = await admin.rpc("set_notification_event_types", {
      requested_user_id: user.id,
      requested_email_types: emailSelection.value,
      requested_max_types: maxSelection.value,
    })
    if (error) throw error

    return NextResponse.json({
      success: true,
      emailEventTypes: emailSelection.value,
      maxEventTypes: maxSelection.value,
    })
  } catch (error) {
    console.error("Notification type preference error", error)
    return jsonError("Не удалось сохранить типы уведомлений", 500)
  }
}
