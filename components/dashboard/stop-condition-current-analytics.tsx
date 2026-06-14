"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import {
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import {
    AlertCircle,
    CheckCircle2,
    Clock3,
    TimerReset,
    Trash2,
    TriangleAlert,
} from "lucide-react"

import { TimeRangeFilter, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { getBusStopIdFromLocationId } from "@/lib/api/busyness-windows"
import {
    fetchLatestStopConditionWindow,
    fetchStopConditionWindows,
    type FetchStopConditionWindowsResult,
    type StopConditionWindowRow,
} from "@/lib/api/stop-condition-windows"
import {
    fetchCurrentStops,
    type CurrentStopInfo,
    type RangeBounds,
} from "@/lib/api/stop-current-analytics"
import { getStopComplexByLocationId } from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "success" | "attention" | "high"
type ConditionStatus = "ok" | "attention" | "critical"

interface StopConditionAnalyticsData {
    stops: CurrentStopInfo[]
    rows: StopConditionWindowRow[]
    displayedRange: RangeBounds
    fallbackRange: RangeBounds | null
    truncated: boolean
    limit: number
}

interface StopTrashSummary {
    locationId: string
    stopId: number | null
    label: string
    detail: string
    districtName: string
    avgFill: number
    maxFill: number
    latestFill: number
    windows: number
    samples: number
    latestAt: string | null
    status: ConditionStatus
}

interface HourlyTrashRow {
    hour: string
    avgFill: number
    maxFill: number
}

const hourlyConfig = {
    avgFill: { label: "Среднее заполнение", color: "hsl(32, 95%, 53%)" },
    maxFill: { label: "Пиковое заполнение", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const stopConfig = {
    maxFill: { label: "Пик заполнения", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })

function startOfLocalDay(date: Date) {
    const result = new Date(date)
    result.setHours(0, 0, 0, 0)
    return result
}

function endOfLocalDay(date: Date) {
    const result = new Date(date)
    result.setHours(23, 59, 59, 999)
    return result
}

function getRangeBounds(result: TimeRangeResult): RangeBounds {
    const now = new Date()

    if (result.preset === "custom" && result.customRange?.from) {
        return {
            from: startOfLocalDay(result.customRange.from),
            to: result.customRange.to ? endOfLocalDay(result.customRange.to) : endOfLocalDay(result.customRange.from),
        }
    }

    if (result.preset === "yesterday") {
        const yesterday = new Date(now)
        yesterday.setDate(now.getDate() - 1)

        return {
            from: startOfLocalDay(yesterday),
            to: endOfLocalDay(yesterday),
        }
    }

    if (result.preset === "week") {
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 7)

        return {
            from: weekAgo,
            to: now,
        }
    }

    if (result.preset === "month") {
        const monthAgo = new Date(now)
        monthAgo.setDate(now.getDate() - 30)

        return {
            from: monthAgo,
            to: now,
        }
    }

    return {
        from: startOfLocalDay(now),
        to: now,
    }
}

function toFiniteNumber(value: number | null | undefined) {
    return Number.isFinite(value) ? Number(value) : 0
}

function formatDateTime(iso: string | null) {
    if (!iso) return "Нет данных"
    return format(new Date(iso), "dd.MM.yyyy HH:mm", { locale: ru })
}

function formatFreshness(iso: string | null) {
    if (!iso) return "Нет данных"

    const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (diffMinutes < 1) return "только что"
    if (diffMinutes < 60) return `${diffMinutes} мин назад`

    const diffHours = Math.round(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours} ч назад`

    return `${Math.round(diffHours / 24)} дн назад`
}

function getTrashStatus(maxFill: number): ConditionStatus {
    if (maxFill >= 90) return "critical"
    if (maxFill >= 70) return "attention"
    return "ok"
}

function getStatusLabel(status: ConditionStatus) {
    if (status === "critical") return "Критично"
    if (status === "attention") return "Внимание"
    return "Норма"
}

function getStatusClassName(status: ConditionStatus) {
    if (status === "critical") return "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
    if (status === "attention") return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
}

function buildStopDisplay(locationId: string, stopsById: Map<number, CurrentStopInfo>) {
    const monitoredComplex = getStopComplexByLocationId(locationId)
    const stopId = getBusStopIdFromLocationId(locationId)
    const stop = stopId !== null ? stopsById.get(stopId) : undefined
    const label = monitoredComplex?.stopName || stop?.short_name?.trim() || stop?.name?.trim()
    const direction = stop?.description?.trim()

    return {
        stopId,
        label: label || (stopId !== null ? `Остановка ${stopId}` : `Остановочное направление ${locationId}`),
        detail: direction ? `${direction} · ID ${locationId}` : `ID ${locationId}`,
        districtName: monitoredComplex?.districtName ?? stop?.districtName ?? "Район не определен",
    }
}

async function fetchStopConditionAnalyticsData(range: RangeBounds): Promise<StopConditionAnalyticsData> {
    const [stops, initialConditionResult] = await Promise.all([
        fetchCurrentStops(),
        fetchStopConditionWindows({ from: range.from, to: range.to }),
    ])
    let conditionResult: FetchStopConditionWindowsResult = initialConditionResult
    let displayedRange = range
    let fallbackRange: RangeBounds | null = null

    if (initialConditionResult.rows.length === 0) {
        const latestWindow = await fetchLatestStopConditionWindow()

        if (latestWindow) {
            const latestDate = new Date(latestWindow.window_start)
            fallbackRange = {
                from: startOfLocalDay(latestDate),
                to: endOfLocalDay(latestDate),
            }
            displayedRange = fallbackRange
            conditionResult = await fetchStopConditionWindows({
                from: fallbackRange.from,
                to: fallbackRange.to,
            })
        }
    }

    return {
        stops,
        rows: conditionResult.rows,
        displayedRange,
        fallbackRange,
        truncated: conditionResult.truncated,
        limit: conditionResult.limit,
    }
}

function buildStopTrashSummaries(data: StopConditionAnalyticsData): StopTrashSummary[] {
    const stopsById = new Map(data.stops.map((stop) => [stop.id, stop]))
    const locationMap = new Map<
        string,
        {
            latestRow: StopConditionWindowRow | null
            weightedFillSum: number
            weight: number
            maxFill: number
            windows: number
            samples: number
        }
    >()

    for (const row of data.rows) {
        const current = locationMap.get(row.location_id) ?? {
            latestRow: null,
            weightedFillSum: 0,
            weight: 0,
            maxFill: 0,
            windows: 0,
            samples: 0,
        }
        const sampleWeight = Math.max(1, toFiniteNumber(row.sample_count))
        const avgFill = toFiniteNumber(row.trash_fill_avg)

        current.weightedFillSum += avgFill * sampleWeight
        current.weight += sampleWeight
        current.maxFill = Math.max(current.maxFill, toFiniteNumber(row.trash_fill_max))
        current.windows += 1
        current.samples += sampleWeight

        if (!current.latestRow || row.window_start > current.latestRow.window_start) {
            current.latestRow = row
        }

        locationMap.set(row.location_id, current)
    }

    return Array.from(locationMap.entries())
        .map(([locationId, value]) => {
            const display = buildStopDisplay(locationId, stopsById)
            const avgFill = value.weight > 0 ? Number((value.weightedFillSum / value.weight).toFixed(1)) : 0
            const maxFill = Math.round(value.maxFill)

            return {
                locationId,
                stopId: display.stopId,
                label: display.label,
                detail: display.detail,
                districtName: display.districtName,
                avgFill,
                maxFill,
                latestFill: Math.round(toFiniteNumber(value.latestRow?.trash_fill_avg)),
                windows: value.windows,
                samples: value.samples,
                latestAt: value.latestRow?.window_start ?? null,
                status: getTrashStatus(maxFill),
            }
        })
        .sort((a, b) => b.maxFill - a.maxFill || b.avgFill - a.avgFill || a.label.localeCompare(b.label, "ru"))
}

function buildHourlyTrashRows(rows: StopConditionWindowRow[]): HourlyTrashRow[] {
    const hourMap = new Map<string, { weightedFillSum: number; weight: number; maxFill: number }>()

    for (const row of rows) {
        const hour = format(new Date(row.window_start), "HH:00")
        const current = hourMap.get(hour) ?? { weightedFillSum: 0, weight: 0, maxFill: 0 }
        const sampleWeight = Math.max(1, toFiniteNumber(row.sample_count))

        current.weightedFillSum += toFiniteNumber(row.trash_fill_avg) * sampleWeight
        current.weight += sampleWeight
        current.maxFill = Math.max(current.maxFill, toFiniteNumber(row.trash_fill_max))
        hourMap.set(hour, current)
    }

    return Array.from(hourMap.entries())
        .map(([hour, value]) => ({
            hour,
            avgFill: value.weight > 0 ? Number((value.weightedFillSum / value.weight).toFixed(1)) : 0,
            maxFill: Math.round(value.maxFill),
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour))
}

function KpiCard({
    title,
    value,
    caption,
    detail,
    icon: Icon,
    tone = "normal",
}: {
    title: string
    value: string
    caption: string
    detail: string
    icon: typeof Trash2
    tone?: KpiTone
}) {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardDescription>{title}</CardDescription>
                    <CardTitle
                        className={cn(
                            "text-3xl font-semibold tabular-nums",
                            tone === "success" && "text-emerald-600 dark:text-emerald-400",
                            tone === "attention" && "text-amber-600 dark:text-amber-400",
                            tone === "high" && "text-red-600 dark:text-red-400",
                        )}
                    >
                        {value}
                    </CardTitle>
                </div>
                <div
                    className={cn(
                        "rounded-md border p-2",
                        tone === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                        tone === "attention" && "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
                        tone === "high" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
                        tone === "normal" && "border-primary/20 bg-primary/10 text-primary",
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>
            <CardContent className="space-y-1">
                <p className="text-sm text-muted-foreground">{caption}</p>
                <p className="text-xs font-medium text-foreground">{detail}</p>
            </CardContent>
        </Card>
    )
}

function LoadingGrid() {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                    <CardHeader className="pb-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-9 w-20" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-4 w-full" />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function StopConditionCurrentAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    const [data, setData] = useState<StopConditionAnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const range = useMemo(() => getRangeBounds(timeRange), [timeRange])

    useEffect(() => {
        let cancelled = false

        fetchStopConditionAnalyticsData(range)
            .then((result) => {
                if (cancelled) return
                setData(result)
            })
            .catch((fetchError: unknown) => {
                if (cancelled) return
                setData(null)
                setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить состояние остановок")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [range])

    const stopSummaries = useMemo(
        () => data ? buildStopTrashSummaries(data) : [],
        [data],
    )
    const hourlyRows = useMemo(
        () => data ? buildHourlyTrashRows(data.rows) : [],
        [data],
    )
    const latestAt = stopSummaries
        .map((stop) => stop.latestAt)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    const averageFill = stopSummaries.length > 0
        ? Number((stopSummaries.reduce((sum, stop) => sum + stop.avgFill, 0) / stopSummaries.length).toFixed(1))
        : 0
    const maxFill = stopSummaries.reduce((max, stop) => Math.max(max, stop.maxFill), 0)
    const criticalStops = stopSummaries.filter((stop) => stop.status === "critical").length
    const attentionStops = stopSummaries.filter((stop) => stop.status === "attention").length
    const topStopRows = stopSummaries.slice(0, 8)

    const handleTimeRangeChange = (nextRange: TimeRangeResult) => {
        setTimeRange(nextRange)
        setLoading(true)
        setError(null)
    }

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">Состояние остановок</h2>
                        <Badge variant="outline" className="gap-1">
                            <Trash2 className="h-3 w-3" />
                            переполненность урн
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Текущая аналитика по заполнению урн на остановках: средний уровень, пики и точки для первоочередной уборки.
                    </p>
                </div>
                <div className="text-sm text-muted-foreground lg:text-right">
                    <div>Период: {formatDateTime(data?.displayedRange.from.toISOString() ?? range.from.toISOString())} - {formatDateTime(data?.displayedRange.to.toISOString() ?? range.to.toISOString())}</div>
                    <div>Последние данные: {formatFreshness(latestAt)}</div>
                </div>
            </div>

            <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange} />

            {data?.fallbackRange && !error && (
                <Card className="border-amber-500/30 bg-amber-500/[0.05]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
                        <div>
                            <p className="font-medium text-amber-700 dark:text-amber-300">За выбранный период данных по урнам нет</p>
                            <p className="text-sm text-muted-foreground">
                                Показан последний доступный день: {formatDateTime(data.fallbackRange.from.toISOString())} - {formatDateTime(data.fallbackRange.to.toISOString())}.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {loading && !data ? (
                <LoadingGrid />
            ) : error ? (
                <Card className="border-red-500/30 bg-red-500/[0.04]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                        <div>
                            <p className="font-medium text-red-700 dark:text-red-300">Не удалось загрузить состояние остановок</p>
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            ) : data && data.rows.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <div className="rounded-full bg-muted p-4">
                            <Trash2 className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold">Нет данных по переполненности урн</h3>
                            <p className="max-w-md text-sm text-muted-foreground">
                                Источник текущего состояния пока не содержит окон наблюдения за выбранный период.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : data ? (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <KpiCard
                            title="Остановок с данными"
                            value={integerFormat.format(stopSummaries.length)}
                            caption="за выбранный период"
                            detail={`${integerFormat.format(data.rows.length)} окон наблюдения`}
                            icon={Trash2}
                            tone="normal"
                        />
                        <KpiCard
                            title="Среднее заполнение"
                            value={`${numberFormat.format(averageFill)}%`}
                            caption="по остановкам с данными"
                            detail="взвешено по числу кадров"
                            icon={CheckCircle2}
                            tone={averageFill >= 70 ? "attention" : "success"}
                        />
                        <KpiCard
                            title="Пиковое заполнение"
                            value={`${integerFormat.format(maxFill)}%`}
                            caption="максимум за период"
                            detail={maxFill >= 90 ? "есть критические пики" : "без критического пика"}
                            icon={TriangleAlert}
                            tone={maxFill >= 90 ? "high" : maxFill >= 70 ? "attention" : "success"}
                        />
                        <KpiCard
                            title="Требуют внимания"
                            value={integerFormat.format(criticalStops + attentionStops)}
                            caption={`${integerFormat.format(criticalStops)} критично / ${integerFormat.format(attentionStops)} внимание`}
                            detail="порог внимания от 70%, критично от 90%"
                            icon={TimerReset}
                            tone={criticalStops > 0 ? "high" : attentionStops > 0 ? "attention" : "success"}
                        />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-12">
                        <Card className="xl:col-span-7">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Clock3 className="h-5 w-5 text-amber-500" />
                                    Заполнение по часам
                                </CardTitle>
                                <CardDescription>
                                    Среднее и максимальное заполнение урн в выбранном периоде
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={hourlyConfig} className="h-[320px] w-full">
                                    <BarChart data={hourlyRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} unit="%" />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="avgFill" fill="var(--color-avgFill)" radius={[5, 5, 0, 0]} />
                                        <Bar dataKey="maxFill" fill="var(--color-maxFill)" radius={[5, 5, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        <Card className="xl:col-span-5">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Trash2 className="h-5 w-5 text-red-500" />
                                    Точки уборки
                                </CardTitle>
                                <CardDescription>
                                    Остановки с наибольшим пиковым заполнением
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={stopConfig} className="h-[320px] w-full">
                                    <BarChart
                                        data={topStopRows}
                                        layout="vertical"
                                        margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} unit="%" />
                                        <YAxis
                                            type="category"
                                            dataKey="label"
                                            width={126}
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={0}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="maxFill" fill="var(--color-maxFill)" radius={[0, 5, 5, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Сводка по остановкам</CardTitle>
                            <CardDescription>
                                Уровень заполнения урн, статус и последние данные по каждой остановке
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Остановка</TableHead>
                                        <TableHead>Район</TableHead>
                                        <TableHead className="text-right">Сейчас</TableHead>
                                        <TableHead className="text-right">Среднее</TableHead>
                                        <TableHead className="text-right">Пик</TableHead>
                                        <TableHead>Статус</TableHead>
                                        <TableHead>Последние данные</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stopSummaries.map((stop) => (
                                        <TableRow key={stop.locationId}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{stop.label}</span>
                                                    <span className="text-xs text-muted-foreground">{stop.detail}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{stop.districtName}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(stop.latestFill)}%</TableCell>
                                            <TableCell className="text-right tabular-nums">{numberFormat.format(stop.avgFill)}%</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(stop.maxFill)}%</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("border px-2 py-1 text-[11px] font-semibold", getStatusClassName(stop.status))}>
                                                    {getStatusLabel(stop.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{formatFreshness(stop.latestAt)}</span>
                                                    <span className="text-xs text-muted-foreground">{formatDateTime(stop.latestAt)}</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            ) : null}
        </div>
    )
}
