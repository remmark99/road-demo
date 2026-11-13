"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Mail, Settings, Check, Loader2, HelpCircle, Eye, EyeOff, LayoutGrid, CalendarIcon, FileDown, MessageCircle, ExternalLink, Unplug, ChevronDown, UserRound } from "lucide-react"
import { useModuleAccess } from "@/components/providers/module-context"
import { isValidPhone, MAX_FULL_NAME_LENGTH, MAX_PHONE_LENGTH } from "@/lib/profile/contact"
import type { NotificationEventTypeOption } from "@/lib/notifications/catalog"
import type { NotificationPreferencesResponse } from "@/lib/notifications/types"

import { LicensePanel } from "@/components/licenses/license-panel"
import { MAX_REPORT_PROMPT_CHARS } from "@/lib/assistant/limits"
import type { ReportFormat } from "@/lib/reports/document"

const STANDARD_REPORT_MIN_DATE = new Date(2025, 0, 1)
const REPORT_FORMAT_OPTIONS: { value: ReportFormat; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "xlsx", label: "Excel" },
  { value: "docx", label: "Word" },
]
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
  const today = new Date()
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
  const [reportFormat, setReportFormat] = useState<ReportFormat>("pdf")
  const [standardReportRange, setStandardReportRange] = useState<DateRange | undefined>(() => ({
    from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6),
    to: today,
  }))
  const [isReportGenerating, setIsReportGenerating] = useState(false)
  const [reportError, setReportError] = useState("")
  const [reportStatus, setReportStatus] = useState("")

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

  const handleGenerateReport = async () => {
    setReportError("")
    setReportStatus("")

    if (!standardReportRange?.from || !standardReportRange?.to) {
      setReportError("Выберите период отчёта.")
      return
    }

    setIsReportGenerating(true)
    void saveReportPrompt()

    try {
      const response = await fetch("/api/assistant/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: reportPrompt.trim(),
          format: reportFormat,
          period: {
            from: format(standardReportRange.from, "yyyy-MM-dd"),
            to: format(standardReportRange.to, "yyyy-MM-dd"),
          },
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || "Не удалось сформировать отчёт.")
      }
      const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = encoded ? decodeURIComponent(encoded) : `Отчёт.${reportFormat}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setReportStatus("Отчёт скачан и сохранён в истории ИИ-ассистента: там его можно скачать в других форматах.")
      setTimeout(() => setReportStatus(""), 8000)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Не удалось сформировать отчёт.")
    } finally {
      setIsReportGenerating(false)
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
                setReportStatus("")
              }}
              onBlur={() => void saveReportPrompt()}
            />
            <div className="mt-1 h-4 text-xs text-muted-foreground" aria-live="polite">
              {reportPromptState === "saving" ? "Сохраняем..." : reportPromptState === "saved" ? "Запрос сохранён" : ""}
            </div>
          </div>

          <div className="border-t pt-8">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Сформировать отчёт</h3>
              <p className="text-sm text-muted-foreground">
                Без запроса — сводный отчёт по всем данным остановок за период.
              </p>
            </div>
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <Label htmlFor="standard-report-period">Период</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="standard-report-period"
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal md:w-[280px]"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {standardReportRange?.from ? (
                        standardReportRange.to ? (
                          <>
                            {format(standardReportRange.from, "dd.MM.yyyy", { locale: ru })} -{" "}
                            {format(standardReportRange.to, "dd.MM.yyyy", { locale: ru })}
                          </>
                        ) : (
                          format(standardReportRange.from, "dd.MM.yyyy", { locale: ru })
                        )
                      ) : (
                        <span>Выберите период</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      defaultMonth={standardReportRange?.from ?? STANDARD_REPORT_MIN_DATE}
                      selected={standardReportRange}
                      onSelect={setStandardReportRange}
                      numberOfMonths={2}
                      locale={ru}
                      startMonth={STANDARD_REPORT_MIN_DATE}
                      endMonth={today}
                      disabled={(date) =>
                        date < STANDARD_REPORT_MIN_DATE || date > today
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Формат</Label>
                <div className="flex rounded-md border border-input p-0.5" role="radiogroup" aria-label="Формат отчёта">
                  {REPORT_FORMAT_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={reportFormat === option.value}
                      className={`rounded px-3 py-1.5 text-sm transition-colors ${reportFormat === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      onClick={() => setReportFormat(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-2 md:items-end">
                <Button
                  type="button"
                  className="gap-2"
                  disabled={isReportGenerating}
                  aria-busy={isReportGenerating}
                  onClick={handleGenerateReport}
                >
                  {isReportGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ассистент собирает отчёт...
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4" />
                      Сформировать отчёт
                    </>
                  )}
                </Button>
                {reportError && (
                  <p className="max-w-[320px] text-sm text-destructive md:text-right">{reportError}</p>
                )}
                {reportStatus && (
                  <p className="max-w-[360px] text-sm text-muted-foreground md:text-right">{reportStatus}</p>
                )}
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
