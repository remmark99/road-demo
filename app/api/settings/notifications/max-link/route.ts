import { createHash, randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"
import { getMaxBotUsername } from "@/lib/notifications/max"

const LINK_TTL_MS = 10 * 60 * 1000
const MAX_LINKS_PER_HOUR = 5

export async function POST() {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError("Требуется авторизация", 401)

  try {
    const username = getMaxBotUsername()
    const admin = createNotificationAdminClient()
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await admin
      .from("max_link_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo)

    if (countError) throw countError
    if ((count ?? 0) >= MAX_LINKS_PER_HOUR) {
      return jsonError("Слишком много попыток. Повторите через час.", 429)
    }

    const now = new Date().toISOString()
    const { error: invalidateError } = await admin
      .from("max_link_tokens")
      .update({ consumed_at: now })
      .eq("user_id", user.id)
      .is("consumed_at", null)
    if (invalidateError) throw invalidateError

    const token = randomBytes(32).toString("base64url")
    const tokenHash = createHash("sha256").update(token).digest("hex")
    const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString()
    const { error: insertError } = await admin
      .from("max_link_tokens")
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
    if (insertError) throw insertError

    return NextResponse.json({
      url: `https://max.ru/${encodeURIComponent(username)}?start=${encodeURIComponent(token)}`,
      expiresAt,
    })
  } catch (error) {
    console.error("MAX link creation error", error)
    return jsonError("Не удалось создать ссылку подключения MAX", 503)
  }
}
