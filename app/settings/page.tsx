"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Mail, Settings, Check, Loader2, HelpCircle, Eye, EyeOff, LayoutGrid, CalendarClock, MessageCircle, ExternalLink, Unplug, ChevronDown, UserRound, Send } from "lucide-react"
import { useModuleAccess } from "@/components/providers/module-context"
import { isValidPhone, MAX_FULL_NAME_LENGTH, MAX_PHONE_LENGTH } from "@/lib/profile/contact"
import type { NotificationEventTypeOption } from "@/lib/notifications/catalog"
import type { NotificationPreferencesResponse } from "@/lib/notifications/types"

import { LicensePanel } from "@/components/licenses/license-panel"
import { MAX_REPORT_PROMPT_CHARS } from "@/lib/assistant/limits"
import type { ReportFormat } from "@/lib/reports/document"
import { DEFAULT_REPORT_SCHEDULE, WEEKDAY_NAMES, describeSchedule, type ReportSchedule } from "@/lib/reports/schedule"

const REPORT_FORMAT_OPTIONS: { value: ReportFormat; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "xlsx", label: "Excel" },
  { value: "docx", label: "Word" },
]
const WEEKDAY_OPTIONS = WEEKDAY_NAMES.map((name, index) => ({ value: String(index + 1), label: name[0].toUpperCase() + name.slice(1) }))
/** Время отправки — с шагом полчаса. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`)
interface ScheduleResponse {
  schedule: ReportSchedule
  nextAt: string | null
  last: { status: string; message: string | null; at: string | null } | null
  available?: boolean
  error?: string
}
/** Момент по времени Сургута: «понедельник, 30.11 в 09:00». */
function surgutMoment(iso: string | null | undefined) {
  const time = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(time)) return ""
  const local = new Date(time + 5 * 3_600_000)
  const two = (value: number) => String(value).padStart(2, "0")
  return `${WEEKDAY_NAMES[(local.getUTCDay() + 6) % 7]}, ${two(local.getUTCDate())}.${two(local.getUTCMonth() + 1)} в ${two(local.getUTCHours())}:${two(local.getUTCMinutes())}`
}
const MODULE_INFO: Record<string, { name: string; description: string }> = {
  roads: { name: 'Состояние дорог', description: 'Мониторинг дорожного покрытия и уборки' },
  shore: { name: 'Безопасный берег', description: 'Контроль прибрежных зон' },
  stops: { name: 'Остановки', description: 'Аналитика автобусных остановок' },
  parks: { name: 'Безопасный парк', description: 'Мониторинг парковых территорий' },
  transport: { name: 'Контроль транспорта', description: 'Отслеживание транспортных средств' },
  asr: { name: 'Площадки ТКО', description: 'Мониторинг площадок ТКО (мусорных контейнеров)' },
}

export default function SettingsPage() {
  const { allModules, modules: activeModules, toggleModule, refreshProfile } = useModuleAccess()
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [savedFullName, setSavedFullName] = useState("")
  const [savedPhone, setSavedPhone] = useState("")
  const [profileLoading, setProfileLoading] = useState(true)
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const [isProfileSaved, setIsProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState("")
  const [email, setEmail] = useState("")
  const [savedEmail, setSavedEmail] = useState("")
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [savedEmailEnabled, setSavedEmailEnabled] = useState(false)
  const [notificationSettingsLoading, setNotificationSettingsLoading] = useState(true)
  const [maxStatus, setMaxStatus] = useState<NotificationPreferencesResponse["maxStatus"]>("disconnected")
  const [maxDisplayName, setMaxDisplayName] = useState<string | null>(null)
  const [maxPendingUntil, setMaxPendingUntil] = useState<string | null>(null)
  const [isMaxBusy, setIsMaxBusy] = useState(false)
  const [availableEventTypes, setAvailableEventTypes] = useState<NotificationEventTypeOption[]>([])
  const [emailEventTypes, setEmailEventTypes] = useState<string[]>([])
  const [maxEventTypes, setMaxEventTypes] = useState<string[]>([])
  const [savedEmailEventTypes, setSavedEmailEventTypes] = useState<string[]>([])
  const [savedMaxEventTypes, setSavedMaxEventTypes] = useState<string[]>([])
  const [openTypeModules, setOpenTypeModules] = useState<Set<string>>(() => new Set(["stops"]))
  const [isTypesSaving, setIsTypesSaving] = useState(false)
  const [typesSaved, setTypesSaved] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState("")
  const [reportPrompt, setReportPrompt] = useState("")
  const [savedReportPrompt, setSavedReportPrompt] = useState("")
  const [reportPromptState, setReportPromptState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [reportError, setReportError] = useState("")
  const [storedSchedule, setSchedule] = useState<ReportSchedule>(DEFAULT_REPORT_SCHEDULE)
  const [notificationEmail, setNotificationEmail] = useState("")
  const [scheduleEmailTouched, setScheduleEmailTouched] = useState(false)
  // Пока адрес для отчёта не задан, в поле стоит адрес из уведомлений; он сохранится вместе с остальным.
  const schedule = useMemo(
    () => !storedSchedule.email && !scheduleEmailTouched && notificationEmail ? { ...storedSchedule, email: notificationEmail } : storedSchedule,
    [storedSchedule, scheduleEmailTouched, notificationEmail],
  )
  const [savedSchedule, setSavedSchedule] = useState("")
  const [scheduleNextAt, setScheduleNextAt] = useState<string | null>(null)
  const [scheduleLast, setScheduleLast] = useState<ScheduleResponse["last"]>(null)
  const [scheduleAvailable, setScheduleAvailable] = useState(true)
  const [scheduleBusy, setScheduleBusy] = useState<"saving" | "sending" | null>(null)
  const [scheduleNote, setScheduleNote] = useState("")
  const [scheduleError, setScheduleError] = useState("")

  const applySchedule = useCallback((data: ScheduleResponse, keepForm = false) => {
    if (!keepForm) {
      setSchedule(data.schedule)
      setSavedSchedule(JSON.stringify(data.schedule))
    }
    setScheduleNextAt(data.nextAt)
    setScheduleLast(data.last)
    setScheduleAvailable(data.available !== false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/report-schedule", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<ScheduleResponse> : null)
      .then(data => { if (!cancelled && data) applySchedule(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [applySchedule])

  // Пока отчёт собирается, раз в 10 секунд спрашиваем, чем закончилось.
  useEffect(() => {
    if (scheduleLast?.status !== "running") return
    const timer = window.setInterval(() => {
      fetch("/api/settings/report-schedule", { cache: "no-store" })
        .then(response => response.ok ? response.json() as Promise<ScheduleResponse> : null)
        .then(data => { if (data) applySchedule(data, true) })
        .catch(() => {})
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [scheduleLast?.status, applySchedule])

  const loadNotificationSettings = useCallback(async (syncEmail = true) => {
    try {
      const response = await fetch("/api/settings/notifications", { cache: "no-store" })
      const data = await response.json() as NotificationPreferencesResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить настройки уведомлений")

      if (syncEmail) {
        const availableKeys = data.availableEventTypes.map((item) => item.key)
        const allowedKeys = new Set(availableKeys)
        const selectedEmailTypes = data.emailEventTypes === null
          ? availableKeys
          : data.emailEventTypes.filter((key) => allowedKeys.has(key))
        const selectedMaxTypes = data.maxEventTypes === null
          ? availableKeys
          : data.maxEventTypes.filter((key) => allowedKeys.has(key))

        setEmail(data.email)
        setSavedEmail(data.email)
        // Адрес для отчёта по умолчанию — тот же, что для уведомлений.
        setNotificationEmail(data.email)
        setEmailEnabled(data.emailEnabled)
        setSavedEmailEnabled(data.emailEnabled)
        setAvailableEventTypes(data.availableEventTypes)
        setEmailEventTypes(selectedEmailTypes)
        setMaxEventTypes(selectedMaxTypes)
        setSavedEmailEventTypes(selectedEmailTypes)
        setSavedMaxEventTypes(selectedMaxTypes)
      }
      setMaxStatus(data.maxStatus)
      setMaxDisplayName(data.maxDisplayName)
      setMaxPendingUntil(data.maxPendingUntil)
      if (syncEmail) setError("")
    } catch (loadError) {
      if (syncEmail) {
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить настройки уведомлений")
      }
    } finally {
      if (syncEmail) setNotificationSettingsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadNotificationSettings()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadNotificationSettings])

  useEffect(() => {
    if (maxStatus !== "pending") return
    const interval = window.setInterval(() => {
      if (maxPendingUntil && new Date(maxPendingUntil).getTime() <= Date.now()) {
        setMaxStatus("disconnected")
        setMaxPendingUntil(null)
        return
      }
      void loadNotificationSettings(false)
    }, 3000)
    return () => window.clearInterval(interval)
  }, [loadNotificationSettings, maxPendingUntil, maxStatus])

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/settings/profile", { cache: "no-store" })
        const data = await response.json() as {
          fullName?: string | null
          phone?: string | null
          error?: string
        }
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить профиль")
        if (cancelled) return

        setFullName(data.fullName ?? "")
        setPhone(data.phone ?? "")
        setSavedFullName(data.fullName ?? "")
        setSavedPhone(data.phone ?? "")
        setProfileError("")
      } catch (loadError) {
        if (!cancelled) {
          setProfileError(loadError instanceof Error ? loadError.message : "Не удалось загрузить профиль")
        }
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [])

  const isProfileDirty = fullName.trim() !== savedFullName || phone.trim() !== savedPhone

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileError("")

    const nextFullName = fullName.trim().replace(/\s+/g, " ")
    const nextPhone = phone.trim().replace(/\s+/g, " ")

    if (nextPhone && !isValidPhone(nextPhone)) {
      setProfileError("Неверный формат телефона")
      return
    }

    setIsProfileSaving(true)

    try {
      const response = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: nextFullName, phone: nextPhone }),
      })
      const data = await response.json() as {
        fullName?: string | null
        phone?: string | null
        error?: string
      }
      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить профиль")
      }

      setFullName(data.fullName ?? "")
      setPhone(data.phone ?? "")
      setSavedFullName(data.fullName ?? "")
      setSavedPhone(data.phone ?? "")
      setIsProfileSaved(true)
      setTimeout(() => setIsProfileSaved(false), 3000)
      await refreshProfile()
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Произошла ошибка")
    } finally {
      setIsProfileSaving(false)
    }
  }

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (emailEnabled && !email.trim()) {
      setError("Введите email")
      return
    }

    if (email.trim() && !validateEmail(email)) {
      setError("Неверный формат email")
      return
    }

    setIsLoading(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const response = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, emailEnabled }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить email")
      }

      setEmail(normalizedEmail)
      setSavedEmail(normalizedEmail)
      setSavedEmailEnabled(emailEnabled)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка")
    } finally {
      setIsLoading(false)
    }
  }

  const handleMaxConnect = async () => {
    setError("")
    setIsMaxBusy(true)
    const popup = window.open("about:blank", "_blank")
    if (popup) popup.opener = null

    try {
      const response = await fetch("/api/settings/notifications/max-link", { method: "POST" })
      const data = await response.json() as {
        url?: string
        expiresAt?: string
        error?: string
      }
      if (!response.ok) {
        throw new Error(data.error || "Не удалось подключить MAX")
      }

      if (!data.url || !data.expiresAt) throw new Error("MAX вернул некорректную ссылку")

      setMaxStatus("pending")
      setMaxPendingUntil(data.expiresAt)
      if (popup) popup.location.href = data.url
      else window.location.href = data.url
    } catch (maxError) {
      popup?.close()
      setError(maxError instanceof Error ? maxError.message : "Не удалось подключить MAX")
    } finally {
      setIsMaxBusy(false)
    }
  }

  const handleMaxDisconnect = async () => {
    setError("")
    setIsMaxBusy(true)
    try {
      const response = await fetch("/api/settings/notifications/max", { method: "DELETE" })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error || "Не удалось отключить MAX")
      setMaxStatus("disconnected")
      setMaxDisplayName(null)
      setMaxPendingUntil(null)
    } catch (maxError) {
      setError(maxError instanceof Error ? maxError.message : "Не удалось отключить MAX")
    } finally {
      setIsMaxBusy(false)
    }
  }

  const toggleEventType = (channel: "email" | "max", key: string) => {
    const setter = channel === "email" ? setEmailEventTypes : setMaxEventTypes
    setter((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key])
    setError("")
  }

  const setAllEventTypes = (channel: "email" | "max", selected: boolean) => {
    const keys = selected ? availableEventTypes.map((item) => item.key) : []
    if (channel === "email") setEmailEventTypes(keys)
    else setMaxEventTypes(keys)
    setError("")
  }

  const toggleTypeModule = (module: string) => {
    setOpenTypeModules((current) => {
      const next = new Set(current)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
  }

  const handleTypeSubmit = async () => {
    setError("")
    setIsTypesSaving(true)
    try {
      const allKeys = availableEventTypes.map((item) => item.key)
      const emailSelection = emailEventTypes.length === allKeys.length ? null : emailEventTypes
      const maxSelection = maxEventTypes.length === allKeys.length ? null : maxEventTypes
      const response = await fetch("/api/settings/notifications/types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEventTypes: emailSelection,
          maxEventTypes: maxSelection,
        }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить типы уведомлений")

      setSavedEmailEventTypes([...emailEventTypes])
      setSavedMaxEventTypes([...maxEventTypes])
      setTypesSaved(true)
      window.setTimeout(() => setTypesSaved(false), 3000)
    } catch (typeError) {
      setError(typeError instanceof Error ? typeError.message : "Не удалось сохранить типы уведомлений")
    } finally {
      setIsTypesSaving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/report-prompt", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<{ prompt?: string }> : null)
      .then(data => {
        if (cancelled || !data) return
        setReportPrompt(current => current || data.prompt || "")
        setSavedReportPrompt(data.prompt || "")
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  /** Запрос сохраняется у пользователя: им пользуется и ассистент в чате. */
  const saveReportPrompt = async () => {
    const prompt = reportPrompt.trim()
    if (prompt === savedReportPrompt) return
    setReportPromptState("saving")
    try {
      const response = await fetch("/api/settings/report-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить запрос")
      setSavedReportPrompt(prompt)
      setReportPromptState("saved")
      setTimeout(() => setReportPromptState(state => state === "saved" ? "idle" : state), 2500)
    } catch (saveError) {
      setReportPromptState("error")
      setReportError(saveError instanceof Error ? saveError.message : "Не удалось сохранить запрос")
    }
  }

  const changeSchedule = (patch: Partial<ReportSchedule>) => {
    if (patch.email !== undefined) setScheduleEmailTouched(true)
    setSchedule(current => ({ ...current, ...patch }))
    setScheduleNote("")
    setScheduleError("")
  }
  const scheduleDirty = savedSchedule !== JSON.stringify(storedSchedule)

  /** Сохраняет запрос и расписание; false — не сохранилось, причина уже показана. */
  const saveSchedule = async () => {
    await saveReportPrompt()
    const response = await fetch("/api/settings/report-schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule),
    })
    const data = await response.json().catch(() => ({})) as ScheduleResponse
    if (!response.ok) throw new Error(data.error || "Не удалось сохранить настройки рассылки")
    applySchedule(data)
    return data
  }

  const handleSaveSchedule = async () => {
    if (scheduleBusy) return
    setScheduleBusy("saving")
    setScheduleError("")
    setScheduleNote("")
    try {
      const data = await saveSchedule()
      setScheduleNote(data.schedule.enabled ? `Сохранено. Отчёт будет приходить ${describeSchedule(data.schedule)}.` : "Сохранено. Рассылка выключена.")
    } catch (failure) {
      setScheduleError(failure instanceof Error ? failure.message : "Не удалось сохранить настройки рассылки")
    } finally {
      setScheduleBusy(null)
    }
  }

  /** Отчёт по этим настройкам уходит сразу, не дожидаясь расписания. */
  const handleSendNow = async () => {
    if (scheduleBusy) return
    setScheduleBusy("sending")
    setScheduleError("")
    setScheduleNote("")
    try {
      await saveSchedule()
      const response = await fetch("/api/settings/report-schedule/send", { method: "POST" })
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      if (!response.ok) throw new Error(data.error || "Не удалось отправить отчёт")
      setScheduleLast({ status: "running", message: null, at: new Date().toISOString() })
      setScheduleNote(data.message || "Отчёт собирается и придёт через минуту-две")
    } catch (failure) {
      setScheduleError(failure instanceof Error ? failure.message : "Не удалось отправить отчёт")
    } finally {
      setScheduleBusy(null)
    }
  }

  const hasChanges = email.trim().toLowerCase() !== savedEmail || emailEnabled !== savedEmailEnabled
  const typeGroups = useMemo(() => {
    const groups = new Map<string, { label: string; items: NotificationEventTypeOption[] }>()
    for (const item of availableEventTypes) {
      const group = groups.get(item.module) ?? { label: item.moduleLabel, items: [] }
      group.items.push(item)
      groups.set(item.module, group)
    }
    return [...groups.entries()].map(([module, group]) => ({ module, ...group }))
  }, [availableEventTypes])
  const typesHaveChanges = useMemo(() => {
    const signature = (values: string[]) => [...values].sort().join("\u0000")
    return signature(emailEventTypes) !== signature(savedEmailEventTypes)
      || signature(maxEventTypes) !== signature(savedMaxEventTypes)
  }, [emailEventTypes, maxEventTypes, savedEmailEventTypes, savedMaxEventTypes])

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Настройки
        </h1>
        <p className="text-muted-foreground mt-1">
          Управление уведомлениями и персональными настройками
        </p>
      </div>
      <LicensePanel />
      {/* Profile Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRound className="h-5 w-5 text-primary" />
            Профиль
          </CardTitle>
          <CardDescription>
            ФИО отображается в шапке вместо email. ФИО и телефон прикладываются к обращениям
            в техподдержку — оба поля необязательны.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* ym-hide-content: ПДн не должны попадать в записи Яндекс.Вебвизора */}
          <form onSubmit={handleProfileSubmit} className="space-y-4 ym-hide-content">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-full-name">ФИО</Label>
                <Input
                  id="profile-full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                  maxLength={MAX_FULL_NAME_LENGTH}
                  autoComplete="name"
                  disabled={profileLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Телефон</Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 900 000-00-00"
                  maxLength={MAX_PHONE_LENGTH}
                  autoComplete="tel"
                  disabled={profileLoading}
                />
              </div>
            </div>

            {profileError && (
              <p className="text-sm text-destructive">{profileError}</p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={profileLoading || isProfileSaving || !isProfileDirty}>
                {isProfileSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
              {isProfileSaved && (
                <span className="flex items-center gap-1.5 text-sm text-primary">
                  <Check className="h-4 w-4" />
                  Сохранено
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Module Visibility Toggles */}
      {allModules.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LayoutGrid className="h-5 w-5 text-primary" />
              Отображение модулей
            </CardTitle>
            <CardDescription>
              Выберите, какие назначенные вам модули отображать в интерфейсе.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allModules.map((moduleId) => {
                const info = MODULE_INFO[moduleId] || { name: moduleId, description: '' }
                const isActive = activeModules.includes(moduleId)
                return (
                  <div
                    key={moduleId}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isActive
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-muted/30 border-border opacity-60'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      {isActive ? (
                        <Eye className="h-4 w-4 text-primary" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{info.name}</div>
                        {info.description && (
                          <div className="text-xs text-muted-foreground">{info.description}</div>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => toggleModule(moduleId)}
                    />
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Скрытие влияет только на интерфейс. Серверные уведомления приходят по всем назначенным вам модулям.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Report Settings Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Настройки сводного отчёта</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Запрос для отчёта */}
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-bold">Запрос для отчёта</h2>
              <p className="text-muted-foreground">Что должно быть в отчёте. ИИ-ассистент учитывает этот запрос и здесь, и когда отчёт просят в чате.</p>
            </div>
            <textarea
              id="report-prompt"
              aria-label="Запрос для отчёта"
              maxLength={MAX_REPORT_PROMPT_CHARS}
              className="w-full min-h-[150px] p-4 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              placeholder="Например: сводка для главы города — что не работало и сколько, события безопасности по остановкам, где нарушались нормы температуры, какие урны переполнялись дольше всего. В конце — рекомендации."
              value={reportPrompt}
              onChange={(e) => {
                setReportPrompt(e.target.value)
                setReportPromptState("idle")
                setReportError("")
              }}
              onBlur={() => void saveReportPrompt()}
            />
            <div className="mt-1 h-4 text-xs text-muted-foreground" aria-live="polite">
              {reportPromptState === "saving" ? "Сохраняем..." : reportPromptState === "saved" ? "Запрос сохранён" : reportPromptState === "error" ? reportError : ""}
            </div>
          </div>

          <div className="border-t pt-8">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Рассылка по расписанию</h3>
                <p className="text-sm text-muted-foreground">
                  Ассистент сам соберёт отчёт по запросу выше и пришлёт его файлом. Ежедневный отчёт — за вчерашний день, еженедельный — за семь дней до дня отправки.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={schedule.enabled} onCheckedChange={(checked) => changeSchedule({ enabled: checked })} aria-label="Присылать отчёт по расписанию" />
                {schedule.enabled ? "Рассылка включена" : "Рассылка выключена"}
              </label>
            </div>

            <div className="grid gap-6 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-2">
              <div className="space-y-3">
                <Label>Как часто</Label>
                <div className="flex w-fit rounded-md border border-input p-0.5" role="radiogroup" aria-label="Периодичность">
                  {([["daily", "Каждый день"], ["weekly", "Раз в неделю"]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={schedule.frequency === value}
                      className={`rounded px-3 py-1.5 text-sm transition-colors ${schedule.frequency === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      onClick={() => changeSchedule({ frequency: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  {schedule.frequency === "weekly" && (
                    <div className="space-y-2">
                      <Label htmlFor="report-schedule-weekday">День недели</Label>
                      <Select value={String(schedule.weekday)} onValueChange={(value) => changeSchedule({ weekday: Number(value) })}>
                        <SelectTrigger id="report-schedule-weekday" className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEEKDAY_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="report-schedule-time">Время (Сургут)</Label>
                    {/* Список, а не поле времени: браузер с английской локалью показал бы «09:00 AM». */}
                    <Select value={schedule.time} onValueChange={(value) => changeSchedule({ time: value })}>
                      <SelectTrigger id="report-schedule-time" className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {(TIME_OPTIONS.includes(schedule.time) ? TIME_OPTIONS : [schedule.time, ...TIME_OPTIONS]).map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Формат</Label>
                  <div className="flex w-fit rounded-md border border-input p-0.5" role="radiogroup" aria-label="Формат отчёта">
                    {REPORT_FORMAT_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={schedule.format === option.value}
                        className={`rounded px-3 py-1.5 text-sm transition-colors ${schedule.format === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        onClick={() => changeSchedule({ format: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Куда присылать</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={schedule.toEmail} onCheckedChange={(checked) => changeSchedule({ toEmail: checked === true })} />
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    На почту
                  </label>
                  <Input
                    id="report-schedule-email"
                    type="email"
                    aria-label="Почта получателя отчёта"
                    placeholder="name@example.ru"
                    disabled={!schedule.toEmail}
                    value={schedule.email}
                    onChange={(e) => changeSchedule({ email: e.target.value })}
                  />
                </div>
                <label className={`flex items-center gap-2 text-sm ${maxStatus === "connected" ? "" : "text-muted-foreground"}`}>
                  <Checkbox
                    checked={schedule.toMax}
                    disabled={maxStatus !== "connected" && !schedule.toMax}
                    onCheckedChange={(checked) => changeSchedule({ toMax: checked === true })}
                  />
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  В MAX
                  {maxStatus !== "connected" && <span className="text-xs">— подключите MAX ниже, в уведомлениях</span>}
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-h-10 space-y-1 text-sm" aria-live="polite">
                {!scheduleAvailable && <p className="text-destructive">Рассылка заработает после обновления базы.</p>}
                {scheduleError && <p className="text-destructive">{scheduleError}</p>}
                {scheduleNote && <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4 shrink-0" />{scheduleNote}</p>}
                {!scheduleError && !scheduleNote && schedule.enabled && !scheduleDirty && scheduleNextAt && (
                  <p className="flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-4 w-4 shrink-0" />Следующая отправка: {surgutMoment(scheduleNextAt)}</p>
                )}
                {scheduleLast && (
                  <p className={scheduleLast.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                    {scheduleLast.status === "running"
                      ? "Отчёт собирается — это занимает минуту-две…"
                      : `Последняя отправка (${surgutMoment(scheduleLast.at)}): ${scheduleLast.message ?? ""}`}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={scheduleBusy !== null || scheduleLast?.status === "running" || !scheduleAvailable}
                  aria-busy={scheduleBusy === "sending"}
                  onClick={() => void handleSendNow()}
                >
                  {scheduleBusy === "sending" || scheduleLast?.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Отправить сейчас
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  disabled={scheduleBusy !== null || !scheduleDirty || !scheduleAvailable}
                  aria-busy={scheduleBusy === "saving"}
                  onClick={() => void handleSaveSchedule()}
                >
                  {scheduleBusy === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Сохранить
                </Button>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Уведомления о новых событиях
          </CardTitle>
          <CardDescription>
            События назначенных вам модулей отправляются сразу по включённым каналам.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {notificationSettingsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем настройки...
            </div>
          ) : (
            <>
              <form onSubmit={handleEmailSubmit} className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Mail className="h-4 w-4" />
                      Email
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      При первом включении отправим тестовое письмо.
                    </p>
                  </div>
                  <Switch
                    checked={emailEnabled}
                    onCheckedChange={(checked) => {
                      setEmailEnabled(checked)
                      setError("")
                    }}
                    aria-label="Включить Email уведомления"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email адрес</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setError("")
                    }}
                    aria-invalid={!!error}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading || !hasChanges}
                  className="gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : isSaved ? (
                    <>
                      <Check className="h-4 w-4" />
                      Сохранено
                    </>
                  ) : (
                    "Сохранить Email"
                  )}
                </Button>
              </form>

              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <MessageCircle className="h-4 w-4" />
                      MAX
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {maxStatus === "connected"
                        ? `Подключён${maxDisplayName ? `: ${maxDisplayName}` : ""}`
                        : maxStatus === "pending"
                          ? "Ожидаем запуска бота в MAX"
                          : "Откройте бота и нажмите кнопку запуска"}
                    </p>
                  </div>
                  {maxStatus === "connected" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={isMaxBusy}
                      onClick={handleMaxDisconnect}
                    >
                      {isMaxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                      Отключить
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={isMaxBusy}
                      onClick={handleMaxConnect}
                    >
                      {isMaxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                      {maxStatus === "pending" ? "Открыть MAX снова" : "Подключить MAX"}
                    </Button>
                  )}
                </div>
                {maxStatus === "pending" && maxPendingUntil && (
                  <p className="text-xs text-muted-foreground">
                    Ссылка действует до {new Date(maxPendingUntil).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.
                  </p>
                )}
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Settings className="h-4 w-4" />
                    Типы уведомлений
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Для каждого события отдельно выберите каналы доставки. Настройка сохраняется даже для ещё не подключённого канала.
                  </p>
                </div>

                {availableEventTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Для назначенных вам модулей типы уведомлений пока не настроены.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <div className="min-w-[520px]">
                      <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>Тип события</span>
                        <span className="text-center">Email</span>
                        <span className="text-center">MAX</span>
                      </div>
                      {typeGroups.map((group) => (
                        <div key={group.module}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between border-b bg-muted/20 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/40"
                            aria-expanded={openTypeModules.has(group.module)}
                            aria-controls={`notification-types-${group.module}`}
                            onClick={() => toggleTypeModule(group.module)}
                          >
                            <span>{group.label}</span>
                            <ChevronDown
                              className={`h-4 w-4 text-muted-foreground transition-transform ${openTypeModules.has(group.module) ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </button>
                          {openTypeModules.has(group.module) && (
                            <div id={`notification-types-${group.module}`}>
                              {group.items.map((item) => (
                                <div
                                  key={item.key}
                                  className="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center border-b px-3 py-2.5 last:border-b-0"
                                >
                                  <span className="pr-3 text-sm">{item.label}</span>
                                  <div className="flex justify-center">
                                    <Switch
                                      checked={emailEventTypes.includes(item.key)}
                                      onCheckedChange={() => toggleEventType("email", item.key)}
                                      aria-label={`${item.label}: Email`}
                                    />
                                  </div>
                                  <div className="flex justify-center">
                                    <Switch
                                      checked={maxEventTypes.includes(item.key)}
                                      onCheckedChange={() => toggleEventType("max", item.key)}
                                      aria-label={`${item.label}: MAX`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {availableEventTypes.length > 0 && (
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setAllEventTypes("email", true)}>
                        Все Email
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAllEventTypes("email", false)}>
                        Снять Email
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAllEventTypes("max", true)}>
                        Все MAX
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAllEventTypes("max", false)}>
                        Снять MAX
                      </Button>
                    </div>
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={isTypesSaving || !typesHaveChanges}
                      onClick={handleTypeSubmit}
                    >
                      {isTypesSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Сохранение...
                        </>
                      ) : typesSaved ? (
                        <>
                          <Check className="h-4 w-4" />
                          Сохранено
                        </>
                      ) : (
                        "Сохранить типы"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Help Button - Fixed at bottom */}
      <div className="fixed bottom-6 left-6">
        <Button
          variant="outline"
          className="gap-2 bg-background shadow-lg hover:bg-muted"
          onClick={() => {/* Заглушка */ }}
        >
          <HelpCircle className="h-5 w-5" />
          Нужна помощь?
        </Button>
      </div>
    </div>
  )
}
