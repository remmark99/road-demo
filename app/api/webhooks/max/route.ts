import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { secretsEqual } from "@/lib/notifications/http"
import { sendMaxMessage } from "@/lib/notifications/max"

interface MaxWebhookUpdate {
  update_type?: unknown
  payload?: unknown
  chat_id?: unknown
  user?: {
    user_id?: unknown
    first_name?: unknown
    last_name?: unknown
    username?: unknown
    name?: unknown
  }
}

function getMaxUserId(update: MaxWebhookUpdate) {
  const value = update.user?.user_id ?? update.chat_id
  const userId = typeof value === "number" || typeof value === "string" ? String(value) : ""
  return /^\d+$/.test(userId) ? userId : null
}

function getDisplayName(update: MaxWebhookUpdate) {
  const parts = [update.user?.first_name, update.user?.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
  if (parts.length > 0) return parts.join(" ").slice(0, 160)
  if (typeof update.user?.username === "string") return `@${update.user.username}`.slice(0, 160)
  if (typeof update.user?.name === "string") return update.user.name.slice(0, 160)
  return "Пользователь MAX"
}

export async function POST(request: Request) {
  if (!process.env.MAX_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 })
  }
  if (!secretsEqual(request.headers.get("x-max-bot-api-secret"), process.env.MAX_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10)
  if (contentLength > 64 * 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }

  let update: MaxWebhookUpdate
  try {
    update = await request.json() as MaxWebhookUpdate
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const updateType = typeof update.update_type === "string" ? update.update_type : ""
  const maxUserId = getMaxUserId(update)
  if (!maxUserId) return NextResponse.json({ success: true, ignored: true })

  const admin = createNotificationAdminClient()

  if (updateType === "bot_started") {
    const payload = typeof update.payload === "string" ? update.payload : ""
    if (!payload || payload.length > 128) {
      return NextResponse.json({ success: true, ignored: true })
    }

    const tokenHash = createHash("sha256").update(payload).digest("hex")
    const { data: linkedUserId, error } = await admin.rpc("consume_max_link_token", {
      requested_token_hash: tokenHash,
      requested_max_user_id: maxUserId,
      requested_display_name: getDisplayName(update),
    })

    if (error) {
      console.error("MAX link consume error", { code: error.code, message: error.message })
      return NextResponse.json({ error: "Temporary error" }, { status: 500 })
    }
    if (!linkedUserId) return NextResponse.json({ success: true, ignored: true })

    try {
      await sendMaxMessage(
        maxUserId,
        "**MAX подключён**\n\nТеперь сюда будут приходить новые события доступных вам модулей «Вектор Города».",
      )
    } catch (error) {
      console.warn("MAX connection confirmation failed", error instanceof Error ? error.message : "unknown")
    }

    return NextResponse.json({ success: true })
  }

  if (updateType === "bot_stopped") {
    const { error: preferenceError } = await admin
      .from("notification_preferences")
      .update({ max_enabled: false })
      .eq("max_user_id", maxUserId)
    if (preferenceError) {
      console.error("MAX stop preference error", preferenceError)
      return NextResponse.json({ error: "Temporary error" }, { status: 500 })
    }

    const { error: queueError } = await admin
      .from("notification_deliveries")
      .update({ status: "cancelled", lease_until: null, lease_token: null })
      .eq("channel", "max")
      .eq("recipient", maxUserId)
      .in("status", ["pending", "processing"])
    if (queueError) console.error("MAX stop queue error", queueError)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: true, ignored: true })
}
