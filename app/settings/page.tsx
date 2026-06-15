"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import jsPDF from "jspdf"
import * as htmlToImage from "html-to-image"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Send, Mail, Settings, Check, Loader2, HelpCircle, Eye, EyeOff, LayoutGrid, CalendarIcon, FileDown } from "lucide-react"
import { useModuleAccess } from "@/components/providers/module-context"

const STORAGE_KEY = "road-demo-user-settings"
const STANDARD_REPORT_MIN_DATE = new Date(2025, 0, 1)

interface UserSettings {
  email: string
  telegram: string
}

type AiReportMetric = {
  label: string
  value: string
  tone?: "good" | "warning" | "critical" | "neutral"
}

type AiReportSection = {
  heading: string
  body: string
  bullets?: string[]
}

type AiReportResponse = {
  ok?: boolean
  error?: string
  source?: "gigachat" | "template-fallback"
  title?: string
  subtitle?: string
  generatedAt?: string
  prompt?: string
  period?: {
    from?: string
    to?: string
  }
  metrics?: AiReportMetric[]
  sections?: AiReportSection[]
  recommendations?: string[]
  sourceNote?: string
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function getReportToneColor(tone: AiReportMetric["tone"]) {
  if (tone === "good") {
    return "#16703a"
  }
  if (tone === "warning") {
    return "#9a5b00"
  }
  if (tone === "critical") {
    return "#a02424"
  }
  return "#475569"
}

function getReportPeriodLabel(report: AiReportResponse) {
  if (report.period?.from && report.period?.to) {
    return `${report.period.from} - ${report.period.to}`
  }
  if (report.period?.from) {
    return `с ${report.period.from}`
  }
  if (report.period?.to) {
    return `до ${report.period.to}`
  }
  return "период не задан"
}

function buildReportHtml(report: AiReportResponse) {
  const metrics = report.metrics || []
  const sections = report.sections || []
  const recommendations = report.recommendations || []
  const generatedAt = report.generatedAt
    ? format(new Date(report.generatedAt), "dd.MM.yyyy HH:mm", { locale: ru })
    : format(new Date(), "dd.MM.yyyy HH:mm", { locale: ru })
  const sourceLabel = report.source === "gigachat" ? "GigaChat + шаблон" : "Демо-шаблон"

  return `
    <div style="box-sizing:border-box;width:794px;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;padding:36px;">
      <div style="border-bottom:2px solid #111827;padding-bottom:18px;margin-bottom:24px;">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Вектор Города</div>
        <h1 style="font-size:30px;line-height:1.18;margin:0 0 10px;font-weight:700;">${escapeHtml(report.title || "ИИ-отчет")}</h1>
        <p style="font-size:15px;line-height:1.5;color:#475569;margin:0;">${escapeHtml(report.subtitle || "Сводный отчет по пользовательскому запросу")}</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;">
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
          <div style="font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Период</div>
          <div style="font-size:14px;font-weight:700;">${escapeHtml(getReportPeriodLabel(report))}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
          <div style="font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Источник</div>
          <div style="font-size:14px;font-weight:700;">${escapeHtml(sourceLabel)}</div>
        </div>
      </div>

      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:22px;background:#f8fafc;">
        <div style="font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Запрос пользователя</div>
        <div style="font-size:14px;line-height:1.55;">${escapeHtml(report.prompt || "")}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:26px;">
        ${metrics.map((metric) => `
          <div style="border:1px solid #e2e8f0;border-left:4px solid ${getReportToneColor(metric.tone)};border-radius:8px;padding:12px;min-height:82px;">
            <div style="font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:8px;">${escapeHtml(metric.label)}</div>
            <div style="font-size:17px;line-height:1.25;font-weight:700;color:${getReportToneColor(metric.tone)};">${escapeHtml(metric.value)}</div>
          </div>
        `).join("")}
      </div>

      ${sections.map((section) => `
        <section style="margin-bottom:24px;break-inside:avoid;">
          <h2 style="font-size:20px;line-height:1.25;margin:0 0 8px;font-weight:700;">${escapeHtml(section.heading)}</h2>
          <p style="font-size:14px;line-height:1.6;margin:0 0 10px;color:#334155;">${escapeHtml(section.body)}</p>
          ${(section.bullets || []).length > 0 ? `
            <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.55;">
              ${(section.bullets || []).map((item) => `<li style="margin-bottom:5px;">${escapeHtml(item)}</li>`).join("")}
            </ul>
          ` : ""}
        </section>
      `).join("")}

      <section style="border-top:1px solid #e2e8f0;padding-top:18px;margin-top:8px;break-inside:avoid;">
        <h2 style="font-size:20px;line-height:1.25;margin:0 0 10px;font-weight:700;">Рекомендации</h2>
        <ol style="margin:0;padding-left:22px;color:#334155;font-size:14px;line-height:1.6;">
          ${recommendations.map((item) => `<li style="margin-bottom:6px;">${escapeHtml(item)}</li>`).join("")}
        </ol>
      </section>

      <div style="margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.5;">
        <div>Сформировано: ${escapeHtml(generatedAt)}</div>
        <div>${escapeHtml(report.sourceNote || "Отчет сформирован автоматически.")}</div>
      </div>
    </div>
  `
}

async function downloadReportPdf(report: AiReportResponse) {
  const container = document.createElement("div")
  container.style.position = "fixed"
  container.style.left = "-10000px"
  container.style.top = "0"
  container.style.width = "794px"
  container.style.background = "#ffffff"
  container.innerHTML = buildReportHtml(report)
  document.body.appendChild(container)

  try {
    const canvas = await htmlToImage.toCanvas(container, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      cacheBust: true,
    })
    const pdf = new jsPDF("p", "mm", "a4")
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 8
    const imageWidth = pageWidth - margin * 2
    const pageContentHeight = pageHeight - margin * 2
    const fullImageHeight = (canvas.height * imageWidth) / canvas.width
    const pageSliceHeightPx = Math.floor((pageContentHeight / fullImageHeight) * canvas.height)

    let sourceY = 0
    let pageIndex = 0

    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pageSliceHeightPx, canvas.height - sourceY)
      const sliceCanvas = document.createElement("canvas")
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceHeight
      const context = sliceCanvas.getContext("2d")

      if (!context) {
        throw new Error("Не удалось подготовить PDF-страницу.")
      }

      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight,
      )

      if (pageIndex > 0) {
        pdf.addPage()
      }

      const sliceImageHeight = (sliceHeight * imageWidth) / canvas.width
      pdf.addImage(sliceCanvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imageWidth, sliceImageHeight)
      sourceY += sliceHeight
      pageIndex += 1
    }

    const date = format(new Date(), "yyyy-MM-dd")
    pdf.save(`vector-city-ai-report-${date}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
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
  const [isReportGenerating, setIsReportGenerating] = useState(false)
  const [reportError, setReportError] = useState("")
  const [reportStatus, setReportStatus] = useState("")

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

  const handleGenerateReport = async () => {
    const prompt = reportPrompt.trim()
    setReportError("")
    setReportStatus("")

    if (!prompt) {
      setReportError("Введите запрос для отчёта.")
      return
    }

    if (!standardReportRange?.from || !standardReportRange?.to) {
      setReportError("Выберите период отчёта.")
      return
    }

    setIsReportGenerating(true)

    try {
      const response = await fetch("/api/reports/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          period: {
            from: format(standardReportRange.from, "yyyy-MM-dd"),
            to: format(standardReportRange.to, "yyyy-MM-dd"),
          },
        }),
      })
      const report = await response.json() as AiReportResponse

      if (!response.ok || !report.ok) {
        throw new Error(report.error || "Не удалось сформировать отчёт.")
      }

      await downloadReportPdf(report)
      setReportStatus(
        report.source === "gigachat"
          ? "PDF-отчёт сформирован и скачан."
          : "PDF-отчёт скачан по демо-шаблону: GigaChat сейчас недоступен или отвечает слишком долго."
      )
      setTimeout(() => setReportStatus(""), 5000)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Не удалось сформировать отчёт.")
    } finally {
      setIsReportGenerating(false)
    }
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
      {allModules.length > 0 && (
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
              При необходимости можно временно скрыть даже все модули. Это повлияет на карту, аналитику и уведомления.
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
              <p className="text-muted-foreground">Опишите, что должен содержать сводный отчёт. ИИ сформирует его на основе вашего запроса.</p>
            </div>
            <textarea
              id="report-prompt"
              aria-label="Запрос для отчёта"
              className="w-full min-h-[150px] p-4 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              placeholder="Например: Сформируй отчёт о состоянии дорог за последнюю неделю. Включи статистику по загрязнённым участкам, динамику изменений, проблемные районы и рекомендации по улучшению ситуации..."
              value={reportPrompt}
              onChange={(e) => {
                setReportPrompt(e.target.value)
                setReportError("")
                setReportStatus("")
              }}
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
                      Формируем...
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
