import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"

export async function DELETE() {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError("Требуется авторизация", 401)

  try {
    const admin = createNotificationAdminClient()
    const { error: preferenceError } = await admin
      .from("notification_preferences")
      .upsert({
        user_id: user.id,
        max_user_id: null,
        max_display_name: null,
        max_enabled: false,
      }, { onConflict: "user_id" })
    if (preferenceError) throw preferenceError

    const { error: queueError } = await admin
      .from("notification_deliveries")
      .update({
        status: "cancelled",
        lease_until: null,
        lease_token: null,
      })
      .eq("user_id", user.id)
      .eq("channel", "max")
      .in("status", ["pending", "processing"])
    if (queueError) throw queueError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("MAX disconnect error", error)
    return jsonError("Не удалось отключить MAX", 500)
  }
}
