"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Send, Mail, Settings, Check, Loader2, HelpCircle, Eye, EyeOff, LayoutGrid, CalendarIcon } from "lucide-react"
import { useModuleAccess } from "@/components/providers/module-context"

const STORAGE_KEY = "road-demo-user-settings"
const STANDARD_REPORT_MIN_DATE = new Date(2025, 0, 1)

interface UserSettings {
  email: string
  telegram: string
}

const timeOptions = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00",
  "20:00", "21:00", "22:00", "23:00"
]

const dayOptions = [
  { value: "monday", label: "Понедельник" },
  { value: "tuesday", label: "Вторник" },
  { value: "wednesday", label: "Среда" },
  { value: "thursday", label: "Четверг" },
  { value: "friday", label: "Пятница" },
  { value: "saturday", label: "Суббота" },
  { value: "sunday", label: "Воскресенье" },
]
const MODULE_INFO: Record<string, { name: string; description: string }> = {
  roads: { name: 'Состояние дорог', description: 'Мониторинг дорожного покрытия и уборки' },
  shore: { name: 'Безопасный берег', description: 'Контроль прибрежных зон' },
  stops: { name: 'Остановки', description: 'Аналитика автобусных остановок' },
  parks: { name: 'Безопасный парк', description: 'Мониторинг парковых территорий' },
  transport: { name: 'Контроль транспорта', description: 'Отслеживание транспортных средств' },
}

export default function SettingsPage() {
  const { allModules, modules: activeModules, toggleModule } = useModuleAccess()
  const today = new Date()
  const [email, setEmail] = useState("")
  const [telegram, setTelegram] = useState("")
  const [savedEmail, setSavedEmail] = useState("")
  const [savedTelegram, setSavedTelegram] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState("")
  const [reportPrompt, setReportPrompt] = useState("")
  const [selectedTime, setSelectedTime] = useState("09:00")
  const [selectedDay, setSelectedDay] = useState("")
  const [selectedPeriod, setSelectedPeriod] = useState("daily")
  const [standardReportRange, setStandardReportRange] = useState<DateRange | undefined>({
    from: STANDARD_REPORT_MIN_DATE,
    to: today,
  })
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [isReportSaving, setIsReportSaving] = useState(false)
  const [isReportSaved, setIsReportSaved] = useState(false)

  // Load settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const settings: UserSettings = JSON.parse(stored)
        setEmail(settings.email || "")
        setTelegram(settings.telegram || "")
        setSavedEmail(settings.email || "")
        setSavedTelegram(settings.telegram || "")
      } catch (e) {
        console.error("Failed to parse settings:", e)
      }
    }
  }, [])

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email.trim()) {
      setError("Введите email")
      return
    }

    if (!validateEmail(email)) {
      setError("Неверный формат email")
      return
    }

    setIsLoading(true)

    try {
      // Save to localStorage
      const settings: UserSettings = {
        email: email.trim(),
        telegram: telegram.trim()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))

      // Send welcome email if this is a new email
      if (email.trim() !== savedEmail) {
        const response = await fetch("/api/settings/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Ошибка при отправке письма")
        }
      }

      setSavedEmail(email.trim())
      setSavedTelegram(telegram.trim())
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка")
    } finally {
      setIsLoading(false)
    }
  }

  const handleReportSave = () => {
    setIsReportSaving(true)
    // Имитация сохранения
    setTimeout(() => {
      setIsReportSaving(false)
      setIsReportSaved(true)
      setTimeout(() => setIsReportSaved(false), 3000)
    }, 500)
  }

  const hasChanges = email.trim() !== savedEmail || telegram.trim() !== savedTelegram

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
      {/* Module Visibility Toggles */}
      {allModules.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LayoutGrid className="h-5 w-5 text-primary" />
              Отображение модулей
            </CardTitle>
            <CardDescription>
              Выберите, какие модули отображать в интерфейсе. Отключённые модули будут скрыты из карты, аналитики и уведомлений.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allModules.map((moduleId) => {
                const info = MODULE_INFO[moduleId] || { name: moduleId, description: '' }
                const isActive = activeModules.includes(moduleId)
                const canDisable = activeModules.length > 1 || !isActive
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
                      disabled={!canDisable}
                      onCheckedChange={() => toggleModule(moduleId)}
                    />
                  </div>
                )
              })}
            </div>
            {allModules.length > 1 && activeModules.length === 1 && (
              <p className="text-xs text-muted-foreground mt-3">
                Необходимо оставить хотя бы один активный модуль.
              </p>
            )}
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
              <p className="text-muted-foreground">Опишите, что должен содержать сводный отчёт. ИИ сформирует его на основе вашего запроса.</p>
            </div>
            <textarea
              className="w-full min-h-[150px] p-4 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              placeholder="Например: Сформируй отчёт о состоянии дорог за последнюю неделю. Включи статистику по загрязнённым участкам, динамику изменений, проблемные районы и рекомендации по улучшению ситуации..."
              value={reportPrompt}
              onChange={(e) => setReportPrompt(e.target.value)}
            />
          </div>

          <div className="border-t pt-8">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Стандартный отчёт</h3>
              <p className="text-sm text-muted-foreground">
                Выберите период и сформируйте стандартный отчёт по готовому шаблону.
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
                      disabled={(date) =>
                        date < STANDARD_REPORT_MIN_DATE || date > today
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button type="button">Сформировать отчёт</Button>
            </div>
          </div>

          {/* Каналы для уведомлений */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-semibold mb-3">Каналы для уведомлений</h3>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant={telegramEnabled ? "secondary" : "outline"}
                  size="icon"
                  className={telegramEnabled ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : ""}
                  onClick={() => setTelegramEnabled(!telegramEnabled)}
                  title="Telegram"
                >
                  <Send className="h-5 w-5" />
                </Button>
                <span className="text-xs text-muted-foreground">Telegram</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant={emailEnabled ? "secondary" : "outline"}
                  size="icon"
                  className={emailEnabled ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : ""}
                  onClick={() => setEmailEnabled(!emailEnabled)}
                  title="Email"
                >
                  <Mail className="h-5 w-5" />
                </Button>
                <span className="text-xs text-muted-foreground">Email</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Периодичность рассылки</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedPeriod === "daily" ? "secondary" : "outline"}
                  className={selectedPeriod === "daily" ? "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                  onClick={() => setSelectedPeriod("daily")}
                >
                  Раз в день
                </Button>
                <Button
                  variant={selectedPeriod === "weekly" ? "secondary" : "outline"}
                  className={selectedPeriod === "weekly" ? "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                  onClick={() => setSelectedPeriod("weekly")}
                >
                  Раз в неделю
                </Button>
                <Button
                  variant={selectedPeriod === "monthly" ? "secondary" : "outline"}
                  className={selectedPeriod === "monthly" ? "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                  onClick={() => setSelectedPeriod("monthly")}
                >
                  Раз в месяц
                </Button>
                <Button
                  variant={selectedPeriod === "yearly" ? "secondary" : "outline"}
                  className={selectedPeriod === "yearly" ? "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                  onClick={() => setSelectedPeriod("yearly")}
                >
                  Раз в год
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-4">
              {selectedPeriod !== "daily" && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">День отправки:</Label>
                  <Select value={selectedDay} onValueChange={setSelectedDay}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Выберите день" />
                    </SelectTrigger>
                    <SelectContent>
                      {dayOptions.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Время отправки:</Label>
                <Select value={selectedTime} onValueChange={setSelectedTime}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Время" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Кнопка сохранить для отчёта */}
          <div className="flex justify-end">
            <Button
              onClick={handleReportSave}
              disabled={isReportSaving}
              className="gap-2"
            >
              {isReportSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : isReportSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  Сохранено!
                </>
              ) : (
                "Сохранить настройки отчёта"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email & Telegram Settings Card - теперь внизу */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Email для уведомлений
          </CardTitle>
          <CardDescription>
            На этот адрес будут приходить уведомления о событиях на дорогах.
            После сохранения мы отправим вам приветственное письмо.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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
              <div className="space-y-2">
                <Label htmlFor="telegram">Telegram</Label>
                <Input
                  id="telegram"
                  type="text"
                  placeholder="@nickname"
                  value={telegram}
                  onChange={(e) => {
                    setTelegram(e.target.value)
                  }}
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center gap-3">
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
                    Сохранено!
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>

              {savedEmail && (
                <span className="text-sm text-muted-foreground">
                  Текущий email: {savedEmail}
                </span>
              )}
            </div>
          </form>
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
