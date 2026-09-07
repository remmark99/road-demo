import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"
import {
  isValidFullName,
  isValidPhone,
  normalizeFullName,
  normalizePhone,
} from "@/lib/profile/contact"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Postgres: column does not exist — the migration has not been applied yet. */
const UNDEFINED_COLUMN = "42703"

interface ProfileBody {
  fullName?: unknown
  phone?: unknown
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError("Требуется авторизация", 401)

  try {
    const admin = createNotificationAdminClient()
    const { data, error } = await admin
      .from("profiles")
      .select("full_name,phone")
      .eq("id", user.id)
      .maybeSingle()

    if (error) {
      if (error.code === UNDEFINED_COLUMN) {
        return NextResponse.json({ email: user.email ?? "", fullName: null, phone: null })
      }
      throw error
    }

    return NextResponse.json({
      email: user.email ?? "",
      fullName: data?.full_name ?? null,
      phone: data?.phone ?? null,
    })
  } catch (error) {
    console.error("Profile read error", error)
    return jsonError("Не удалось загрузить профиль", 503)
  }
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError("Требуется авторизация", 401)

  let body: ProfileBody
  try {
    body = (await request.json()) as ProfileBody
  } catch {
    return jsonError("Некорректный JSON", 400)
  }

  const fullName = normalizeFullName(body.fullName)
  const phone = normalizePhone(body.phone)

  if (fullName && !isValidFullName(fullName)) {
    return jsonError("Слишком длинное ФИО", 400)
  }
  if (phone && !isValidPhone(phone)) {
    return jsonError("Неверный формат телефона", 400)
  }

  try {
    const admin = createNotificationAdminClient()
    const { error } = await admin
      .from("profiles")
      .update({ full_name: fullName, phone })
      .eq("id", user.id)

    if (error) {
      if (error.code === UNDEFINED_COLUMN) {
        return jsonError("Профиль ещё не настроен администратором", 503)
      }
      throw error
    }

    return NextResponse.json({ fullName, phone })
  } catch (error) {
    console.error("Profile update error", error)
    return jsonError("Не удалось сохранить профиль", 500)
  }
}
