"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
    BarChart3,
    Bell,
    Camera,
    Cigarette,
    Clock3,
    ExternalLink,
    MapPin,
    PackageSearch,
    PawPrint,
    ShieldAlert,
    UserRound,
} from "lucide-react"

import { TimeRangeFilter, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Badge } from "@/components/ui/badge"
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
import { ALERT_TYPE_CONFIG, fetchStopSafetyAlerts, type StopSafetyAlert } from "@/lib/api/alerts"
import {
    fetchBusStopsForLocations,
    getBusStopIdFromLocationId,
    type BusynessStopLookup,
} from "@/lib/api/busyness-windows"
import {
    STOP_SAFETY_ALERT_LABELS,
    STOP_SAFETY_ALERT_TYPES,
    type StopSafetyAlertType,
} from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type AlertTone = "normal" | "attention" | "high"
type PeriodBucket = "auto" | "hour" | "day" | "week"
type ResolvedPeriodBucket = Exclude<PeriodBucket, "auto">

interface RangeBounds {
    from: Date
    to: Date
}

interface PeriodAlertRow {
    bucketKey: string
    bucketLabel: string
    events: number
    cameras: number
    stops: number
}

interface HourOfDayAlertRow {
    hour: number
    hourLabel: string
    events: number
    cameras: number
    stops: number
}

interface LocationAlertSummary {
    locationId: string
    label: string
    detail: string
    count: number
    latestAt: string | null
    cameraIndexes: number[]
    averageConfidence: number | null
}

interface TypeAlertSummary {
    type: StopSafetyAlertType
    label: string
    count: number
    latestAt: string | null
}

interface AlertSummary {
    totalEvents: number
    activeStops: number
    cameras: number
    latestAt: string | null
    peakHourEvents: number
    peakHourLabel: string | null
}

const periodAlertsConfig = {
    events: { label: "События", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const hourOfDayAlertsConfig = {
    events: { label: "События", color: "hsl(39, 92%, 50%)" },
} satisfies ChartConfig

const PERIOD_BUCKET_LABELS: Record<PeriodBucket, string> = {
    auto: "Авто",
    hour: "По часам",
    day: "По дням",
    week: "По неделям",
}

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

function getAlertCameraIndexes(alert: StopSafetyAlert) {
    return typeof alert.camera_index === "number" ? [alert.camera_index] : []
}

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })

function compareLocationId(a: string, b: string) {
    return a.localeCompare(b, "ru", { numeric: true })
}

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

function formatConfidence(value: number | null | undefined) {
    if (typeof value !== "number") return "-"
    if (value <= 1) return `${Math.round(value * 100)}%`
    return numberFormat.format(value)
}

function formatDuration(seconds: number | null | undefined) {
    if (typeof seconds !== "number") return "-"
    if (seconds < 60) return `${numberFormat.format(seconds)} с`

    return `${numberFormat.format(seconds / 60)} мин`
}

function getAlertLocationId(alert: StopSafetyAlert) {
    return typeof alert.metadata?.location_id === "string" ? alert.metadata.location_id : null
}

function buildStopDisplay(locationId: string, stopLookup: BusynessStopLookup) {
    const stopId = getBusStopIdFromLocationId(locationId)
    const stop = stopId !== null ? stopLookup[stopId] : undefined
    const label = stop?.short_name?.trim() || stop?.name?.trim()
    const direction = stop?.description?.trim()

    return {
        label: label || (stopId !== null ? `Остановка ${stopId}` : `Остановочное направление ${locationId}`),
        detail: direction ? `${direction} · № ${locationId}` : `№ ${locationId}`,
    }
}

function getAllAlertLocationIds(alerts: StopSafetyAlert[]) {
    return Array.from(new Set(
        alerts
            .map(getAlertLocationId)
            .filter((locationId): locationId is string => Boolean(locationId))
    )).sort(compareLocationId)
}

function getAutoPeriodBucket(range: RangeBounds): ResolvedPeriodBucket {
    const durationMs = range.to.getTime() - range.from.getTime()
    const dayMs = 24 * 60 * 60 * 1000

    if (durationMs <= 36 * 60 * 60 * 1000) return "hour"
    if (durationMs <= 45 * dayMs) return "day"

    return "week"
}

function resolvePeriodBucket(bucket: PeriodBucket, range: RangeBounds): ResolvedPeriodBucket {
    return bucket === "auto" ? getAutoPeriodBucket(range) : bucket
}

function startOfLocalWeek(date: Date) {
    const result = startOfLocalDay(date)
    const day = result.getDay()
    const daysFromMonday = day === 0 ? 6 : day - 1

    result.setDate(result.getDate() - daysFromMonday)

    return result
}

function getPeriodBucketDate(date: Date, bucket: ResolvedPeriodBucket) {
    if (bucket === "hour") {
        const result = new Date(date)
        result.setMinutes(0, 0, 0)
        return result
    }

    if (bucket === "week") {
        return startOfLocalWeek(date)
    }

    return startOfLocalDay(date)
}

function formatPeriodBucketLabel(bucketKey: string, bucket: ResolvedPeriodBucket, range: RangeBounds) {
    const date = new Date(bucketKey)

    if (bucket === "hour") {
        const showDate = range.to.getTime() - range.from.getTime() > 36 * 60 * 60 * 1000
        return format(date, showDate ? "dd.MM HH:mm" : "HH:mm", { locale: ru })
    }

    if (bucket === "week") {
        const weekEnd = new Date(date)
        weekEnd.setDate(date.getDate() + 6)
        return `${format(date, "dd.MM", { locale: ru })}-${format(weekEnd, "dd.MM", { locale: ru })}`
    }

    return format(date, "EEE dd.MM", { locale: ru })
}

function buildPeriodAlertRows(
    alerts: StopSafetyAlert[],
    range: RangeBounds,
    bucket: ResolvedPeriodBucket,
): PeriodAlertRow[] {
    const bucketMap = new Map<string, { events: number; cameras: Set<number>; stops: Set<string> }>()

    for (const alert of alerts) {
        const bucketKey = getPeriodBucketDate(new Date(alert.timestamp), bucket).toISOString()
        const current = bucketMap.get(bucketKey) ?? {
            events: 0,
            cameras: new Set<number>(),
            stops: new Set<string>(),
        }
        const locationId = getAlertLocationId(alert)

        current.events += 1
        if (typeof alert.camera_index === "number") current.cameras.add(alert.camera_index)
        if (locationId) current.stops.add(locationId)
        bucketMap.set(bucketKey, current)
    }

    return Array.from(bucketMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucketKey, value]) => ({
            bucketKey,
            bucketLabel: formatPeriodBucketLabel(bucketKey, bucket, range),
            events: value.events,
            cameras: value.cameras.size,
            stops: value.stops.size,
        }))
}

function buildHourOfDayAlertRows(alerts: StopSafetyAlert[]): HourOfDayAlertRow[] {
    const hourMap = new Map<number, { events: number; cameras: Set<number>; stops: Set<string> }>()

    for (let hour = 0; hour < 24; hour += 1) {
        hourMap.set(hour, {
            events: 0,
            cameras: new Set<number>(),
            stops: new Set<string>(),
        })
    }

    for (const alert of alerts) {
        const hour = new Date(alert.timestamp).getHours()
        const current = hourMap.get(hour)
        if (!current) continue

        const locationId = getAlertLocationId(alert)
        current.events += 1
        if (typeof alert.camera_index === "number") current.cameras.add(alert.camera_index)
        if (locationId) current.stops.add(locationId)
    }

    return Array.from(hourMap.entries()).map(([hour, value]) => ({
        hour,
        hourLabel: String(hour).padStart(2, "0"),
        events: value.events,
        cameras: value.cameras.size,
        stops: value.stops.size,
    }))
}

function buildLocationSummaries(
    alerts: StopSafetyAlert[],
    stopLookup: BusynessStopLookup,
): LocationAlertSummary[] {
    const locationMap = new Map<string, StopSafetyAlert[]>()

    for (const alert of alerts) {
        const locationId = getAlertLocationId(alert)
        if (!locationId) continue

        const current = locationMap.get(locationId) ?? []
        current.push(alert)
        locationMap.set(locationId, current)
    }

    return Array.from(locationMap.entries())
        .map(([locationId, locationAlerts]) => {
            const display = buildStopDisplay(locationId, stopLookup)
            const sortedAlerts = locationAlerts.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            const cameraIndexes = Array.from(
                new Set(
                    locationAlerts
                        .map((alert) => alert.camera_index)
                        .filter((cameraIndex): cameraIndex is number => cameraIndex !== null)
                )
            ).sort((a, b) => a - b)
            const confidenceValues = locationAlerts
                .map((alert) => alert.severity)
                .filter((value): value is number => typeof value === "number")
            const averageConfidence = confidenceValues.length
                ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
                : null

            return {
                locationId,
                label: display.label,
                detail: display.detail,
                count: locationAlerts.length,
                latestAt: sortedAlerts[0]?.timestamp ?? null,
                cameraIndexes,
                averageConfidence,
            }
        })
        .sort((a, b) => b.count - a.count || compareLocationId(a.locationId, b.locationId))
}

function buildTypeSummaries(alerts: StopSafetyAlert[]): TypeAlertSummary[] {
    return STOP_SAFETY_ALERT_TYPES.map((type) => {
        const typeAlerts = alerts.filter((alert) => alert.alert_type === type)
        const latestAt = typeAlerts
            .map((alert) => alert.timestamp)
            .sort((a, b) => b.localeCompare(a))[0] ?? null

        return {
            type,
            label: STOP_SAFETY_ALERT_LABELS[type],
            count: typeAlerts.length,
            latestAt,
        }
    })
}

function buildSummary(
    alerts: StopSafetyAlert[],
    hourOfDayRows: HourOfDayAlertRow[],
    locationSummaries: LocationAlertSummary[],
): AlertSummary {
    const cameras = new Set(
        alerts
            .map((alert) => alert.camera_index)
            .filter((cameraIndex): cameraIndex is number => cameraIndex !== null)
    )
    const latestAt = alerts
        .map((alert) => alert.timestamp)
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    const peakHour = hourOfDayRows
        .slice()
        .sort((a, b) => b.events - a.events || a.hour - b.hour)[0]

    return {
        totalEvents: alerts.length,
        activeStops: locationSummaries.length,
        cameras: cameras.size,
        latestAt,
        peakHourEvents: peakHour?.events ?? 0,
        peakHourLabel: peakHour ? `${peakHour.hourLabel}:00` : null,
    }
}

function getAlertTypeIcon(type: StopSafetyAlertType) {
    if (type === "smoking") return Cigarette
    if (type === "abandoned_object") return PackageSearch
    if (type === "dogs_without_people") return PawPrint
    if (type === "lying_person") return UserRound

    return ShieldAlert
}

function getAlertTypeColor(type: StopSafetyAlertType) {
    if (type === "smoking") return "text-orange-500 bg-orange-500/10 border-orange-500/20"
    if (type === "abandoned_object") return "text-violet-500 bg-violet-500/10 border-violet-500/20"
    if (type === "dogs_without_people") return "text-amber-500 bg-amber-500/10 border-amber-500/20"
    if (type === "lying_person") return "text-red-500 bg-red-500/10 border-red-500/20"

    return "text-primary bg-primary/10 border-primary/20"
}

function getAlertTone(value: number): AlertTone {
    if (value >= 20) return "high"
    if (value > 0) return "attention"
    return "normal"
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
    icon: typeof ShieldAlert
    tone?: AlertTone
}) {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardDescription>{title}</CardDescription>
                    <CardTitle
                        className={cn(
                            "text-3xl font-semibold tabular-nums",
                            tone === "high" && "text-red-600 dark:text-red-400",
                            tone === "attention" && "text-amber-600 dark:text-amber-400",
                            tone === "normal" && "text-foreground",
                        )}
                    >
                        {value}
                    </CardTitle>
                </div>
                <div
                    className={cn(
                        "rounded-md border p-2",
                        tone === "high" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
                        tone === "attention" && "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
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

export function StopLyingPersonAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    const [periodBucket, setPeriodBucket] = useState<PeriodBucket>("auto")
    const [alerts, setAlerts] = useState<StopSafetyAlert[]>([])
    const [stopLookup, setStopLookup] = useState<BusynessStopLookup>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const range = useMemo(() => getRangeBounds(timeRange), [timeRange])
    const resolvedPeriodBucket = useMemo(() => resolvePeriodBucket(periodBucket, range), [periodBucket, range])

    useEffect(() => {
        let cancelled = false

        fetchStopSafetyAlerts({ from: range.from, to: range.to })
            .then(async (result) => {
                const locationIds = getAllAlertLocationIds(result)
                const nextStopLookup = await fetchBusStopsForLocations(locationIds)

                if (cancelled) return
                setAlerts(result)
                setStopLookup(nextStopLookup)
                setError(null)
            })
            .catch((fetchError: unknown) => {
                if (cancelled) return
                setAlerts([])
                setStopLookup({})
                setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить события")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [range])

    const periodRows = useMemo(
        () => buildPeriodAlertRows(alerts, range, resolvedPeriodBucket),
        [alerts, range, resolvedPeriodBucket],
    )
    const hourOfDayRows = useMemo(() => buildHourOfDayAlertRows(alerts), [alerts])
    const locationSummaries = useMemo(
        () => buildLocationSummaries(alerts, stopLookup),
        [alerts, stopLookup],
    )
    const summary = useMemo(
        () => buildSummary(alerts, hourOfDayRows, locationSummaries),
        [alerts, hourOfDayRows, locationSummaries],
    )
    const typeSummaries = useMemo(() => buildTypeSummaries(alerts), [alerts])
    const latestAlerts = useMemo(
        () => alerts.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5),
        [alerts],
    )
    const periodTickInterval = Math.max(0, Math.ceil(periodRows.length / 8) - 1)
    const noRows = !loading && alerts.length === 0 && !error
    const safetyNotificationsHref = buildNotificationsHref({
        types: STOP_SAFETY_ALERT_TYPES,
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
                        <h2 className="text-xl font-semibold">События безопасности</h2>
                        <Badge variant="outline" className="gap-1">
                            <ShieldAlert className="h-3 w-3" />
                            события
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Реальные события видеоаналитики по остановочным павильонам. Экран показывает количество событий, камеры, остановки и время фиксации без отображения кадров.
                    </p>
                </div>

                <div className="text-sm text-muted-foreground lg:text-right">
                    <div>Период: {formatDateTime(range.from.toISOString())} - {formatDateTime(range.to.toISOString())}</div>
                    <div>Последнее событие: {formatFreshness(summary.latestAt)}</div>
                </div>
            </div>

            <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange} />

            {loading && alerts.length === 0 ? (
                <LoadingGrid />
            ) : !error ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        title="Событий за период"
                        value={integerFormat.format(summary.totalEvents)}
                        caption="лежачие люди, курение, предметы, собаки"
                        detail="только события остановок"
                        icon={ShieldAlert}
                        tone={getAlertTone(summary.totalEvents)}
                    />
                    <KpiCard
                        title="Остановок с событиями"
                        value={integerFormat.format(summary.activeStops)}
                        caption="по остановочным направлениям"
                        detail={summary.activeStops > 0 ? "названия из справочника" : "за период нет событий"}
                        icon={MapPin}
                        tone={summary.activeStops > 0 ? "attention" : "normal"}
                    />
                    <KpiCard
                        title="Камер"
                        value={integerFormat.format(summary.cameras)}
                        caption="уникальные камеры"
                        detail={`Последнее: ${formatFreshness(summary.latestAt)}`}
                        icon={Camera}
                        tone={summary.cameras > 0 ? "attention" : "normal"}
                    />
                    <KpiCard
                        title="Пиковый час"
                        value={integerFormat.format(summary.peakHourEvents)}
                        caption="максимум событий за час"
                        detail={summary.peakHourLabel ?? "за период событий нет"}
                        icon={Clock3}
                        tone={getAlertTone(summary.peakHourEvents)}
                    />
                </div>
            ) : null}

            {error && (
                <Card className="border-red-500/30 bg-red-500/[0.04]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                        <div>
                            <p className="font-medium text-red-700 dark:text-red-300">Не удалось загрузить события</p>
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {noRows && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                        <div className="rounded-full bg-muted p-4">
                            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium">Нет событий за выбранный период</h3>
                            <p className="mt-1 max-w-md text-sm text-muted-foreground">
                                За выбранный период нет событий по лежачим людям, курению или бездомным собакам.
                                Если появятся оставленные предметы, они будут учтены в этой же витрине.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {alerts.length > 0 && (
                <>
                    <div className="grid gap-6 xl:grid-cols-12">
                        <Card className="xl:col-span-7">
                            <CardHeader>
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <BarChart3 className="h-5 w-5 text-red-500" />
                                            Распределение по периоду
                                        </CardTitle>
                                        <CardDescription>
                                            События группируются по выбранной детализации периода
                                        </CardDescription>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(["auto", "hour", "day", "week"] as const).map((bucket) => (
                                            <Button
                                                key={bucket}
                                                type="button"
                                                size="sm"
                                                variant={periodBucket === bucket ? "default" : "outline"}
                                                onClick={() => setPeriodBucket(bucket)}
                                            >
                                                {PERIOD_BUCKET_LABELS[bucket]}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={periodAlertsConfig} className="h-[320px] w-full">
                                    <BarChart data={periodRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis
                                            dataKey="bucketLabel"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={periodTickInterval}
                                            angle={resolvedPeriodBucket === "hour" ? -35 : 0}
                                            textAnchor={resolvedPeriodBucket === "hour" ? "end" : "middle"}
                                            height={resolvedPeriodBucket === "hour" ? 58 : 30}
                                        />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="events" fill="var(--color-events)" radius={[5, 5, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Текущий режим: {PERIOD_BUCKET_LABELS[resolvedPeriodBucket]}.
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="xl:col-span-5">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Clock3 className="h-5 w-5 text-amber-500" />
                                    Профиль по часам суток
                                </CardTitle>
                                <CardDescription>
                                    Сумма событий за выбранный период по часам 00-23
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={hourOfDayAlertsConfig} className="h-[320px] w-full">
                                    <BarChart data={hourOfDayRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis
                                            dataKey="hourLabel"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={0}
                                        />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="events" fill="var(--color-events)" radius={[5, 5, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MapPin className="h-5 w-5 text-violet-500" />
                                Остановки с событиями
                            </CardTitle>
                            <CardDescription>
                                Топ остановочных направлений по количеству фиксаций
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {locationSummaries.slice(0, 8).map((location) => (
                                <div key={location.locationId} className="rounded-lg border bg-muted/20 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{location.label}</div>
                                            <div className="truncate text-xs text-muted-foreground">{location.detail}</div>
                                        </div>
                                        <div className="rounded-md bg-red-500/10 px-2 py-1 text-sm font-semibold tabular-nums text-red-600 dark:text-red-300">
                                            {integerFormat.format(location.count)}
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span>Последнее: {formatFreshness(location.latestAt)}</span>
                                        {location.cameraIndexes.length > 0 && (
                                            <span>Камеры: {location.cameraIndexes.join(", ")}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ShieldAlert className="h-5 w-5 text-red-500" />
                                Типы событий
                            </CardTitle>
                            <CardDescription>
                                Распределение реальных событий остановок по подтвержденным типам
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {typeSummaries.map((item) => {
                                const Icon = getAlertTypeIcon(item.type)

                                return (
                                    <div key={item.type} className={cn("rounded-lg border p-4", getAlertTypeColor(item.type))}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="text-sm font-medium">{item.label}</div>
                                                <div className="text-2xl font-semibold tabular-nums">{integerFormat.format(item.count)}</div>
                                            </div>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="mt-3 text-xs opacity-80">
                                            Последнее: {formatFreshness(item.latestAt)}
                                        </div>
                                    </div>
                                )
                            })}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1.5">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <ShieldAlert className="h-5 w-5 text-red-500" />
                                        Последние события
                                    </CardTitle>
                                    <CardDescription>
                                        Реальные записи событий без отображения изображений и кадров
                                    </CardDescription>
                                </div>
                                <Button asChild variant="outline" size="sm" className="shrink-0">
                                    <Link href={safetyNotificationsHref}>
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
                                        <TableHead>Тип</TableHead>
                                        <TableHead>Остановка</TableHead>
                                        <TableHead>Время</TableHead>
                                        <TableHead className="text-right">Камера</TableHead>
                                        <TableHead className="text-right">Уверенность</TableHead>
                                        <TableHead className="text-right">Детали</TableHead>
                                        <TableHead className="text-right">Уведомления</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {latestAlerts.map((alert) => {
                                        const locationId = getAlertLocationId(alert)
                                        const display = locationId
                                            ? buildStopDisplay(locationId, stopLookup)
                                            : { label: "Остановка не определена", detail: `Камера ${alert.camera_index ?? "-"}` }
                                        const config = ALERT_TYPE_CONFIG[alert.alert_type]
                                        const Icon = getAlertTypeIcon(alert.alert_type)
                                        const alertNotificationsHref = buildNotificationsHref({
                                            types: [alert.alert_type],
                                            cameraIndexes: getAlertCameraIndexes(alert),
                                        })

                                        return (
                                            <TableRow key={alert.id}>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn("gap-1.5", getAlertTypeColor(alert.alert_type))}>
                                                        <Icon className="h-3.5 w-3.5" />
                                                        {config?.label ?? STOP_SAFETY_ALERT_LABELS[alert.alert_type]}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{display.label}</span>
                                                        <span className="text-xs text-muted-foreground">{display.detail}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span>{formatDateTime(alert.timestamp)}</span>
                                                        <span className="text-xs text-muted-foreground">{formatFreshness(alert.timestamp)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{alert.camera_index ?? "-"}</TableCell>
                                                <TableCell className="text-right tabular-nums">{formatConfidence(alert.severity)}</TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {alert.alert_type === "lying_person"
                                                        ? formatDuration(alert.metadata?.lying_duration_seconds)
                                                        : "-"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button asChild variant="ghost" size="sm" className="h-8">
                                                        <Link href={alertNotificationsHref}>
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
            )}
        </div>
    )
}
