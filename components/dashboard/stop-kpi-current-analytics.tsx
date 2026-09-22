"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import {
    Bar,
    BarChart,
    LabelList,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import {
    AlertCircle,
    Bell,
    BusFront,
    Camera,
    ExternalLink,
    Video,
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
import {
    buildStopLocationSummaries,
    fetchStopCurrentAnalyticsData,
    fetchStopCameras,
    type StopCameraRow,
    type RangeBounds,
    type StopCurrentAnalyticsData,
} from "@/lib/api/stop-current-analytics"
import {
    getStopComplexByLocationId,
    STOP_SAFETY_ALERT_TYPES,
} from "@/lib/stop-analytics-config"
import { fetchStopActivity, type StopActivityResponse } from "@/lib/api/stop-activity"
import { fetchEquipmentState, type EquipmentState } from "@/lib/api/equipment"
import { indexEquipmentStatus, monitoredCameraOnline } from "@/lib/equipment-status"
import { fetchStopDirectory, type BusStopsGeoJSON } from "@/lib/api/bus-stops"
import { fetchStopDistricts } from "@/lib/api/stop-districts"
import { exactStopCoverage, type StopDistrict } from "@/lib/stop-coverage"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "success" | "attention" | "high"

const districtCoverageConfig = {
    coveragePct: { label: "Покрытие", color: "hsl(221, 83%, 53%)" },
} satisfies ChartConfig

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

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

function getCameraIndexesForLocation(locationId: string) {
    const complex = getStopComplexByLocationId(locationId)
    if (!complex) return []

    return Array.from(
        { length: complex.cameraTo - complex.cameraFrom + 1 },
        (_, index) => complex.cameraFrom + index
    )
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

function KpiCard({
    title,
    value,
    icon: Icon,
    tone = "normal",
}: {
    title: string
    value: string
    icon: typeof BusFront
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
                            tone === "high" && "text-red-600 dark:text-red-400",
                            tone === "attention" && "text-amber-600 dark:text-amber-400",
                        )}
                    >
                        {value}
                    </CardTitle>
                </div>
                <div
                    className={cn(
                        "rounded-md border p-2",
                        tone === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                        tone === "high" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
                        tone === "attention" && "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
                        tone === "normal" && "border-primary/20 bg-primary/10 text-primary",
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>

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

export function StopKpiCurrentAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    const [data, setData] = useState<StopCurrentAnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [activity, setActivity] = useState<StopActivityResponse | null>(null)
    const [equipment, setEquipment] = useState<EquipmentState[] | null>(null)
    const [directory, setDirectory] = useState<BusStopsGeoJSON | null>(null)
    const [districts, setDistricts] = useState<StopDistrict[] | null>(null)
    const [currentCameras, setCurrentCameras] = useState<StopCameraRow[] | null>(null)
    const [coverageError, setCoverageError] = useState(false)
    useEffect(() => {
        let cancelled = false
        const load = async () => {
            await Promise.allSettled([
                fetchStopActivity().then(state => { if (!cancelled) setActivity(Object.keys(state.stops).length ? state : null) }),
                fetchEquipmentState().then(devices => { if (!cancelled) setEquipment(devices.error ? null : devices.data) }),
                fetchStopDirectory().then(stops => { if (!cancelled) setDirectory(stops) }),
                fetchStopCameras().then(cameras => { if (!cancelled) setCurrentCameras(cameras) }),
                fetchStopDistricts().then(rows => { if (!cancelled) { setDistricts(rows); setCoverageError(false) } })
                    .catch(() => { if (!cancelled) setCoverageError(true) }),
            ])
        }
        void load()
        const timer = window.setInterval(() => { void load() }, 60_000)
        return () => { cancelled = true; window.clearInterval(timer) }
    }, [])
    const range = useMemo(() => getRangeBounds(timeRange), [timeRange])

    useEffect(() => {
        let cancelled = false

        fetchStopCurrentAnalyticsData(range)
            .then((result) => {
                if (cancelled) return
                setData(result)
            })
            .catch((fetchError: unknown) => {
                if (cancelled) return
                setData(null)
                setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить показатели остановок")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [range])

    const locationSummaries = useMemo(
        () => data ? buildStopLocationSummaries(data) : [],
        [data],
    )
    const latestAt = locationSummaries
        .map((location) => location.latestAt)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    const coverage = useMemo(() => exactStopCoverage(directory ?? { type: 'FeatureCollection', features: [] }, districts ?? [], activity), [directory, districts, activity])
    const districtChartRows = coverage.rows
    const cityStopTotal = directory?.features.length ?? 0
    const cameraStatus = indexEquipmentStatus(equipment).cameras
    const stopIds = new Set((directory?.features ?? []).map(stop => stop.properties.id))
    const cameras = (currentCameras ?? []).filter(c => c.module === 'stops' && (c.bus_stop_id != null ? stopIds.has(c.bus_stop_id) : c.lat != null && c.lng != null))
    const camerasOnline = cameras.filter(c => monitoredCameraOnline(cameraStatus, c.camera_index) ?? c.status === 'online').length
    const sensors = Object.values(activity?.stops ?? {}).filter(s => s.has_controller)
    const sensorsOnline = sensors.filter(s => s.sensors_online).length
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
                        <h2 className="text-xl font-semibold">Показатели остановок</h2>
                        <Badge variant="outline" className="gap-1">
                            <Video className="h-3 w-3" />
                            онлайн-данные
                        </Badge>
                    </div>

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
                            <p className="font-medium text-amber-700 dark:text-amber-300">За выбранный период данных загруженности нет</p>
                            <p className="text-sm text-muted-foreground">
                                Показан последний доступный день из данных загруженности: {formatDateTime(data.fallbackRange.from.toISOString())} - {formatDateTime(data.fallbackRange.to.toISOString())}.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!directory ? (
                <LoadingGrid />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <KpiCard title="Остановок в городе" value={integerFormat.format(cityStopTotal)} icon={BusFront} />
                    <KpiCard title="Камеры в сети" value={equipment && currentCameras ? integerFormat.format(camerasOnline) : '—'} icon={Camera} tone="success" />
                    <KpiCard title="Камеры не в сети" value={equipment && currentCameras ? integerFormat.format(cameras.length - camerasOnline) : '—'} icon={Camera} tone="attention" />
                    <KpiCard title="Остановки с датчиками в сети" value={activity ? integerFormat.format(sensorsOnline) : '—'} icon={BusFront} tone="success" />
                    <KpiCard title="Остановки с датчиками не в сети" value={activity ? integerFormat.format(sensors.length - sensorsOnline) : '—'} icon={BusFront} tone="attention" />
                </div>
            )}

            {error && (
                <Card className="border-red-500/30 bg-red-500/[0.04]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                        <div>
                            <p className="font-medium text-red-700 dark:text-red-300">Не удалось загрузить показатели остановок</p>
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <>
                    <div>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Покрытие по микрорайонам</CardTitle>

                            </CardHeader>
                            <CardContent className="space-y-4">
                                {coverageError && <p role="status" className="text-sm text-muted-foreground">Не удалось загрузить границы микрорайонов</p>}
                                {!coverageError && (!directory || !districts) && <Skeleton className="h-64 w-full" />}
                                {districts && directory && coverage.ambiguous > 0 && <p className="text-sm text-muted-foreground">На границах нескольких районов: {coverage.ambiguous}</p>}
                                {districts && directory && coverage.unassigned > 0 && <p className="text-sm text-muted-foreground">Вне внесённых границ: {coverage.unassigned}</p>}
                                {directory && activity && districtChartRows.length > 0 && <ChartContainer config={districtCoverageConfig} className="h-[260px] w-full">
                                    <BarChart data={districtChartRows} margin={{ left: 0, right: 12, top: 28, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="districtName" tickLine={false} axisLine={false} tickMargin={8} />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                                        <ChartTooltip content={<ChartTooltipContent formatter={(_value, _name, item) => `${Number(item.payload.coveragePct).toFixed(1)}% · ${item.payload.equipped} из ${item.payload.total} ост.`} />} />
                                        <Bar dataKey="coveragePct" fill="var(--color-coveragePct)" radius={[5, 5, 0, 0]}>
                                            <LabelList dataKey="equipped" position="top" formatter={(value: unknown) => `${value} ост.`} />
                                        </Bar>
                                    </BarChart>
                                </ChartContainer>}
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Район</TableHead>
                                            <TableHead className="text-right">Оснащено</TableHead>
                                            <TableHead className="text-right">Всего</TableHead>
                                            <TableHead className="text-right">Покрытие</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {districtChartRows.map((district) => (
                                            <TableRow key={district.districtId}>
                                                <TableCell className="font-medium">{district.districtName}</TableCell>
                                                <TableCell className="text-right tabular-nums">{activity ? integerFormat.format(district.equipped) : "—"}</TableCell>
                                                <TableCell className="text-right tabular-nums">{district.total}</TableCell>
                                                <TableCell className="text-right tabular-nums">{activity && district.total > 0 ? `${district.coveragePct.toLocaleString("ru-RU", {maximumFractionDigits: 1})}%` : "—"}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>

                    {data && <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1.5">
                                    <CardTitle className="text-base">Сводка событий</CardTitle>

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
                                        <TableHead>Остановка</TableHead>
                                        <TableHead>Район</TableHead>
                                        <TableHead className="text-right">Сейчас</TableHead>
                                        <TableHead className="text-right">События</TableHead>
                                        <TableHead>Последние данные</TableHead>
                                        <TableHead className="text-right">Уведомления</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {locationSummaries.slice(0, 12).map((location) => {
                                        const locationNotificationsHref = buildNotificationsHref({
                                            types: STOP_SAFETY_ALERT_TYPES,
                                            cameraIndexes: getCameraIndexesForLocation(location.locationId),
                                        })

                                        return (
                                            <TableRow key={location.locationId}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{location.label}</span>
                                                        <span className="text-xs text-muted-foreground">{location.detail}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{location.districtName}</TableCell>
                                                <TableCell className="text-right tabular-nums">{integerFormat.format(location.currentPeople)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{integerFormat.format(location.safetyEvents)}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span>{formatFreshness(location.latestAt)}</span>
                                                        <span className="text-xs text-muted-foreground">{formatDateTime(location.latestAt)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button asChild variant="ghost" size="sm" className="h-8">
                                                        <Link href={locationNotificationsHref}>
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
                    </Card>}
                </>
        </div>
    )
}
