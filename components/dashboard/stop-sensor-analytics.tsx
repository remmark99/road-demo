"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    AlertTriangle,
    ChevronDown,
    Clock3,
    Droplets,
    MapPin,
    RefreshCw,
    ShieldAlert,
    Thermometer,
} from "lucide-react"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import {
    fetchStopSensorHistory,
    type GlassEvent,
    type GlassSensorIssue,
    type StopSensorHistoryResponse,
    type StopSensorSeriesPoint,
} from "@/lib/api/stop-sensor-history"
import { cityRange } from "@/lib/analytics/city-time"
import { sensorCityDay } from "@/lib/sensor-history-period"
import { TimeRangeFilter, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Снимок показаний пишется раз в минуту, чаще опрашивать незачем.
const REFRESH_MS = 30_000
const CHART_DAY_MS = 86_400_000

const CATEGORY_META = {
    temperature: { label: "Температура", unit: "°C", color: "hsl(24, 95%, 53%)", icon: Thermometer },
    humidity: { label: "Влажность", unit: "%", color: "hsl(199, 89%, 48%)", icon: Droplets },
} as const

type KnownCategory = keyof typeof CATEGORY_META

const CHART_CATEGORIES: KnownCategory[] = ["temperature", "humidity"]

function formatDateTime(value: string | null) {
    if (!value) return "—"
    return new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Asia/Yekaterinburg",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value))
}

function formatTimeAgo(value: string | null, nowIso: string | null) {
    if (!value) return "—"
    const now = nowIso ? Date.parse(nowIso) : Date.parse(value)
    const seconds = Math.max(0, Math.round((now - Date.parse(value)) / 1000))
    if (seconds < 60) return `${seconds} с назад`
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes} мин назад`
    return formatDateTime(value)
}

function formatChartTime(value: string, spanMs: number, bucketMinutes: number) {
    const timeZone = "Asia/Yekaterinburg"
    const options: Intl.DateTimeFormatOptions = bucketMinutes >= 1440
        ? { timeZone, day: "2-digit", month: "2-digit" }
        : spanMs > CHART_DAY_MS
            ? { timeZone, day: "2-digit", month: "2-digit", hour: "2-digit" }
            : { timeZone, hour: "2-digit", minute: "2-digit" }
    return new Intl.DateTimeFormat("ru-RU", options).format(new Date(value))
}

function formatValue(category: string, value: number | null) {
    if (value === null) return "—"
    const unit = CATEGORY_META[category as KnownCategory]?.unit ?? ""
    return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`
}

function stopCountLabel(count: number) {
    const mod10 = count % 10
    const mod100 = count % 100
    if (mod10 === 1 && mod100 !== 11) return `${count} остановка`
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} остановки`
    return `${count} остановок`
}

function SensorChart({
    category,
    points,
    spanMs,
    bucketMinutes,
    singleStop,
}: {
    category: KnownCategory
    points: StopSensorSeriesPoint[]
    spanMs: number
    bucketMinutes: number
    singleStop: boolean
}) {
    const meta = CATEGORY_META[category]
    const Icon = meta.icon

    const chartData = useMemo(() => points
        .filter((point) => point.category === category && point.average !== null)
        .map((point) => {
            const avg = point.average as number
            const min = point.minimum ?? avg
            const max = point.maximum ?? avg
            return {
                time: formatChartTime(point.bucket, spanMs, bucketMinutes),
                avg: Number(avg.toFixed(1)),
                low: Number(min.toFixed(1)),
                band: Number((max - min).toFixed(1)),
            }
        }), [bucketMinutes, category, points, spanMs])

    const config = useMemo<ChartConfig>(() => ({
        avg: { label: singleStop ? "Показание" : "Среднее по остановкам", color: meta.color },
    }), [meta.color, singleStop])

    const showDots = chartData.length > 0 && chartData.length <= 2

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5" style={{ color: meta.color }} />
                    {meta.label}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {chartData.length === 0 ? (
                    <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                        Нет показаний за выбранный период
                    </div>
                ) : (
                    <ChartContainer config={config} className="h-[260px] w-full">
                        <ComposedChart data={chartData} margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={34} domain={["auto", "auto"]} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Area dataKey="low" stackId="band" stroke="none" fill="transparent" legendType="none" tooltipType="none" type="monotone" isAnimationActive={false} />
                            <Area dataKey="band" stackId="band" stroke="none" fill={meta.color} fillOpacity={0.14} legendType="none" tooltipType="none" type="monotone" isAnimationActive={false} />
                            <Line type="monotone" dataKey="avg" stroke={meta.color} strokeWidth={2.25} dot={showDots ? { r: 3, fill: meta.color } : false} isAnimationActive={false} connectNulls />
                        </ComposedChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    )
}

function GlassIssuesList({ issues }: { issues: GlassSensorIssue[] }) {
    const [open, setOpen] = useState(false)
    if (issues.length === 0) return null
    const stuck = issues.filter((issue) => issue.status === "stuck").length
    const noisy = issues.length - stuck

    return (
        <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06]">
            <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
            >
                <span className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Требуют проверки: {issues.length}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {stuck > 0 && `залипли ${stuck}`}{stuck > 0 && noisy > 0 && " · "}{noisy > 0 && `шумят ${noisy}`}
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                </span>
            </button>
            {open && (
                <div className="space-y-1.5 border-t border-amber-500/20 px-3 py-2">
                    {issues.map((issue) => (
                        <div key={issue.busStopId} className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate">{issue.busStopLabel}</span>
                            <span className="shrink-0 text-muted-foreground">
                                {issue.status === "stuck"
                                    ? "вход замкнут > 30 мин"
                                    : `шумит${issue.pulses24h !== null ? `: ${issue.pulses24h} за сутки` : ""}`}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function GlassEventsCard({ events, issues }: { events: GlassEvent[]; issues: GlassSensorIssue[] }) {
    const [expanded, setExpanded] = useState(false)
    const shown = expanded ? events.slice(0, 50) : events.slice(0, 5)

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldAlert className="h-5 w-5 text-rose-500" />
                    Разбитие стекла
                </CardTitle>
            </CardHeader>
            <CardContent>
                <GlassIssuesList issues={issues} />
                {events.length === 0 ? (
                    <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                        <ShieldAlert className="h-7 w-7 text-emerald-500/70" />
                        Срабатываний не зафиксировано за выбранный период
                    </div>
                ) : (
                    <div className="space-y-2">
                        {shown.map((event) => (
                            <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{event.busStopLabel}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(event.recordedAt)} по Сургуту</div>
                                </div>
                                <Badge variant="destructive" className="shrink-0">Срабатывание</Badge>
                            </div>
                        ))}
                        {events.length > 5 && (
                            <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((value) => !value)}>
                                {expanded ? "Свернуть" : `Показать все (${events.length})`}
                                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export function StopSensorAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    // null — все остановки, как и в остальных вкладках аналитики.
    const [selectedStops, setSelectedStops] = useState<number[] | null>(null)
    const [data, setData] = useState<StopSensorHistoryResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showAllTable, setShowAllTable] = useState(false)
    const requestRef = useRef(0)

    const { fromDay, toDay } = useMemo(() => {
        const range = cityRange(timeRange)
        return { fromDay: sensorCityDay(range.from), toDay: sensorCityDay(range.to) }
    }, [timeRange])
    const isLiveRange = toDay >= sensorCityDay(new Date())

    // No synchronous setState here: the skeleton shows while data is null, and the
    // loading flag is only cleared after the fetch resolves.
    const loadData = useCallback(async () => {
        const request = ++requestRef.current
        try {
            const next = await fetchStopSensorHistory({ from: fromDay, to: toDay, busStopIds: selectedStops ?? undefined })
            if (request === requestRef.current) {
                setData(next)
                setError(null)
            }
        } catch (loadError) {
            if (request === requestRef.current) {
                setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить историю")
            }
        } finally {
            if (request === requestRef.current) setLoading(false)
        }
    }, [fromDay, selectedStops, toDay])

    // Reload when the period or stops change; only a period reaching today keeps refreshing.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/param fetch
        void loadData()
        if (!isLiveRange) return
        const timer = setInterval(() => { void loadData() }, REFRESH_MS)
        return () => clearInterval(timer)
    }, [isLiveRange, loadData])

    const singleStop = selectedStops?.length === 1
    const series = data?.series ?? []
    const events = data?.events ?? []
    const stops = data?.stops ?? []
    const tableRows = (data?.recent ?? [])
    const shownTable = showAllTable ? tableRows : tableRows.slice(0, 5)

    const spanMs = data ? Date.parse(data.range.to) - Date.parse(data.range.from) : 0
    const isStale = data?.lastRecordedAt
        ? Date.parse(data.generatedAt) - Date.parse(data.lastRecordedAt) > 3 * 60 * 1000
        : true

    const allStopsSelected = selectedStops === null
    const selectedStopsLabel = stops.length === 0
        ? "Нет остановок"
        : allStopsSelected
            ? "Все остановки"
            : selectedStops.length === 0
                ? "Не выбрано"
                : `${selectedStops.length} из ${stops.length}`

    const toggleStop = (stopId: number) => {
        const base = selectedStops ?? stops.map((stop) => stop.id)
        const next = base.includes(stopId) ? base.filter((id) => id !== stopId) : [...base, stopId]
        setSelectedStops(next.length === stops.length ? null : next)
    }

    if (loading && !data) {
        return (
            <div className="space-y-5 p-4 md:p-6">
                <Skeleton className="h-16 w-full" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
                <div className="grid gap-5 xl:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
            </div>
        )
    }

    return (
        <div className="space-y-5 p-4 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">История датчиков</h2>
                        {isLiveRange ? (
                            <Badge variant={isStale ? "destructive" : "secondary"} className="gap-1">
                                {!isStale && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
                                {isStale ? "Нет свежих данных" : "Данные поступают"}
                            </Badge>
                        ) : (
                            <Badge variant="secondary">Архив за период</Badge>
                        )}
                    </div>
                </div>

                <div className="text-sm text-muted-foreground xl:text-right">
                    <div>Период: {formatDateTime(data?.range.from ?? null)} - {formatDateTime(data?.range.to ?? null)}</div>
                    <div>Последние данные: {formatTimeAgo(data?.lastRecordedAt ?? null, data?.generatedAt ?? null)}</div>
                </div>
            </div>

            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2" disabled={stops.length === 0}>
                            <MapPin className="h-4 w-4" />
                            {selectedStopsLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="all-sensor-stops"
                                    checked={allStopsSelected}
                                    onCheckedChange={() => setSelectedStops(allStopsSelected ? [] : null)}
                                />
                                <Label htmlFor="all-sensor-stops" className="font-medium">
                                    Все остановки
                                </Label>
                            </div>
                            <ScrollArea className="max-h-72 border-t pt-2">
                                <div className="space-y-2 pr-3">
                                    {stops.map((stop) => (
                                        <div key={stop.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`sensor-stop-${stop.id}`}
                                                checked={allStopsSelected || selectedStops.includes(stop.id)}
                                                onCheckedChange={() => toggleStop(stop.id)}
                                            />
                                            <Label htmlFor={`sensor-stop-${stop.id}`} className="text-sm">
                                                <span className="flex flex-col">
                                                    <span>{stop.label}</span>
                                                    {stop.detail && (
                                                        <span className="text-xs font-normal text-muted-foreground">{stop.detail}</span>
                                                    )}
                                                </span>
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </PopoverContent>
                </Popover>
                <Button variant="outline" size="icon" onClick={() => void loadData()} disabled={loading} aria-label="Обновить данные">
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
            </TimeRangeFilter>

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-primary" />Остановки с датчиками</div><div className="mt-3 text-3xl font-semibold tabular-nums">{stops.length}</div></CardContent></Card>
                <Card className={events.length ? "border-rose-500/30 bg-rose-500/[0.04]" : ""}><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldAlert className={`h-4 w-4 ${events.length ? "text-rose-500" : "text-emerald-500"}`} />Разбитие стекла</div><div className="mt-3 text-3xl font-semibold tabular-nums">{events.length}{data?.eventsTruncated ? "+" : ""}</div></CardContent></Card>
                <Card><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4 text-violet-500" />Последняя запись</div><div className="mt-3 text-xl font-semibold tabular-nums">{formatTimeAgo(data?.lastRecordedAt ?? null, data?.generatedAt ?? null)}</div></CardContent></Card>
                <Card><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className={`h-4 w-4 ${isLiveRange && isStale ? "text-amber-500" : "text-emerald-500"}`} />Статус данных</div><div className="mt-3 text-xl font-semibold">{!isLiveRange ? "Архив" : isStale ? "Нет свежих" : "В реальном времени"}</div></CardContent></Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
                {CHART_CATEGORIES.map((category) => (
                    <SensorChart key={category} category={category} points={series} spanMs={spanMs} bucketMinutes={data?.bucketMinutes ?? 5} singleStop={singleStop} />
                ))}
                <GlassEventsCard events={events} issues={data?.glassIssues ?? []} />
            </div>

            <Card>
                <CardHeader className="gap-3 pb-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <CardTitle className="text-base">Последние показания</CardTitle>
                    </div>
                    {tableRows.length > 5 && (
                        <Button variant="outline" size="sm" onClick={() => setShowAllTable((value) => !value)}>
                            {showAllTable ? "Показать 5" : `Показать все (${tableRows.length})`}
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader><TableRow><TableHead>Время (Сургут)</TableHead><TableHead>Остановка</TableHead><TableHead>Датчик</TableHead><TableHead className="text-right">Значение</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {shownTable.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Нет данных за выбранный период</TableCell></TableRow>
                                ) : shownTable.map((row) => {
                                    const stop = stops.find((item) => item.id === row.busStopId)
                                    return (
                                        <TableRow key={`${row.busStopId}:${row.category}:${row.recordedAt}`}>
                                            <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(row.recordedAt)}</TableCell>
                                            <TableCell>{stop?.label ?? `Остановка ${row.busStopId}`}</TableCell>
                                            <TableCell>{CATEGORY_META[row.category as KnownCategory]?.label ?? row.name}</TableCell>
                                            <TableCell className="text-right font-medium tabular-nums">{formatValue(row.category, row.value)}</TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
