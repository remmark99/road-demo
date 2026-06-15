"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import jsPDF from "jspdf"
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
const USER_NUMBER_FORMAT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })

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

type AiReportChart = {
  type: "bar"
  title: string
  subtitle?: string
  labels: string[]
  values: number[]
  unit?: string
  tone?: "load" | "peak" | "neutral"
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
  charts?: AiReportChart[]
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

const REPORT_CANVAS_WIDTH = 1240
const REPORT_CANVAS_HEIGHT = 1754
const REPORT_MARGIN = 72

function getReportToneColors(tone: AiReportMetric["tone"]) {
  if (tone === "good") return { accent: "#16703a", bg: "#edf7f0", text: "#14532d" }
  if (tone === "warning") return { accent: "#b45309", bg: "#fff7ed", text: "#7c2d12" }
  if (tone === "critical") return { accent: "#b91c1c", bg: "#fef2f2", text: "#7f1d1d" }
  return { accent: "#475569", bg: "#f8fafc", text: "#334155" }
}

function getReportChartColor(tone: AiReportChart["tone"], index: number) {
  const palettes = {
    load: ["#2563eb", "#0891b2", "#16a34a"],
    peak: ["#f97316", "#dc2626", "#7c3aed"],
    neutral: ["#334155", "#64748b", "#0f766e"],
  }
  const colors = palettes[tone || "neutral"]
  return colors[index % colors.length]
}

function drawRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = text.split("\n")
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ""

    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word
      if (context.measureText(nextLine).width <= maxWidth || !line) {
        line = nextLine
      } else {
        lines.push(line)
        line = word
      }
    }

    if (line) {
      lines.push(line)
    }
  }

  return lines
}

function renderReportPages(report: AiReportResponse) {
  const pages: HTMLCanvasElement[] = []
  let canvas: HTMLCanvasElement
  let context: CanvasRenderingContext2D
  let y = REPORT_MARGIN

  const createPage = () => {
    canvas = document.createElement("canvas")
    canvas.width = REPORT_CANVAS_WIDTH
    canvas.height = REPORT_CANVAS_HEIGHT
    const nextContext = canvas.getContext("2d")

    if (!nextContext) {
      throw new Error("Не удалось подготовить PDF-страницу.")
    }

    context = nextContext
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, REPORT_CANVAS_WIDTH, REPORT_CANVAS_HEIGHT)
    context.fillStyle = "#64748b"
    context.font = "24px Arial, sans-serif"
    context.fillText("Вектор Города", REPORT_MARGIN, 42)
    pages.push(canvas)
    y = REPORT_MARGIN
  }

  const ensureSpace = (height: number) => {
    if (y + height > REPORT_CANVAS_HEIGHT - REPORT_MARGIN) {
      createPage()
    }
  }

  const drawText = (
    text: string,
    x: number,
    maxWidth: number,
    font: string,
    color: string,
    lineHeight: number,
  ) => {
    context.font = font
    context.fillStyle = color
    const lines = wrapCanvasText(context, text, maxWidth)

    for (const line of lines) {
      ensureSpace(lineHeight + 8)
      context.fillText(line, x, y)
      y += lineHeight
    }
  }

  const drawLabel = (label: string, x: number, top: number) => {
    context.font = "18px Arial, sans-serif"
    context.fillStyle = "#64748b"
    context.fillText(label.toUpperCase(), x, top)
  }

  const drawMetaCard = (label: string, value: string, x: number, top: number, width: number) => {
    drawRoundRect(context, x, top, width, 92, 14)
    context.fillStyle = "#f8fafc"
    context.fill()
    context.strokeStyle = "#e2e8f0"
    context.lineWidth = 2
    context.stroke()
    drawLabel(label, x + 22, top + 30)
    context.font = "24px Arial, sans-serif"
    context.fillStyle = "#111827"
    wrapCanvasText(context, value, width - 44).slice(0, 2).forEach((line, index) => {
      context.fillText(line, x + 22, top + 62 + index * 26)
    })
  }

  const drawReportChart = (chart: AiReportChart) => {
    const labels = Array.isArray(chart.labels) ? chart.labels : []
    const values = Array.isArray(chart.values) ? chart.values : []
    const points = labels
      .map((label, index) => ({
        label,
        value: Number.isFinite(values[index]) ? values[index] : 0,
      }))
      .filter((point) => point.label)
      .slice(0, labels.length > 12 ? 24 : 8)

    if (points.length === 0) {
      return
    }

    const chartWidth = REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2
    const isCompactTimeline = points.length > 12
    const chartHeight = isCompactTimeline ? 360 : 148 + points.length * 42

    ensureSpace(chartHeight + 24)
    drawRoundRect(context, REPORT_MARGIN, y, chartWidth, chartHeight, 18)
    context.fillStyle = "#ffffff"
    context.fill()
    context.strokeStyle = "#dbe4ef"
    context.lineWidth = 2
    context.stroke()

    context.font = "bold 28px Arial, sans-serif"
    context.fillStyle = "#111827"
    context.fillText(chart.title, REPORT_MARGIN + 28, y + 42)
    if (chart.subtitle) {
      context.font = "18px Arial, sans-serif"
      context.fillStyle = "#64748b"
      context.fillText(chart.subtitle, REPORT_MARGIN + 28, y + 72)
    }

    const maxValue = Math.max(...points.map((point) => point.value), 1)

    if (isCompactTimeline) {
      const plotX = REPORT_MARGIN + 42
      const plotY = y + 104
      const plotWidth = chartWidth - 84
      const plotHeight = chartHeight - 166
      const gap = 6
      const barWidth = Math.max(10, (plotWidth - gap * (points.length - 1)) / points.length)

      context.strokeStyle = "#e2e8f0"
      context.lineWidth = 1
      for (let i = 0; i <= 4; i += 1) {
        const lineY = plotY + plotHeight - (plotHeight * i) / 4
        context.beginPath()
        context.moveTo(plotX, lineY)
        context.lineTo(plotX + plotWidth, lineY)
        context.stroke()
      }

      points.forEach((point, index) => {
        const barHeight = Math.max(4, (point.value / maxValue) * plotHeight)
        const x = plotX + index * (barWidth + gap)
        const barY = plotY + plotHeight - barHeight
        context.fillStyle = getReportChartColor(chart.tone, index)
        context.fillRect(x, barY, barWidth, barHeight)

        if (index % 3 === 0 || index === points.length - 1) {
          context.font = "14px Arial, sans-serif"
          context.fillStyle = "#64748b"
          context.fillText(point.label.replace(":00", ""), x - 2, plotY + plotHeight + 28)
        }
      })

      context.font = "bold 18px Arial, sans-serif"
      context.fillStyle = "#111827"
      context.fillText(`Максимум: ${USER_NUMBER_FORMAT.format(maxValue)}${chart.unit ? ` ${chart.unit}` : ""}`, plotX, y + chartHeight - 28)
      y += chartHeight + 24
      return
    }

    const labelX = REPORT_MARGIN + 28
    const barX = REPORT_MARGIN + 360
    const barWidth = chartWidth - 470
    let rowY = y + 108

    points.forEach((point, index) => {
      const valueWidth = Math.max(6, (point.value / maxValue) * barWidth)
      context.font = "20px Arial, sans-serif"
      context.fillStyle = "#111827"
      const cleanLabel = point.label.length > 28 ? `${point.label.slice(0, 25)}...` : point.label
      context.fillText(cleanLabel, labelX, rowY + 18)

      drawRoundRect(context, barX, rowY, barWidth, 24, 8)
      context.fillStyle = "#eef2f7"
      context.fill()
      drawRoundRect(context, barX, rowY, valueWidth, 24, 8)
      context.fillStyle = getReportChartColor(chart.tone, index)
      context.fill()

      context.font = "bold 18px Arial, sans-serif"
      context.fillStyle = "#111827"
      context.fillText(`${USER_NUMBER_FORMAT.format(point.value)}${chart.unit ? ` ${chart.unit}` : ""}`, barX + barWidth + 18, rowY + 19)
      rowY += 42
    })

    y += chartHeight + 24
  }

  createPage()

  context.fillStyle = "#111827"
  context.font = "bold 46px Arial, sans-serif"
  const titleLines = wrapCanvasText(context, report.title || "ИИ-отчет", REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2)
  for (const line of titleLines.slice(0, 3)) {
    context.fillText(line, REPORT_MARGIN, y)
    y += 54
  }
  y += 12
  drawText(
    report.subtitle || "Сводный отчет по пользовательскому запросу",
    REPORT_MARGIN,
    REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2,
    "26px Arial, sans-serif",
    "#475569",
    34,
  )
  y += 28

  const sourceLabel = report.source === "gigachat"
    ? "GigaChat + шаблон"
    : report.sourceNote?.toLowerCase().includes("live")
      ? "Live-данные + шаблон"
      : "Демо-шаблон"
  drawMetaCard("Период", getReportPeriodLabel(report), REPORT_MARGIN, y, 520)
  drawMetaCard("Источник", sourceLabel, REPORT_MARGIN + 548, y, 520)
  y += 124

  ensureSpace(150)
  drawRoundRect(context, REPORT_MARGIN, y, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2, 136, 14)
  context.fillStyle = "#f8fafc"
  context.fill()
  context.strokeStyle = "#e2e8f0"
  context.stroke()
  drawLabel("Запрос пользователя", REPORT_MARGIN + 24, y + 34)
  const promptTop = y + 70
  context.font = "24px Arial, sans-serif"
  context.fillStyle = "#111827"
  wrapCanvasText(context, report.prompt || "", REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2 - 48).slice(0, 3).forEach((line, index) => {
    context.fillText(line, REPORT_MARGIN + 24, promptTop + index * 30)
  })
  y += 172

  const metrics = report.metrics || []
  if (metrics.length > 0) {
    ensureSpace(150)
    const cardGap = 18
    const cardWidth = Math.floor((REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2 - cardGap * 2) / 3)
    metrics.slice(0, 6).forEach((metric, index) => {
      if (index > 0 && index % 3 === 0) {
        y += 132
        ensureSpace(132)
      }
      const x = REPORT_MARGIN + (index % 3) * (cardWidth + cardGap)
      const colors = getReportToneColors(metric.tone)
      drawRoundRect(context, x, y, cardWidth, 112, 14)
      context.fillStyle = colors.bg
      context.fill()
      context.strokeStyle = "#e2e8f0"
      context.stroke()
      context.fillStyle = colors.accent
      context.fillRect(x, y, 7, 112)
      context.font = "18px Arial, sans-serif"
      context.fillStyle = "#64748b"
      context.fillText(metric.label, x + 24, y + 34)
      context.font = "bold 25px Arial, sans-serif"
      context.fillStyle = colors.text
      wrapCanvasText(context, metric.value, cardWidth - 48).slice(0, 2).forEach((line, lineIndex) => {
        context.fillText(line, x + 24, y + 70 + lineIndex * 28)
      })
    })
    y += metrics.length > 3 ? 276 : 144
  }

  for (const chart of report.charts || []) {
    drawReportChart(chart)
  }

  for (const section of report.sections || []) {
    ensureSpace(120)
    drawText(section.heading, REPORT_MARGIN, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2, "bold 32px Arial, sans-serif", "#111827", 40)
    y += 4
    drawText(section.body, REPORT_MARGIN, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2, "24px Arial, sans-serif", "#334155", 32)
    y += 8

    for (const bullet of section.bullets || []) {
      context.font = "23px Arial, sans-serif"
      const lines = wrapCanvasText(context, bullet, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2 - 36)
      lines.forEach((line, index) => {
        ensureSpace(32)
        context.fillStyle = "#334155"
        context.fillText(index === 0 ? `• ${line}` : `  ${line}`, REPORT_MARGIN + 12, y)
        y += 32
      })
      y += 2
    }
    y += 24
  }

  ensureSpace(140)
  drawText("Рекомендации", REPORT_MARGIN, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2, "bold 32px Arial, sans-serif", "#111827", 40)
  y += 8
  ;(report.recommendations || []).forEach((item, index) => {
    context.font = "24px Arial, sans-serif"
    const lines = wrapCanvasText(context, item, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2 - 44)
    lines.forEach((line, lineIndex) => {
      ensureSpace(34)
      context.fillStyle = "#334155"
      context.fillText(lineIndex === 0 ? `${index + 1}. ${line}` : `   ${line}`, REPORT_MARGIN, y)
      y += 34
    })
    y += 4
  })

  y += 18
  ensureSpace(100)
  context.strokeStyle = "#e2e8f0"
  context.beginPath()
  context.moveTo(REPORT_MARGIN, y)
  context.lineTo(REPORT_CANVAS_WIDTH - REPORT_MARGIN, y)
  context.stroke()
  y += 34
  const generatedAt = report.generatedAt
    ? format(new Date(report.generatedAt), "dd.MM.yyyy HH:mm", { locale: ru })
    : format(new Date(), "dd.MM.yyyy HH:mm", { locale: ru })
  drawText(`Сформировано: ${generatedAt}`, REPORT_MARGIN, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2, "18px Arial, sans-serif", "#64748b", 25)
  drawText(report.sourceNote || "Отчет сформирован автоматически.", REPORT_MARGIN, REPORT_CANVAS_WIDTH - REPORT_MARGIN * 2, "18px Arial, sans-serif", "#64748b", 25)

  return pages
}

async function downloadReportPdf(report: AiReportResponse) {
  const pdf = new jsPDF("p", "mm", "a4")
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const pages = renderReportPages(report)

  pages.forEach((page, index) => {
    if (index > 0) {
      pdf.addPage()
    }
    pdf.addImage(page.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, pageHeight)
  })

  const date = format(new Date(), "yyyy-MM-dd")
  pdf.save(`vector-city-ai-report-${date}.pdf`)
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
      const isLiveReport = report.sourceNote?.toLowerCase().includes("live")
      setReportStatus(
        isLiveReport
          ? "PDF-отчёт по live-данным сформирован и скачан."
          : report.source === "gigachat"
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
