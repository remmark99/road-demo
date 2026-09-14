import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"
import type {
  PipelineSettingOverride,
  PipelineSettingsAgent,
  PipelineSettingsCatalog,
  PipelineSettingsResponse,
  SettingValue,
} from "@/lib/pipeline-settings/types"
import { validateSettingValue } from "@/lib/pipeline-settings/validate"

// Runtime settings of the bus-stop analytics backend. Tables and their meaning:
// sql/pipeline_settings_schema.sql. Service role only — every request is
// checked for profiles.role = 'admin' here.

export const dynamic = "force-dynamic"

const CATALOG_ID = "stops"
// Backend default for RUNTIME_SETTINGS_REFRESH_SEC, until the catalog says otherwise.
const DEFAULT_REFRESH_SECONDS = 15
// A process counts as online while it synced within a few refresh periods.
const MIN_ONLINE_WINDOW_MS = 45_000
// Stopped processes (replaced containers) stay listed as offline for a day and
// are deleted after a week.
const AGENT_VISIBLE_MS = 24 * 60 * 60 * 1000
const AGENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function requireAdmin() {
  const user = await getAuthenticatedUser()
  if (!user) throw new HttpError("Требуется авторизация", 401)

  const admin = createNotificationAdminClient()
  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (error) throw error
  if (data?.role !== "admin") throw new HttpError("Нет доступа (требуются права admin)", 403)

  return { user, admin }
}

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  // 42P01: Postgres undefined_table; PGRST205: PostgREST has no such table cached.
  return code === "42P01" || code === "PGRST205"
}

function handleError(error: unknown) {
  if (error instanceof HttpError) return jsonError(error.message, error.status)
  if (isMissingTable(error)) {
    return jsonError(
      "Таблицы параметров не созданы: примените sql/pipeline_settings_schema.sql",
      503,
    )
  }
  console.error("Pipeline settings error", error)
  return jsonError("Не удалось обработать параметры анализа", 500)
}

async function loadState(admin: SupabaseClient): Promise<PipelineSettingsResponse> {
  const visibleSince = new Date(Date.now() - AGENT_VISIBLE_MS).toISOString()
  const [catalogResult, overridesResult, agentsResult] = await Promise.all([
    admin
      .from("pipeline_settings_catalog")
      .select("catalog,published_at")
      .eq("id", CATALOG_ID)
      .maybeSingle(),
    admin.from("pipeline_settings").select("key,value,updated_at,updated_by"),
    admin
      .from("pipeline_settings_agents")
      .select("instance_id,service,hostname,started_at,synced_at,applied,rejected")
      .gte("synced_at", visibleSince)
      .order("synced_at", { ascending: false })
      .limit(500),
  ])
  if (catalogResult.error) throw catalogResult.error
  if (overridesResult.error) throw overridesResult.error
  if (agentsResult.error) throw agentsResult.error

  const catalog = (catalogResult.data?.catalog ?? null) as PipelineSettingsCatalog | null
  const refreshSeconds = catalog?.refresh_sec ?? DEFAULT_REFRESH_SECONDS
  const onlineWindowMs = Math.max(MIN_ONLINE_WINDOW_MS, refreshSeconds * 3 * 1000)

  const overrideRows = overridesResult.data ?? []
  const editorIds = [
    ...new Set(overrideRows.map((row) => row.updated_by).filter((id): id is string => !!id)),
  ]
  const emails = new Map<string, string>()
  if (editorIds.length > 0) {
    const { data, error } = await admin.from("profiles").select("id,email").in("id", editorIds)
    // Who changed a value is a nicety; never fail the page over it.
    if (error) console.error("Pipeline settings editors lookup failed", error)
    for (const profile of data ?? []) {
      if (profile.email) emails.set(profile.id, profile.email)
    }
  }

  const overrides: Record<string, PipelineSettingOverride> = {}
  for (const row of overrideRows) {
    overrides[row.key] = {
      value: row.value as SettingValue,
      updatedAt: row.updated_at,
      updatedByEmail: row.updated_by ? emails.get(row.updated_by) ?? null : null,
    }
  }

  const now = Date.now()
  const agents: PipelineSettingsAgent[] = (agentsResult.data ?? []).map((row) => ({
    instanceId: row.instance_id,
    service: row.service,
    hostname: row.hostname,
    startedAt: row.started_at,
    syncedAt: row.synced_at,
    online: now - Date.parse(row.synced_at) <= onlineWindowMs,
    applied: (row.applied ?? {}) as Record<string, unknown>,
    rejected: (row.rejected ?? {}) as Record<string, string>,
  }))

  return {
    catalog,
    publishedAt: catalogResult.data?.published_at ?? null,
    overrides,
    agents,
    refreshSeconds,
  }
}

export async function GET() {
  try {
    const { admin } = await requireAdmin()
    return NextResponse.json(await loadState(admin))
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const { user, admin } = await requireAdmin()

    const body = await request.json().catch(() => null)
    const changes = body?.changes
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new HttpError("Некорректный запрос", 400)
    }
    const entries = Object.entries(changes as Record<string, unknown>)
    if (entries.length === 0) throw new HttpError("Нет изменений", 400)

    const { data: catalogRow, error: catalogError } = await admin
      .from("pipeline_settings_catalog")
      .select("catalog")
      .eq("id", CATALOG_ID)
      .maybeSingle()
    if (catalogError) throw catalogError
    const catalog = catalogRow?.catalog as PipelineSettingsCatalog | undefined
    if (!catalog) throw new HttpError("Сервисы ещё не опубликовали список параметров", 409)
    const fields = new Map(catalog.fields.map((field) => [field.key, field]))

    const updatedAt = new Date().toISOString()
    const upserts: { key: string; value: SettingValue; updated_at: string; updated_by: string }[] = []
    const resets: string[] = []
    for (const [key, value] of entries) {
      const field = fields.get(key)
      if (!field) throw new HttpError(`Неизвестный параметр: ${key}`, 400)
      if (value === null) {
        resets.push(key)
        continue
      }
      const problem = validateSettingValue(field, value)
      if (problem) {
        return NextResponse.json({ error: `«${field.label}»: ${problem}`, field: key }, { status: 400 })
      }
      upserts.push({ key, value: value as SettingValue, updated_at: updatedAt, updated_by: user.id })
    }

    if (upserts.length > 0) {
      const { error } = await admin.from("pipeline_settings").upsert(upserts, { onConflict: "key" })
      if (error) throw error
    }
    if (resets.length > 0) {
      const { error } = await admin.from("pipeline_settings").delete().in("key", resets)
      if (error) throw error
    }

    const retentionCutoff = new Date(Date.now() - AGENT_RETENTION_MS).toISOString()
    const { error: cleanupError } = await admin
      .from("pipeline_settings_agents")
      .delete()
      .lt("synced_at", retentionCutoff)
    if (cleanupError) console.error("Pipeline settings agents cleanup failed", cleanupError)

    return NextResponse.json(await loadState(admin))
  } catch (error) {
    return handleError(error)
  }
}
