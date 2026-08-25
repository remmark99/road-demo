import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { getAvailableNotificationEventTypes } from "@/lib/notifications/catalog"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"
import { updateEmailPreference } from "@/lib/notifications/preferences"
import type { NotificationPreferencesResponse } from "@/lib/notifications/types"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError("Требуется авторизация", 401)

  try {
    const admin = createNotificationAdminClient()
    const now = new Date().toISOString()
    const [preferenceResult, pendingResult, profileResult] = await Promise.all([
      admin
        .from("notification_preferences")
        .select("email,email_enabled,max_user_id,max_display_name,max_enabled,email_event_types,max_event_types")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("max_link_tokens")
        .select("expires_at")
        .eq("user_id", user.id)
        .is("consumed_at", null)
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("modules")
        .eq("id", user.id)
        .maybeSingle(),
    ])

    if (preferenceResult.error) throw preferenceResult.error
    if (pendingResult.error) throw pendingResult.error
    if (profileResult.error) throw profileResult.error

    const preference = preferenceResult.data
    const connected = Boolean(preference?.max_enabled && preference?.max_user_id)
    const pendingUntil = connected ? null : pendingResult.data?.expires_at ?? null
    const response: NotificationPreferencesResponse = {
      email: preference?.email ?? "",
      emailEnabled: preference?.email_enabled ?? false,
      maxEnabled: connected,
      maxDisplayName: preference?.max_display_name ?? null,
      maxStatus: connected ? "connected" : pendingUntil ? "pending" : "disconnected",
      maxPendingUntil: pendingUntil,
      availableEventTypes: getAvailableNotificationEventTypes(
        Array.isArray(profileResult.data?.modules) ? profileResult.data.modules : [],
      ),
      emailEventTypes: Array.isArray(preference?.email_event_types)
        ? preference.email_event_types
        : null,
      maxEventTypes: Array.isArray(preference?.max_event_types)
        ? preference.max_event_types
        : null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Notification preferences read error", error)
    return jsonError("Настройки уведомлений ещё не готовы", 503)
  }
}

export async function PUT(request: Request) {
  return updateEmailPreference(request)
}
