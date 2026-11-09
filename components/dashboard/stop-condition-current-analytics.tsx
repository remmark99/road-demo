"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import {
    AlertCircle,
    Bell,
    CheckCircle2,
    Clock3,
    ExternalLink,
    TimerReset,
    Trash2,
} from "lucide-react"

import { TimeRangeFilter, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { cityDateTime, cityDayStart, cityHour, cityRange } from "@/lib/analytics/city-time"
import {
    buildTrashOverflowEpisodes,
    episodeOfAlert,
    eventOverlapsRange,
    type TrashOverflowEpisode,
    type TrashOverflowEvent,
} from "@/lib/analytics/trash-episodes"
import { Button } from "@/components/ui/button"
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
import {
    fetchLatestStopTrashOverflowAlert,
    fetchStopTrashOverflowAlerts,
    STOP_TRASH_OVERFLOW_ALERT_TYPES,
    type StopTrashOverflowAlertRow,
} from "@/lib/api/stop-condition-windows"
import {
    buildStopDisplay,
    buildStopIdByCameraIndex,
    fetchCurrentStops,
    fetchStopCameras,
    type CurrentStopInfo,
    type RangeBounds,
} from "@/lib/api/stop-current-analytics"
import { getStopComplexByCameraIndex } from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "success" | "attention" | "high"

interface StopConditionAnalyticsData {
    stops: CurrentStopInfo[]
    stopIdByCameraIndex: Map<number, number>
    events: TrashOverflowEvent[]
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
    totalOverflowMs: number
    longestEpisodeMs: number
    longestEpisodeStartAt: string | null
    longestEpisodeEndAt: string | null
    episodeCount: number
    confirmations: number
    latestAt: string | null
}

interface TrashEpisodeDisplayRow extends TrashOverflowEpisode {
    stopId: number | null
    label: string
    detail: string
    districtName: string
}

interface HourlyTrashRow {
    hour: string
    confirmations: number
    stops: number
}

interface StopDurationChartRow {
    label: string
    totalHours: number
}

const hourlyConfig = {
    stops: { label: "Остановок с переполненной урной", color: "hsl(199, 89%, 48%)" },
} satisfies ChartConfig

const stopConfig = {
    totalHours: { label: "Часы переполнения", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const EPISODE_LOOKBACK_MS = 7 * 86_400_000
const TRASH_EVENT_LIMIT = 5000
const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const TRASH_NOTIFICATION_TYPES = [...STOP_TRASH_OVERFLOW_ALERT_TYPES]

function buildNotificationsHref({
    types,
    cameraIndexes = [],
}: {
    types: readonly string[]
    cameraIndexes?: readonly number[]
}) {
    const params = new URLSearchParams()
    const uniqueTypes = Array.from(new Set(types.filter(Boolean)))
    const uniqueCameraIndexes = Array.from(new Set(cameraIndexes.filter(Number.isFinite)))

    if (uniqueTypes.length > 0) {
        params.set("types", uniqueTypes.join(","))
    }

    if (uniqueCameraIndexes.length > 0) {
        params.set("cameras", uniqueCameraIndexes.join(","))
    }

    const query = params.toString()
    return query ? `/notifications?${query}` : "/notifications"
}

function getTimestampMs(iso: string) {
    const timestamp = new Date(iso).getTime()
    return Number.isFinite(timestamp) ? timestamp : null
}

function getStopCameraIndexCandidates(cameraIndex: number | null) {
    if (cameraIndex === null) return []

    const candidates = [cameraIndex]
    if (cameraIndex >= 10000) {
        candidates.push(cameraIndex - 10000)
    }

    return candidates
}

function getAlertLocationId(alert: StopTrashOverflowAlertRow) {
    const metadataLocation = alert.metadata?.location_id ?? alert.metadata?.locationId ?? alert.metadata?.stop_location_id
    if (typeof metadataLocation === "string" && metadataLocation.trim()) {
        return metadataLocation.trim()
    }

    for (const cameraIndex of getStopCameraIndexCandidates(alert.camera_index)) {
        const complex = getStopComplexByCameraIndex(cameraIndex)
        if (complex) {
            return complex.locationId
        }
    }

    if (typeof alert.camera_index === "number") {
        return `camera-${alert.camera_index}`
    }

    return `alert-${alert.id}`
}

function buildEventsFromTrashAlerts(alerts: StopTrashOverflowAlertRow[]): TrashOverflowEvent[] {
    return alerts
        .map((alert) => ({
            id: alert.id,
            locationId: getAlertLocationId(alert),
            timestamp: alert.timestamp,
            cameraIndex: alert.camera_index,
            episode: episodeOfAlert(alert),
        }))
        .filter((event) => getTimestampMs(event.timestamp) !== null)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

function formatDateTime(iso: string | null) {
    if (!iso) return "Нет данных"
    return cityDateTime(iso).replace(",", "")
}

function formatInterval(startAt: string | null, endAt: string | null) {
    if (!startAt || !endAt) return "Нет данных"

    const start = formatDateTime(startAt)
    const end = formatDateTime(endAt)
    return start.slice(0, 10) === end.slice(0, 10) ? `${start}-${end.slice(11)}` : `${start} - ${end}`
}

function formatEpisodeInterval(episode: TrashOverflowEpisode) {
    return episode.isOpen
        ? `${formatDateTime(episode.startAt)} - продолжается`
        : formatInterval(episode.startAt, episode.endAt)
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

function formatDuration(durationMs: number) {
    const totalMinutes = Math.max(0, Math.round(durationMs / 60000))
    if (totalMinutes === 0) return "0 ч"

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours > 0 && minutes > 0) {
        return `${integerFormat.format(hours)} ч ${integerFormat.format(minutes)} мин`
    }

    if (hours > 0) {
        return `${integerFormat.format(hours)} ч`
    }

    return `${integerFormat.format(minutes)} мин`
}

function durationToHours(durationMs: number) {
    return Number((Math.max(0, durationMs) / 3600000).toFixed(1))
}

async function fetchTrashOverflowEventsForRange(range: RangeBounds) {
    // Записи датируются началом эпизода, поэтому берём с запасом: эпизод мог начаться
    // до периода и ещё идти в нём.
    const alerts = await fetchStopTrashOverflowAlerts({
        from: new Date(range.from.getTime() - EPISODE_LOOKBACK_MS),
        to: range.to,
        limit: TRASH_EVENT_LIMIT,
    })
    const events = buildEventsFromTrashAlerts(alerts).filter((event) => eventOverlapsRange(event, range.from))

    if (events.length > 0) {
        return {
            events,
            displayedRange: range,
            fallbackRange: null,
            truncated: alerts.length >= TRASH_EVENT_LIMIT,
        }
    }

    const latestAlert = await fetchLatestStopTrashOverflowAlert()
    if (!latestAlert) {
        return {
            events: [],
            displayedRange: range,
            fallbackRange: null,
            truncated: false,
        }
    }

    const latestDate = new Date(latestAlert.timestamp)
    const fallbackRange = {
        from: cityDayStart(latestDate),
        to: new Date(cityDayStart(latestDate).getTime() + 86_400_000 - 1),
    }
    const fallbackAlerts = await fetchStopTrashOverflowAlerts({
        from: fallbackRange.from,
        to: fallbackRange.to,
        limit: TRASH_EVENT_LIMIT,
    })

    return {
        events: buildEventsFromTrashAlerts(fallbackAlerts),
        displayedRange: fallbackRange,
        fallbackRange,
        truncated: fallbackAlerts.length >= TRASH_EVENT_LIMIT,
    }
}

async function fetchStopConditionAnalyticsData(range: RangeBounds): Promise<StopConditionAnalyticsData> {
    const [stops, eventResult, cameras] = await Promise.all([
        fetchCurrentStops(),
        fetchTrashOverflowEventsForRange(range),
        fetchStopCameras(),
    ])

    return {
        stops,
        stopIdByCameraIndex: buildStopIdByCameraIndex(cameras, stops),
        events: eventResult.events,
        displayedRange: eventResult.displayedRange,
        fallbackRange: eventResult.fallbackRange,
        truncated: eventResult.truncated,
        limit: TRASH_EVENT_LIMIT,
    }
}

function buildStopTrashSummaries(
    stops: CurrentStopInfo[],
    stopIdByCameraIndex: Map<number, number>,
    episodes: TrashOverflowEpisode[],
): StopTrashSummary[] {
    const stopsById = new Map(stops.map((stop) => [stop.id, stop]))
    const locationMap = new Map<
        string,
        {
            totalOverflowMs: number
            longestEpisode: TrashOverflowEpisode | null
            episodeCount: number
            confirmations: number
            latestAt: string | null
        }
    >()

    for (const episode of episodes) {
        const current = locationMap.get(episode.locationId) ?? {
            totalOverflowMs: 0,
            longestEpisode: null,
            episodeCount: 0,
            confirmations: 0,
            latestAt: null,
        }

        current.totalOverflowMs += episode.durationMs
        current.episodeCount += 1
        current.confirmations += episode.confirmations

        if (!current.latestAt || episode.endAt > current.latestAt) {
            current.latestAt = episode.endAt
        }

        if (!current.longestEpisode || episode.durationMs > current.longestEpisode.durationMs) {
            current.longestEpisode = episode
        }

        locationMap.set(episode.locationId, current)
    }

    return Array.from(locationMap.entries())
        .map(([locationId, value]) => {
            const display = buildStopDisplay(locationId, stopsById, stopIdByCameraIndex)

            return {
                locationId,
                stopId: display.stopId,
                label: display.label,
                detail: display.detail,
                districtName: display.districtName,
                totalOverflowMs: value.totalOverflowMs,
                longestEpisodeMs: value.longestEpisode?.durationMs ?? 0,
                longestEpisodeStartAt: value.longestEpisode?.startAt ?? null,
                longestEpisodeEndAt: value.longestEpisode?.endAt ?? null,
                episodeCount: value.episodeCount,
                confirmations: value.confirmations,
                latestAt: value.latestAt,
            }
        })
        .sort((a, b) => (
            b.totalOverflowMs - a.totalOverflowMs ||
            b.longestEpisodeMs - a.longestEpisodeMs ||
            b.confirmations - a.confirmations ||
            a.label.localeCompare(b.label, "ru")
        ))
}

function buildEpisodeDisplayRows(
    stops: CurrentStopInfo[],
    stopIdByCameraIndex: Map<number, number>,
    episodes: TrashOverflowEpisode[],
): TrashEpisodeDisplayRow[] {
    const stopsById = new Map(stops.map((stop) => [stop.id, stop]))

    return episodes.map((episode) => {
        const display = buildStopDisplay(episode.locationId, stopsById, stopIdByCameraIndex)

        return {
            ...episode,
            stopId: display.stopId,
            label: display.label,
            detail: display.detail,
            districtName: display.districtName,
        }
    })
}

function buildHourlyTrashRows(events: TrashOverflowEvent[]): HourlyTrashRow[] {
    const hourMap = new Map<string, { confirmations: number; locations: Set<string> }>()

    for (const event of events) {
        const hour = `${cityHour(event.timestamp, false).slice(0, 2)}:00`
        const current = hourMap.get(hour) ?? { confirmations: 0, locations: new Set<string>() }

        current.confirmations += 1
        current.locations.add(event.locationId)
        hourMap.set(hour, current)
    }

    return Array.from(hourMap.entries())
        .map(([hour, value]) => ({
            hour,
            confirmations: value.confirmations,
            stops: value.locations.size,
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour))
}

function stopCameraIndexes(episode: TrashEpisodeDisplayRow, stopIdByCameraIndex?: Map<number, number>) {
    if (episode.stopId === null || !stopIdByCameraIndex) return episode.cameraIndexes
    const indexes = Array.from(stopIdByCameraIndex.entries())
        .filter(([, stopId]) => stopId === episode.stopId)
        .map(([cameraIndex]) => cameraIndex)
    return indexes.length > 0 ? indexes : episode.cameraIndexes
}

function episodeDetail(episode: TrashEpisodeDisplayRow) {
    const camera = episode.cameraIndexes.length === 1 ? episode.cameraIndexes[0] : null
    if (camera === null) return episode.detail
    return `${episode.detail} · камера ${camera >= 10000 ? camera - 10000 : camera}`
}

function buildStopDurationChartRows(summaries: StopTrashSummary[]): StopDurationChartRow[] {
    return summaries
        .slice(0, 8)
        .map((summary) => ({
            label: summary.label,
            totalHours: durationToHours(summary.totalOverflowMs),
        }))
}

function KpiCard({
    title,
    value,
    detail,
    icon: Icon,
    tone = "normal",
}: {
    title: string
    value: string
    detail?: string
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
            {detail && (
                <CardContent>
                    <p className="text-xs font-medium text-foreground">{detail}</p>
                </CardContent>
            )}
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

    const range = useMemo(() => cityRange(timeRange), [timeRange])

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

    const episodes = useMemo(
        () => data ? buildTrashOverflowEpisodes(data.events) : [],
        [data],
    )
    const stopSummaries = useMemo(
        () => data ? buildStopTrashSummaries(data.stops, data.stopIdByCameraIndex, episodes) : [],
        [data, episodes],
    )
    const episodeRows = useMemo(
        () => data ? buildEpisodeDisplayRows(data.stops, data.stopIdByCameraIndex, episodes).slice(0, 10) : [],
        [data, episodes],
    )
    const hourlyRows = useMemo(
        () => data ? buildHourlyTrashRows(data.events.filter((event) => getTimestampMs(event.timestamp)! >= data.displayedRange.from.getTime())) : [],
        [data],
    )
    const topStopRows = useMemo(
        () => buildStopDurationChartRows(stopSummaries),
        [stopSummaries],
    )
    const latestAt = (data?.events ?? [])
        .map((event) => event.timestamp)
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    const totalDurationMs = episodes.reduce((sum, episode) => sum + episode.durationMs, 0)
    const longestEpisode = episodes[0] ?? null
    const repeatedEpisodes = episodes.filter((episode) => episode.confirmations > 1).length
    const trashNotificationsHref = buildNotificationsHref({
        types: TRASH_NOTIFICATION_TYPES,
    })

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
                    </div>
                </div>
                <div className="text-sm text-muted-foreground lg:text-right">
                    <div>Период: {formatDateTime(data?.displayedRange.from.toISOString() ?? range.from.toISOString())} - {formatDateTime(data?.displayedRange.to.toISOString() ?? range.to.toISOString())}</div>
                    <div>Последнее подтверждение: {formatFreshness(latestAt)}</div>
                </div>
            </div>

            <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange} />

            {data?.fallbackRange && !error && (
                <Card className="border-amber-500/30 bg-amber-500/[0.05]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
                        <div>
                            <p className="font-medium text-amber-700 dark:text-amber-300">За выбранный период событий по урнам нет</p>
                            <p className="text-sm text-muted-foreground">
                                Показан последний доступный день: {formatDateTime(data.fallbackRange.from.toISOString())} - {formatDateTime(data.fallbackRange.to.toISOString())}.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {data?.truncated && !error && (
                <Card className="border-sky-500/30 bg-sky-500/[0.05]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-sky-500" />
                        <div>
                            <p className="font-medium text-sky-700 dark:text-sky-300">Показана верхняя граница выборки</p>
                            <p className="text-sm text-muted-foreground">
                                За период найдено не меньше {integerFormat.format(data.limit)} подтверждений переполнения. Для полного разбора сузьте период фильтром.
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
            ) : data && data.events.length === 0 ? (
                <Card className="border-emerald-500/30 bg-emerald-500/[0.04]">
                    <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <div className="rounded-full bg-emerald-500/10 p-4">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold">Переполненных урн не зафиксировано</h3>
                            <p className="max-w-md text-sm text-muted-foreground">
                                За выбранный период нет подтвержденных событий переполнения урн на остановках.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : data ? (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <KpiCard
                            title="Остановок с переполнением"
                            value={integerFormat.format(stopSummaries.length)}
                            icon={Trash2}
                            tone="normal"
                        />
                        <KpiCard
                            title="Суммарная длительность"
                            value={formatDuration(totalDurationMs)}
                            icon={Clock3}
                            tone={totalDurationMs > 0 ? "attention" : "success"}
                        />
                        <KpiCard
                            title="Самый долгий эпизод"
                            value={formatDuration(longestEpisode?.durationMs ?? 0)}
                            detail={longestEpisode ? formatInterval(longestEpisode.startAt, longestEpisode.endAt) : undefined}
                            icon={TimerReset}
                            tone={longestEpisode && longestEpisode.durationMs > 0 ? "high" : "success"}
                        />
                        <KpiCard
                            title="Эпизодов"
                            value={integerFormat.format(episodes.length)}
                            icon={AlertCircle}
                            tone={repeatedEpisodes > 0 ? "attention" : "normal"}
                        />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-12">
                        <Card className="xl:col-span-7">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Clock3 className="h-5 w-5 text-amber-500" />
                                    Переполнение по часам суток
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={hourlyConfig} className="h-[320px] w-full">
                                    <BarChart data={hourlyRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="stops" fill="var(--color-stops)" radius={[5, 5, 0, 0]} />
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
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={stopConfig} className="h-[320px] w-full">
                                    <BarChart
                                        data={topStopRows}
                                        layout="vertical"
                                        margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} unit=" ч" />
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
                                        <Bar dataKey="totalHours" fill="var(--color-totalHours)" radius={[0, 5, 5, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1.5">
                                    <CardTitle className="text-base">Эпизоды переполнения</CardTitle>
                                </div>
                                <Button asChild variant="outline" size="sm" className="shrink-0">
                                    <Link href={trashNotificationsHref}>
                                        <Bell className="h-4 w-4" />
                                        Уведомления
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </Link>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Остановка</TableHead>
                                        <TableHead>Район</TableHead>
                                        <TableHead className="text-right">Длительность</TableHead>
                                        <TableHead className="text-right">Подтверждения</TableHead>
                                        <TableHead>Интервал</TableHead>
                                        <TableHead>Последнее подтверждение</TableHead>
                                        <TableHead className="text-right">Уведомления</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {episodeRows.map((episode) => {
                                        const episodeNotificationsHref = buildNotificationsHref({
                                            types: TRASH_NOTIFICATION_TYPES,
                                            // Вся остановка: урну видят несколько камер, а эпизод одной
                                            // из них не должен скрывать в ленте эпизоды остальных.
                                            cameraIndexes: stopCameraIndexes(episode, data?.stopIdByCameraIndex),
                                        })

                                        return (
                                            <TableRow key={episode.id}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{episode.label}</span>
                                                        <span className="text-xs text-muted-foreground">{episodeDetail(episode)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{episode.districtName}</TableCell>
                                                <TableCell className="text-right font-medium tabular-nums">{formatDuration(episode.durationMs)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{integerFormat.format(episode.confirmations)}</TableCell>
                                                <TableCell>{formatEpisodeInterval(episode)}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span>{formatFreshness(episode.lastSeenAt)}</span>
                                                        <span className="text-xs text-muted-foreground">{formatDateTime(episode.lastSeenAt)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button asChild variant="ghost" size="sm" className="h-8">
                                                        <Link href={episodeNotificationsHref}>
                                                            Открыть
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            ) : null}
        </div>
    )
}
