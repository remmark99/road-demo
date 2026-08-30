"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Mail, Settings, Check, Loader2, HelpCircle, Eye, EyeOff, LayoutGrid, CalendarIcon, FileDown, MessageCircle, ExternalLink, Unplug, ChevronDown } from "lucide-react"
import { useModuleAccess } from "@/components/providers/module-context"
import type { NotificationEventTypeOption } from "@/lib/notifications/catalog"
import type { NotificationPreferencesResponse } from "@/lib/notifications/types"

const STANDARD_REPORT_MIN_DATE = new Date(2025, 0, 1)
const USER_NUMBER_FORMAT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })

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

const MODULE_INFO: Record<string, { name: string; description: string }> = {
  roads: { name: 'Состояние дорог', description: 'Мониторинг дорожного покрытия и уборки' },
  shore: { name: 'Безопасный берег', description: 'Контроль прибрежных зон' },
  stops: { name: 'Остановки', description: 'Аналитика автобусных остановок' },
  parks: { name: 'Безопасный парк', description: 'Мониторинг парковых территорий' },
  transport: { name: 'Контроль транспорта', description: 'Отслеживание транспортных средств' },
  asr: { name: 'Площадки ТКО', description: 'Мониторинг площадок ТКО (мусорных контейнеров)' },
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
  let canvas!: HTMLCanvasElement
  let context!: CanvasRenderingContext2D
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
  const [standardReportRange, setStandardReportRange] = useState<DateRange | undefined>({
    from: STANDARD_REPORT_MIN_DATE,
    to: today,
  })
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
