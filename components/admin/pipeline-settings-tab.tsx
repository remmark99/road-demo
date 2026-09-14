"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatDistanceToNowStrict } from "date-fns"
import { ru } from "date-fns/locale"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RotateCcw,
  Server,
  TriangleAlert,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  PipelineSettingField,
  PipelineSettingOverride,
  PipelineSettingsAgent,
  PipelineSettingsChanges,
  PipelineSettingsResponse,
  SettingValue,
} from "@/lib/pipeline-settings/types"
import {
  describeRange,
  humanizeSeconds,
  parseSettingInput,
  sameSettingValue,
  type ParseResult,
} from "@/lib/pipeline-settings/validate"

const API_URL = "/api/admin/pipeline-settings"
const POLL_MS = 5_000

const SERVICE_LABELS: Record<string, string> = {
  ingestion: "Захват кадров",
  "stage1-basic": "Детектор объектов",
  "stage1-pose": "Детектор поз",
  "stage2-verifier": "Проверка второго уровня",
  "bin-worker": "Урны",
  "glass-break-worker": "Контроллеры",
  "equipment-monitor": "Мониторинг оборудования",
}

// A draft is what the control holds before saving: text for numbers and
// prompts, a boolean for switches, null for "back to the .env value".
type DraftInput = string | boolean | null

type SyncState =
  | { kind: "none" }
  | { kind: "applied"; total: number }
  | { kind: "pending"; done: number; total: number }
  | { kind: "rejected"; reason: string }
  | { kind: "offline" }

interface FieldView {
  field: PipelineSettingField
  override: PipelineSettingOverride | undefined
  input: string | boolean
  parsed: ParseResult
  // Set when saving would change what is stored.
  change: SettingValue | null | undefined
  sync: SyncState
}

function toInput(value: SettingValue): string | boolean {
  return typeof value === "boolean" ? value : String(value)
}

function formatValue(field: PipelineSettingField, value: SettingValue): string {
  if (typeof value === "boolean") return value ? "включено" : "выключено"
  if (typeof value === "string") return `«${value}»`
  // 30°, but 60 с and 640 px.
  const unit = !field.unit ? "" : field.unit === "°" ? field.unit : ` ${field.unit}`
  const human = field.unit === "с" ? humanizeSeconds(value) : ""
  return `${value}${unit}${human ? ` (${human})` : ""}`
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ""
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: ru })
}

function computeSync(
  field: PipelineSettingField,
  override: PipelineSettingOverride | undefined,
  agents: PipelineSettingsAgent[],
): SyncState {
  const relevant = agents.filter((a) => a.online && field.services.includes(a.service))
  if (relevant.length === 0) return override ? { kind: "offline" } : { kind: "none" }

  if (override) {
    const refusing = relevant.find((a) => a.rejected[field.key])
    if (refusing) return { kind: "rejected", reason: refusing.rejected[field.key] }
  }

  const done = relevant.filter((a) =>
    override
      ? field.key in a.applied && sameSettingValue(a.applied[field.key], override.value)
      : !(field.key in a.applied),
  ).length
  if (done < relevant.length) return { kind: "pending", done, total: relevant.length }
  return override ? { kind: "applied", total: relevant.length } : { kind: "none" }
}

function buildView(
  field: PipelineSettingField,
  data: PipelineSettingsResponse,
  draft: DraftInput | undefined,
): FieldView {
  const override = data.overrides[field.key]
  const saved = override ? override.value : field.default
  const input = draft === undefined ? toInput(saved) : draft === null ? toInput(field.default) : draft
  const parsed: ParseResult =
    typeof input === "boolean" ? { value: input } : parseSettingInput(field, input)

  let change: SettingValue | null | undefined
  if (draft !== undefined && "value" in parsed) {
    // Typing the .env value back in is the same as a reset.
    const target =
      draft === null || sameSettingValue(parsed.value, field.default) ? null : parsed.value
    const current = override ? override.value : null
    const differs =
      target === null ? current !== null : current === null || !sameSettingValue(target, current)
    if (differs) change = target
  }

  return { field, override, input, parsed, change, sync: computeSync(field, override, data.agents) }
}

async function requestState(init?: RequestInit): Promise<PipelineSettingsResponse> {
  const res = await fetch(API_URL, { cache: "no-store", ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || "Не удалось загрузить параметры анализа")
  return body as PipelineSettingsResponse
}

export function PipelineSettingsTab() {
  const [data, setData] = useState<PipelineSettingsResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftInput>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  // Bumped by a save so a poll that started before it cannot overwrite its result.
  const generation = useRef(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      const started = generation.current
      try {
        const next = await requestState()
        if (!cancelled && started === generation.current) {
          setData(next)
          setLoadError(null)
        }
      } catch (error) {
        if (!cancelled) setLoadError((error as Error).message)
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS)
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  const views = useMemo(() => {
    if (!data?.catalog) return []
    return data.catalog.fields.map((field) => buildView(field, data, drafts[field.key]))
  }, [data, drafts])

  const changes = views.filter((v) => v.change !== undefined)
  const invalid = views.filter((v) => "error" in v.parsed)
  const hasUnsaved = changes.length > 0 || invalid.length > 0

  useEffect(() => {
    if (!hasUnsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [hasUnsaved])

  const setDraft = useCallback((key: string, value: DraftInput) => {
    setDrafts((prev) => ({ ...prev, [key]: value }))
  }, [])

  const save = async () => {
    if (changes.length === 0 || invalid.length > 0) return
    const payload: PipelineSettingsChanges = {}
    for (const view of changes) payload[view.field.key] = view.change ?? null

    setSaving(true)
    generation.current += 1
    try {
      const next = await requestState({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: payload }),
      })
      generation.current += 1
      setData(next)
      setDrafts({})
      toast.success("Параметры сохранены", {
        description: `Сервисы применят их в течение ~${next.refreshSeconds} с, без перезапуска.`,
      })
    } catch (error) {
      toast.error("Не удалось сохранить", { description: (error as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return loadError ? (
      <ErrorCard message={loadError} />
    ) : (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data.catalog) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Параметры анализа</CardTitle>
          <CardDescription>
            Сервисы аналитики ещё не опубликовали список параметров. Он появится после запуска
            бэкенда с поддержкой настроек на лету.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const catalog = data.catalog
  const advancedCount = catalog.fields.filter((f) => f.advanced).length

  return (
    <div className="space-y-6 pb-4">
      {loadError && <ErrorCard message={`Не удаётся обновить данные: ${loadError}`} />}

      <Card>
        <CardHeader>
          <CardTitle>Параметры анализа</CardTitle>
          <CardDescription>
            Пороги, паузы и интервалы, которые сервисы применяют без перезапуска — примерно через{" "}
            {data.refreshSeconds} с после сохранения. Модели, камеры и доступы по-прежнему задаются
            в .env и требуют перезапуска.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ServicesSummary
            services={[...new Set(catalog.fields.flatMap((f) => f.services))]}
            agents={data.agents}
          />
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} />
            Показать дополнительные параметры ({advancedCount})
          </label>
        </CardContent>
      </Card>

      {catalog.groups.map((group) => {
        const groupViews = views.filter(
          (v) =>
            v.field.group === group.id &&
            (showAdvanced || !v.field.advanced || v.override || drafts[v.field.key] !== undefined),
        )
        if (groupViews.length === 0) return null
        return (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle className="text-lg">{group.title}</CardTitle>
              {group.description && <CardDescription>{group.description}</CardDescription>}
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {groupViews.map((view) => (
                <FieldRow
                  key={view.field.key}
                  view={view}
                  hasDraft={drafts[view.field.key] !== undefined}
                  disabled={saving}
                  onChange={setDraft}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}

      {hasUnsaved && (
        <div className="sticky bottom-4 z-10">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <p className="text-sm">
              {invalid.length > 0 ? (
                <span className="text-destructive">
                  Исправьте ошибки в параметрах: {invalid.length}
                </span>
              ) : (
                <>Несохранённых изменений: {changes.length}</>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDrafts({})} disabled={saving}>
                Отменить
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={saving || invalid.length > 0 || changes.length === 0}
                className="bg-teal-500 text-white hover:bg-teal-600"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-500 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function ServicesSummary({
  services,
  agents,
}: {
  services: string[]
  agents: PipelineSettingsAgent[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {services.map((service) => {
        const instances = agents.filter((a) => a.service === service)
        const online = instances.filter((a) => a.online)
        const lastSeen = instances[0]?.syncedAt
        return (
          <div
            key={service}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm"
            title={service}
          >
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{SERVICE_LABELS[service] ?? service}</span>
            {online.length > 0 ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {online.length > 1 ? `${online.length} на связи` : "на связи"}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                {lastSeen ? `не на связи, был ${timeAgo(lastSeen)}` : "нет данных"}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SyncBadge({ sync }: { sync: SyncState }) {
  switch (sync.kind) {
    case "applied":
      return (
        <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 />
          Применено
        </Badge>
      )
    case "pending":
      return (
        <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
          <Loader2 className="animate-spin" />
          Применяется: {sync.done} из {sync.total}
        </Badge>
      )
    case "rejected":
      return (
        <Badge
          variant="outline"
          className="gap-1 text-destructive"
          title={`Сервис отклонил значение: ${sync.reason}`}
        >
          <TriangleAlert />
          Отклонено сервисом
        </Badge>
      )
    case "offline":
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <CircleDashed />
          Применится при запуске сервиса
        </Badge>
      )
    default:
      return null
  }
}

function FieldRow({
  view,
  hasDraft,
  disabled,
  onChange,
}: {
  view: FieldView
  hasDraft: boolean
  disabled: boolean
  onChange: (key: string, value: DraftInput) => void
}) {
  const { field, override, input, parsed, change, sync } = view
  const id = `pipeline-setting-${field.key}`
  const error = "error" in parsed ? parsed.error : null
  const isText = field.schema.type === "string"
  const range = describeRange(field)
  const canReset = hasDraft ? input !== toInput(field.default) || change !== undefined : !!override

  const control =
    typeof input === "boolean" ? (
      <Switch
        id={id}
        checked={input}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(field.key, checked)}
      />
    ) : isText ? (
      <Textarea
        id={id}
        value={input}
        disabled={disabled}
        aria-invalid={!!error}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="min-h-20"
      />
    ) : (
      <Input
        id={id}
        inputMode="decimal"
        value={input}
        disabled={disabled}
        aria-invalid={!!error}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="w-32"
      />
    )

  return (
    <div
      className={cn(
        "grid gap-3 py-4 first:pt-0 last:pb-0",
        !isText && "md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-8",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="font-medium">
            {field.label}
          </label>
          {change !== undefined && <Badge variant="secondary">Не сохранено</Badge>}
          {override && change === undefined && <Badge variant="secondary">Изменено</Badge>}
          {change === undefined && <SyncBadge sync={sync} />}
        </div>
        <p className="text-sm text-muted-foreground">{field.description}</p>
        <p className="text-xs text-muted-foreground">
          По умолчанию: {formatValue(field, field.default)}
          {override && (
            <>
              {" · "}изменено {timeAgo(override.updatedAt)}
              {override.updatedByEmail && <>, {override.updatedByEmail}</>}
            </>
          )}
          {" · "}
          <code className="font-mono">{field.key}</code>
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {control}
          {!isText && field.unit && (
            <span className="text-sm text-muted-foreground">{field.unit}</span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Вернуть значение по умолчанию"
            aria-label="Вернуть значение по умолчанию"
            disabled={disabled || !canReset}
            onClick={() => onChange(field.key, null)}
            className={cn(!canReset && "invisible")}
          >
            <RotateCcw />
          </Button>
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          !isText &&
          typeof input === "string" &&
          (range || field.unit === "с") && (
            <p className="text-xs text-muted-foreground">
              {[range, "value" in parsed && typeof parsed.value === "number" && field.unit === "с"
                ? humanizeSeconds(parsed.value)
                : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )
        )}
      </div>
    </div>
  )
}
