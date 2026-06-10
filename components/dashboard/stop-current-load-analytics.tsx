"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import {
    Activity,
    AlertCircle,
    BarChart3,
    Camera,
    Clock3,
    Gauge,
    MapPin,
    Users2,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
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
    fetchBusStopsForLocations,
    fetchBusynessWindows,
    fetchLatestBusynessWindow,
    getBusStopIdFromLocationId,
    type BusynessStopLookup,
    type BusynessWindowRow,
} from "@/lib/api/busyness-windows"
import { STOP_EQUIPPED_COUNT } from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type LoadTone = "normal" | "attention" | "high"

interface RangeBounds {
    from: Date
    to: Date
}

interface HourMinuteLoad {
    avgTotal: number
    maxTotal: number
}

interface HourlyLoadRow {
    hourKey: string
    hourLabel: string
    avgPeople: number
    peakPeople: number
    loadPct: number
    activeLocations: number
    windows: number
}

interface LocationSummary {
    locationId: string
    label: string
    detail: string
    currentPeople: number
    averagePeople: number
    peakPeople: number
    windows: number
    latestAt: string | null
}

interface HeatmapRow {
    locationId: string
    label: string
    detail: string
    cells: Array<{
        hourKey: string
        hourLabel: string
        value: number
    }>
}

interface LoadSummary {
    currentPeople: number
    averagePerLocation: number
    averageHourlyPeople: number
    peakStopPeople: number
    peakStopLabel: string | null
    networkPeakPeople: number
    currentLoadPct: number
    coveragePct: number
    latestAt: string | null
    activeLocations: number
}

const hourlyPeopleConfig = {
    avgPeople: { label: "Среднее по сети", color: "hsl(221, 83%, 53%)" },
    peakPeople: { label: "Суммарный пик сети", color: "hsl(24, 94%, 50%)" },
} satisfies ChartConfig

const loadPercentConfig = {
    loadPct: { label: "Индекс загрузки", color: "hsl(152, 57%, 40%)" },
} satisfies ChartConfig

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })
const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function toFiniteNumber(value: number | null | undefined) {
    return Number.isFinite(value) ? Number(value) : 0
}

function compareLocationId(a: string, b: string) {
    return a.localeCompare(b, "ru", { numeric: true })
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

function floorToMinute(iso: string) {
    const date = new Date(iso)
    date.setSeconds(0, 0)
    return date.toISOString()
}

function floorToHour(iso: string) {
    const date = new Date(iso)
    date.setMinutes(0, 0, 0)
    return date.toISOString()
}

function formatHourLabel(hourKey: string, showDate: boolean) {
    const date = new Date(hourKey)
    return format(date, showDate ? "dd.MM HH:mm" : "HH:mm", { locale: ru })
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

function getAllLocationIds(rows: BusynessWindowRow[]) {
    return Array.from(new Set(rows.map((row) => row.location_id))).sort(compareLocationId)
}

function buildHourlyRows(rows: BusynessWindowRow[], range: RangeBounds) {
    const showDate = range.to.getTime() - range.from.getTime() > 36 * 60 * 60 * 1000
    const hourMap = new Map<
        string,
        {
            minutes: Map<string, HourMinuteLoad>
            locations: Set<string>
            windows: number
        }
    >()

    for (const row of rows) {
        const hourKey = floorToHour(row.window_start)
        const minuteKey = floorToMinute(row.window_start)
        const hour = hourMap.get(hourKey) ?? {
            minutes: new Map<string, HourMinuteLoad>(),
            locations: new Set<string>(),
            windows: 0,
        }
        const minute = hour.minutes.get(minuteKey) ?? { avgTotal: 0, maxTotal: 0 }

        minute.avgTotal += toFiniteNumber(row.person_count_avg)
        minute.maxTotal += toFiniteNumber(row.person_count_max)
        hour.minutes.set(minuteKey, minute)
        hour.locations.add(row.location_id)
        hour.windows += 1
        hourMap.set(hourKey, hour)
    }

    const rawRows = Array.from(hourMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hourKey, hour]) => {
            const minuteValues = Array.from(hour.minutes.values())
            const avgPeople = minuteValues.length
                ? minuteValues.reduce((sum, minute) => sum + minute.avgTotal, 0) / minuteValues.length
                : 0
            const peakPeople = minuteValues.length
                ? Math.max(...minuteValues.map((minute) => minute.maxTotal))
                : 0

            return {
                hourKey,
                hourLabel: formatHourLabel(hourKey, showDate),
                avgPeople: Number(avgPeople.toFixed(1)),
                peakPeople: Number(peakPeople.toFixed(1)),
                activeLocations: hour.locations.size,
                windows: hour.windows,
            }
        })

    const periodPeak = Math.max(...rawRows.map((row) => row.peakPeople), 0)

    return rawRows.map((row) => ({
        ...row,
        loadPct: periodPeak > 0 ? Math.round((row.avgPeople / periodPeak) * 100) : 0,
    }))
}

function buildLocationSummaries(
    rows: BusynessWindowRow[],
    stopLookup: BusynessStopLookup,
): LocationSummary[] {
    const locationMap = new Map<
        string,
        {
            latestRow: BusynessWindowRow | null
            weightedSum: number
            weight: number
            peakPeople: number
            windows: number
        }
    >()

    for (const row of rows) {
        const current = locationMap.get(row.location_id) ?? {
            latestRow: null,
            weightedSum: 0,
            weight: 0,
            peakPeople: 0,
            windows: 0,
        }
        const sampleWeight = Math.max(1, toFiniteNumber(row.sample_count))

        current.weightedSum += toFiniteNumber(row.person_count_avg) * sampleWeight
        current.weight += sampleWeight
        current.peakPeople = Math.max(current.peakPeople, toFiniteNumber(row.person_count_max))
        current.windows += 1

        if (!current.latestRow || row.window_start > current.latestRow.window_start) {
            current.latestRow = row
        }

        locationMap.set(row.location_id, current)
    }

    return Array.from(locationMap.entries())
        .map(([locationId, value]) => {
            const display = buildStopDisplay(locationId, stopLookup)

            return {
                locationId,
                label: display.label,
                detail: display.detail,
                currentPeople: Math.round(toFiniteNumber(value.latestRow?.person_count_avg)),
                averagePeople: value.weight > 0 ? Number((value.weightedSum / value.weight).toFixed(1)) : 0,
                peakPeople: Math.round(value.peakPeople),
                windows: value.windows,
                latestAt: value.latestRow?.window_start ?? null,
            }
        })
        .sort((a, b) => b.currentPeople - a.currentPeople || compareLocationId(a.locationId, b.locationId))
}

function buildHeatmapRows(
    rows: BusynessWindowRow[],
    hours: HourlyLoadRow[],
    locationIds: string[],
    stopLookup: BusynessStopLookup,
): HeatmapRow[] {
    const hourSet = new Set(hours.map((hour) => hour.hourKey))
    const cellMap = new Map<string, Map<string, { sum: number; count: number }>>()

    for (const row of rows) {
        const hourKey = floorToHour(row.window_start)
        if (!hourSet.has(hourKey)) continue

        const locationCells = cellMap.get(row.location_id) ?? new Map<string, { sum: number; count: number }>()
        const cell = locationCells.get(hourKey) ?? { sum: 0, count: 0 }
        cell.sum += toFiniteNumber(row.person_count_avg)
        cell.count += 1
        locationCells.set(hourKey, cell)
        cellMap.set(row.location_id, locationCells)
    }

    return locationIds.map((locationId) => {
        const locationCells = cellMap.get(locationId)
        const display = buildStopDisplay(locationId, stopLookup)

        return {
            locationId,
            label: display.label,
            detail: display.detail,
            cells: hours.map((hour) => {
                const cell = locationCells?.get(hour.hourKey)
                return {
                    hourKey: hour.hourKey,
                    hourLabel: hour.hourLabel,
                    value: cell && cell.count > 0 ? Number((cell.sum / cell.count).toFixed(1)) : 0,
                }
            }),
        }
    })
}

function buildSummary(
    rows: BusynessWindowRow[],
    hourlyRows: HourlyLoadRow[],
    locationSummaries: LocationSummary[],
    range: RangeBounds,
    selectedLocationCount: number,
): LoadSummary {
    const currentPeople = locationSummaries.reduce((sum, location) => sum + location.currentPeople, 0)
    const latestAt = locationSummaries
        .map((location) => location.latestAt)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    const networkPeakPeople = Math.round(Math.max(...hourlyRows.map((row) => row.peakPeople), 0))
    const peakStop = locationSummaries
        .slice()
        .sort((a, b) => b.peakPeople - a.peakPeople || compareLocationId(a.locationId, b.locationId))[0]
    const averageHourlyPeople = hourlyRows.length
        ? hourlyRows.reduce((sum, row) => sum + row.avgPeople, 0) / hourlyRows.length
        : 0
    const expectedWindows = selectedLocationCount * Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 60000))
    const coveragePct = expectedWindows > 0 ? Math.min(100, Math.round((rows.length / expectedWindows) * 100)) : 0

    return {
        currentPeople,
        averagePerLocation: locationSummaries.length > 0 ? currentPeople / locationSummaries.length : 0,
        averageHourlyPeople,
        peakStopPeople: peakStop?.peakPeople ?? 0,
        peakStopLabel: peakStop ? `${peakStop.label}, ${peakStop.detail}` : null,
        networkPeakPeople,
        currentLoadPct: networkPeakPeople > 0 ? Math.min(100, Math.round((currentPeople / networkPeakPeople) * 100)) : 0,
        coveragePct,
        latestAt,
        activeLocations: locationSummaries.length,
    }
}

function getLoadTone(value: number): LoadTone {
    if (value >= 75) return "high"
    if (value >= 45) return "attention"
    return "normal"
}

function getHeatmapCellClass(value: number, maxValue: number) {
    if (maxValue <= 0 || value <= 0) return "bg-muted/40 text-muted-foreground"

    const pct = value / maxValue
    if (pct >= 0.8) return "bg-blue-700 text-white dark:bg-blue-500 dark:text-blue-950"
    if (pct >= 0.6) return "bg-blue-500 text-white dark:bg-blue-400 dark:text-blue-950"
    if (pct >= 0.4) return "bg-sky-300 text-sky-950 dark:bg-sky-500 dark:text-sky-950"
    if (pct >= 0.2) return "bg-sky-100 text-sky-950 dark:bg-sky-900 dark:text-sky-100"
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
    icon: typeof Users2
    tone?: LoadTone
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

export function StopCurrentLoadAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    const [rows, setRows] = useState<BusynessWindowRow[]>([])
    const [stopLookup, setStopLookup] = useState<BusynessStopLookup>({})
    const [fallbackRange, setFallbackRange] = useState<RangeBounds | null>(null)
    const [selectedLocations, setSelectedLocations] = useState<string[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [truncated, setTruncated] = useState(false)
    const [limit, setLimit] = useState(0)

    const range = useMemo(() => getRangeBounds(timeRange), [timeRange])

    useEffect(() => {
        let cancelled = false

        fetchBusynessWindows({ from: range.from, to: range.to })
            .then(async (result) => {
                let nextResult = result
                let nextFallbackRange: RangeBounds | null = null

                if (result.rows.length === 0) {
                    const latestWindow = await fetchLatestBusynessWindow()

                    if (latestWindow) {
                        const latestDate = new Date(latestWindow.window_start)
                        nextFallbackRange = {
                            from: startOfLocalDay(latestDate),
                            to: endOfLocalDay(latestDate),
                        }
                        nextResult = await fetchBusynessWindows({
                            from: nextFallbackRange.from,
                            to: nextFallbackRange.to,
                        })
                    }
                }

                const locationIds = getAllLocationIds(nextResult.rows)
                const nextStopLookup = await fetchBusStopsForLocations(locationIds)

                if (cancelled) return
                setRows(nextResult.rows)
                setStopLookup(nextStopLookup)
                setFallbackRange(nextFallbackRange)
                setTruncated(nextResult.truncated)
                setLimit(nextResult.limit)
            })
            .catch((fetchError: unknown) => {
                if (cancelled) return
                setRows([])
                setStopLookup({})
                setFallbackRange(null)
                setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить данные загруженности")
                setTruncated(false)
                setLimit(0)
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [range])

    const displayedRange = fallbackRange ?? range
    const allLocationIds = useMemo(() => getAllLocationIds(rows), [rows])
    const allLocationIdSet = useMemo(() => new Set(allLocationIds), [allLocationIds])
    const normalizedSelectedLocations = useMemo(
        () => selectedLocations?.filter((locationId) => allLocationIdSet.has(locationId)) ?? null,
        [selectedLocations, allLocationIdSet],
    )
    const effectiveSelectedLocations = normalizedSelectedLocations ?? allLocationIds
    const selectedLocationSet = useMemo(() => new Set(effectiveSelectedLocations), [effectiveSelectedLocations])
    const selectedRows = useMemo(
        () => rows.filter((row) => selectedLocationSet.has(row.location_id)),
        [rows, selectedLocationSet],
    )
    const hourlyRows = useMemo(() => buildHourlyRows(selectedRows, displayedRange), [selectedRows, displayedRange])
    const locationSummaries = useMemo(
        () => buildLocationSummaries(selectedRows, stopLookup),
        [selectedRows, stopLookup],
    )
    const expectedLocationCount = normalizedSelectedLocations
        ? effectiveSelectedLocations.length
        : STOP_EQUIPPED_COUNT
    const summary = useMemo(
        () => buildSummary(selectedRows, hourlyRows, locationSummaries, displayedRange, expectedLocationCount),
        [selectedRows, hourlyRows, locationSummaries, displayedRange, expectedLocationCount],
    )
    const heatmapHours = useMemo(() => hourlyRows.slice(-24), [hourlyRows])
    const heatmapLocationIds = useMemo(
        () => locationSummaries
            .slice()
            .sort((a, b) => b.averagePeople - a.averagePeople || b.peakPeople - a.peakPeople || compareLocationId(a.locationId, b.locationId))
            .slice(0, 10)
            .map((location) => location.locationId),
        [locationSummaries],
    )
    const heatmapRows = useMemo(
        () => buildHeatmapRows(selectedRows, heatmapHours, heatmapLocationIds, stopLookup),
        [selectedRows, heatmapHours, heatmapLocationIds, stopLookup],
    )
    const heatmapMax = Math.max(...heatmapRows.flatMap((row) => row.cells.map((cell) => cell.value)), 0)
    const chartTickInterval = Math.max(0, Math.ceil(hourlyRows.length / 12) - 1)

    const allLocationsSelected = effectiveSelectedLocations.length === allLocationIds.length
    const selectedLabel =
        allLocationIds.length === 0
            ? "Нет направлений"
            : allLocationsSelected
                ? "Все направления"
                : effectiveSelectedLocations.length === 0
                    ? "Не выбрано"
                    : `${effectiveSelectedLocations.length} из ${allLocationIds.length}`

    const toggleAllLocations = () => {
        setSelectedLocations(allLocationsSelected ? [] : null)
    }

    const toggleLocation = (locationId: string) => {
        setSelectedLocations((current) => {
            const base = current ?? allLocationIds
            const next = base.includes(locationId)
                ? base.filter((item) => item !== locationId)
                : [...base, locationId].sort(compareLocationId)

            return next
        })
    }

    const topLocations = locationSummaries.slice(0, 12)
    const selectedEmpty = !loading && rows.length > 0 && selectedRows.length === 0
    const noRows = !loading && rows.length === 0 && !error

    const handleTimeRangeChange = (nextRange: TimeRangeResult) => {
        setTimeRange(nextRange)
        setLoading(true)
        setFallbackRange(null)
        setError(null)
    }

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">Загруженность остановок</h2>
                        <Badge variant="outline" className="gap-1">
                            <Video className="h-3 w-3" />
                            данные загруженности
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Поминутные наблюдения камер агрегируются по часам и остановочным направлениям. Метрики показывают наблюдаемое количество людей, а не уникальных пассажиров.
                    </p>
                </div>

                <div className="text-sm text-muted-foreground lg:text-right">
                    <div>Период: {formatDateTime(displayedRange.from.toISOString())} - {formatDateTime(displayedRange.to.toISOString())}</div>
                    <div>Последние данные: {formatFreshness(summary.latestAt)}</div>
                </div>
            </div>

            <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange}>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2" disabled={allLocationIds.length === 0}>
                            <MapPin className="h-4 w-4" />
                            {selectedLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="all-load-locations"
                                    checked={allLocationsSelected}
                                    onCheckedChange={toggleAllLocations}
                                />
                                <Label htmlFor="all-load-locations" className="font-medium">
                                    Все остановочные направления
                                </Label>
                            </div>
                            <ScrollArea className="max-h-72 border-t pt-2">
                                <div className="space-y-2 pr-3">
                                    {allLocationIds.map((locationId) => {
                                        const inputId = `load-location-${locationId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
                                        const display = buildStopDisplay(locationId, stopLookup)

                                        return (
                                            <div key={locationId} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={inputId}
                                                    checked={effectiveSelectedLocations.includes(locationId)}
                                                    onCheckedChange={() => toggleLocation(locationId)}
                                                />
                                                <Label htmlFor={inputId} className="text-sm">
                                                    <span className="flex flex-col">
                                                        <span>{display.label}</span>
                                                        <span className="text-xs font-normal text-muted-foreground">
                                                            {display.detail}
                                                        </span>
                                                    </span>
                                                </Label>
                                            </div>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        </div>
                    </PopoverContent>
                </Popover>
            </TimeRangeFilter>

            {fallbackRange && !error && (
                <Card className="border-amber-500/30 bg-amber-500/[0.05]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
                        <div>
                            <p className="font-medium text-amber-700 dark:text-amber-300">За выбранный период данных нет</p>
                            <p className="text-sm text-muted-foreground">
                                Показан последний доступный день из данных загруженности: {formatDateTime(fallbackRange.from.toISOString())} - {formatDateTime(fallbackRange.to.toISOString())}.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {loading && rows.length === 0 ? (
                <LoadingGrid />
            ) : !error ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        title="Людей сейчас"
                        value={integerFormat.format(summary.currentPeople)}
                        caption="сумма последних минутных окон"
                        detail={`В среднем ${numberFormat.format(summary.averagePerLocation)} чел. на направление`}
                        icon={Users2}
                        tone={getLoadTone(summary.currentLoadPct)}
                    />
                    <KpiCard
                        title="Среднее за час"
                        value={numberFormat.format(summary.averageHourlyPeople)}
                        caption="среднее одновременное количество людей"
                        detail={`${integerFormat.format(hourlyRows.length)} часовых бакетов в периоде`}
                        icon={BarChart3}
                    />
                    <KpiCard
                        title="Пик на остановке"
                        value={integerFormat.format(summary.peakStopPeople)}
                        caption="максимум на одном остановочном направлении"
                        detail={summary.peakStopLabel ?? "по минутным окнам камер"}
                        icon={Gauge}
                        tone={getLoadTone(summary.currentLoadPct)}
                    />
                    <KpiCard
                        title="Направления с данными"
                        value={`${summary.activeLocations}/${expectedLocationCount}`}
                        caption={`${summary.coveragePct}% ожидаемых минутных окон`}
                        detail={`Обновление: ${formatFreshness(summary.latestAt)}`}
                        icon={Camera}
                        tone={summary.activeLocations < expectedLocationCount ? "attention" : "normal"}
                    />
                </div>
            ) : null}

            {error && (
                <Card className="border-red-500/30 bg-red-500/[0.04]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                        <div>
                            <p className="font-medium text-red-700 dark:text-red-300">Не удалось загрузить данные загруженности</p>
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {truncated && (
                <Card className="border-amber-500/30 bg-amber-500/[0.05]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
                        <div>
                            <p className="font-medium text-amber-700 dark:text-amber-300">Период слишком большой для полной выборки</p>
                            <p className="text-sm text-muted-foreground">
                                Загружено первые {integerFormat.format(limit)} окон. Для точной картины выберите более короткий период.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {(noRows || selectedEmpty) && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                        <div className="rounded-full bg-muted p-4">
                            <Users2 className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium">
                                {selectedEmpty ? "Остановочные направления не выбраны" : "Нет данных за выбранный период"}
                            </h3>
                            <p className="mt-1 max-w-md text-sm text-muted-foreground">
                                {selectedEmpty
                                    ? "Выберите одно или несколько остановочных направлений, чтобы построить текущую загруженность."
                                    : "Нет минутных наблюдений для выбранного диапазона."}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {selectedRows.length > 0 && (
                <>
                    <div className="grid gap-6 xl:grid-cols-12">
                        <Card className="xl:col-span-7">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Activity className="h-5 w-5 text-blue-500" />
                                    Почасовая загрузка
                                </CardTitle>
                                <CardDescription>
                                    Средняя и суммарная пиковая загрузка остановок по часам
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={hourlyPeopleConfig} className="h-[320px] w-full">
                                    <BarChart data={hourlyRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis
                                            dataKey="hourLabel"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={chartTickInterval}
                                        />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="avgPeople" fill="var(--color-avgPeople)" radius={[5, 5, 0, 0]} />
                                        <Bar dataKey="peakPeople" fill="var(--color-peakPeople)" radius={[5, 5, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        <Card className="xl:col-span-5">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Gauge className="h-5 w-5 text-emerald-500" />
                                    Индекс загрузки
                                </CardTitle>
                                <CardDescription>
                                    Доля средней нагрузки от суммарного пика за выбранный период
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={loadPercentConfig} className="h-[320px] w-full">
                                    <AreaChart data={hourlyRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis
                                            dataKey="hourLabel"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={chartTickInterval}
                                        />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Area
                                            type="monotone"
                                            dataKey="loadPct"
                                            stroke="var(--color-loadPct)"
                                            fill="var(--color-loadPct)"
                                            fillOpacity={0.18}
                                        />
                                    </AreaChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Clock3 className="h-5 w-5 text-sky-500" />
                                Тепловая карта: час и остановка
                            </CardTitle>
                            <CardDescription>
                                Среднее наблюдаемое количество людей по остановкам и часам за последние 24 часа выбранного периода
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <div
                                    className="grid min-w-[780px] gap-1 text-xs"
                                    style={{ gridTemplateColumns: `minmax(180px, 1.4fr) repeat(${heatmapHours.length}, minmax(34px, 1fr))` }}
                                >
                                    <div className="px-2 py-1 font-medium text-muted-foreground">Остановка</div>
                                    {heatmapHours.map((hour) => (
                                        <div key={hour.hourKey} className="px-1 py-1 text-center font-medium text-muted-foreground">
                                            {hour.hourLabel.replace(":00", "")}
                                        </div>
                                    ))}

                                    {heatmapRows.map((row) => (
                                        <Fragment key={row.locationId}>
                                            <div className="truncate rounded-md bg-muted/40 px-2 py-1.5">
                                                <div className="truncate font-medium">{row.label}</div>
                                                <div className="truncate text-[10px] text-muted-foreground">{row.detail}</div>
                                            </div>
                                            {row.cells.map((cell) => (
                                                <div
                                                    key={`${row.locationId}-${cell.hourKey}`}
                                                    className={cn(
                                                        "flex h-9 items-center justify-center rounded-md font-medium tabular-nums",
                                                        getHeatmapCellClass(cell.value, heatmapMax),
                                                    )}
                                                    title={`${row.label}, ${cell.hourLabel}: ${numberFormat.format(cell.value)} чел.`}
                                                >
                                                    {cell.value > 0 ? numberFormat.format(cell.value) : "-"}
                                                </div>
                                            ))}
                                        </Fragment>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MapPin className="h-5 w-5 text-violet-500" />
                                Остановки с наблюдениями
                            </CardTitle>
                            <CardDescription>
                                Последнее окно, средняя и пиковая загруженность по выбранному периоду
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Остановка</TableHead>
                                        <TableHead className="text-right">Сейчас</TableHead>
                                        <TableHead className="text-right">Среднее</TableHead>
                                        <TableHead className="text-right">Пик</TableHead>
                                        <TableHead className="text-right">Окна</TableHead>
                                        <TableHead>Последние данные</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {topLocations.map((location) => (
                                        <TableRow key={location.locationId}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{location.label}</span>
                                                    <span className="text-xs text-muted-foreground">{location.detail}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(location.currentPeople)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{numberFormat.format(location.averagePeople)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(location.peakPeople)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(location.windows)}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{formatFreshness(location.latestAt)}</span>
                                                    <span className="text-xs text-muted-foreground">{formatDateTime(location.latestAt)}</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
