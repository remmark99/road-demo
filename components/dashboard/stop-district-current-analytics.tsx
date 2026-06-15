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
    ExternalLink,
    Map,
    MapPin,
    ShieldAlert,
    Users2,
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
    buildStopDistrictSummaries,
    fetchStopCurrentAnalyticsData,
    type RangeBounds,
    type StopDistrictSummary,
    type StopCurrentAnalyticsData,
} from "@/lib/api/stop-current-analytics"
import {
    STOP_SAFETY_ALERT_LABELS,
    STOP_SAFETY_ALERT_TYPES,
    type StopSafetyAlertType,
} from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "attention" | "high"
type AlertFilter = StopSafetyAlertType | "all"

type DistrictEventRow = StopDistrictSummary & {
    selectedSafetyEvents: number
}

const districtStopsConfig = {
    stops: { label: "Подключено", color: "hsl(217, 91%, 60%)" },
} satisfies ChartConfig

const districtLoadConfig = {
    averagePeople: { label: "Средняя загрузка", color: "hsl(199, 89%, 48%)" },
} satisfies ChartConfig

const districtEventsConfig = {
    selectedSafetyEvents: { label: "События", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })

function buildNotificationsHref(types: readonly string[]) {
    const params = new URLSearchParams()
    const uniqueTypes = Array.from(new Set(types.filter(Boolean)))

    if (uniqueTypes.length > 0) {
        params.set("types", uniqueTypes.join(","))
    }

    const query = params.toString()
    return query ? `/notifications?${query}` : "/notifications"
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

function getKpiTone(value: number): KpiTone {
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
    icon: typeof Map
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

export function StopDistrictCurrentAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    const [alertFilter, setAlertFilter] = useState<AlertFilter>("all")
    const [data, setData] = useState<StopCurrentAnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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
                setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить районную аналитику")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [range])

    const districtSummaries = useMemo(
        () => data ? buildStopDistrictSummaries(data) : [],
        [data],
    )
    const districtEventRows: DistrictEventRow[] = useMemo(
        () => districtSummaries
            .map((district) => ({
                ...district,
                selectedSafetyEvents: alertFilter === "all"
                    ? district.safetyEvents
                    : district.safetyEventsByType[alertFilter] ?? 0,
            }))
            .sort((a, b) => (
                b.selectedSafetyEvents - a.selectedSafetyEvents
                || b.averagePeople - a.averagePeople
                || b.stops - a.stops
                || a.districtName.localeCompare(b.districtName, "ru")
            )),
        [districtSummaries, alertFilter],
    )
    const activeDistricts = districtSummaries.filter((district) => district.liveDirections > 0 || district.safetyEvents > 0)
    const connectedDistrictStops = districtSummaries.reduce((sum, district) => sum + district.stops, 0)
    const estimatedDistrictMin = districtSummaries.reduce((sum, district) => sum + district.estimatedTotalMin, 0)
    const estimatedDistrictMax = districtSummaries.reduce((sum, district) => sum + district.estimatedTotalMax, 0)
    const estimatedDistrictLabel = estimatedDistrictMin === estimatedDistrictMax
        ? integerFormat.format(estimatedDistrictMin)
        : `${integerFormat.format(estimatedDistrictMin)}-${integerFormat.format(estimatedDistrictMax)}`
    const liveDirections = districtSummaries.reduce((sum, district) => sum + district.liveDirections, 0)
    const selectedSafetyEvents = districtEventRows.reduce((sum, district) => sum + district.selectedSafetyEvents, 0)
    const alertFilterLabel = alertFilter === "all" ? "Все события" : STOP_SAFETY_ALERT_LABELS[alertFilter]
    const districtNotificationsHref = buildNotificationsHref(
        alertFilter === "all" ? STOP_SAFETY_ALERT_TYPES : [alertFilter]
    )
    const latestAt = districtSummaries
        .map((district) => district.latestAt)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    const stopChartRows = districtSummaries
        .slice()
        .sort((a, b) => b.stops - a.stops || a.districtName.localeCompare(b.districtName, "ru"))
        .slice(0, 8)
    const loadChartRows = districtSummaries
        .slice()
        .sort((a, b) => b.averagePeople - a.averagePeople || b.liveDirections - a.liveDirections || a.districtName.localeCompare(b.districtName, "ru"))
        .slice(0, 8)
    const eventChartRows = districtEventRows.slice(0, 8)

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
                        <h2 className="text-xl font-semibold">Районы</h2>
                        <Badge variant="outline" className="gap-1">
                            <Map className="h-3 w-3" />
                            районная сводка
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Сравнение районов по оснащенным остановкам, онлайн-загруженности и событиям безопасности.
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
                            <p className="font-medium text-amber-700 dark:text-amber-300">За выбранный период данных загруженности нет</p>
                            <p className="text-sm text-muted-foreground">
                                Показан последний доступный день из данных загруженности: {formatDateTime(data.fallbackRange.from.toISOString())} - {formatDateTime(data.fallbackRange.to.toISOString())}.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {loading && !data ? (
                <LoadingGrid />
            ) : !error && data ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        title="Районов в витрине"
                        value={integerFormat.format(districtSummaries.length)}
                        caption="по сопоставлению остановок"
                        detail={`${integerFormat.format(activeDistricts.length)} с онлайн-данными или событиями`}
                        icon={Map}
                    />
                    <KpiCard
                        title="Подключено в районах"
                        value={integerFormat.format(connectedDistrictStops)}
                        caption="остановок с видеонаблюдением"
                        detail={`${estimatedDistrictLabel} всего примерно`}
                        icon={MapPin}
                        tone="attention"
                    />
                    <KpiCard
                        title="Онлайн-направления"
                        value={integerFormat.format(liveDirections)}
                        caption="есть данные загруженности"
                        detail="по оснащенным остановкам"
                        icon={Users2}
                        tone={liveDirections > 0 ? "attention" : "normal"}
                    />
                    <KpiCard
                        title="События за период"
                        value={integerFormat.format(selectedSafetyEvents)}
                        caption={alertFilterLabel}
                        detail="группировка по районам"
                        icon={ShieldAlert}
                        tone={getKpiTone(selectedSafetyEvents)}
                    />
                </div>
            ) : null}

            {error && (
                <Card className="border-red-500/30 bg-red-500/[0.04]">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                        <div>
                            <p className="font-medium text-red-700 dark:text-red-300">Не удалось загрузить районную аналитику</p>
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {data && (
                <>
                    <div className="grid gap-6 xl:grid-cols-12">
                        <Card className="xl:col-span-4">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MapPin className="h-5 w-5 text-blue-500" />
                                    Остановки по районам
                                </CardTitle>
                                <CardDescription>
                                    Количество остановок с видеонаблюдением
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={districtStopsConfig} className="h-[300px] w-full">
                                    <BarChart
                                        data={stopChartRows}
                                        layout="vertical"
                                        margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="districtName"
                                            width={118}
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={0}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="stops" fill="var(--color-stops)" radius={[0, 5, 5, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        <Card className="xl:col-span-4">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <BarChart3 className="h-5 w-5 text-sky-500" />
                                    Средняя загрузка
                                </CardTitle>
                                <CardDescription>
                                    Среднее наблюдаемое количество людей по районам
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={districtLoadConfig} className="h-[300px] w-full">
                                    <BarChart
                                        data={loadChartRows}
                                        layout="vertical"
                                        margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
                                        <YAxis
                                            type="category"
                                            dataKey="districtName"
                                            width={118}
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={0}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="averagePeople" fill="var(--color-averagePeople)" radius={[0, 5, 5, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        <Card className="xl:col-span-4">
                            <CardHeader>
                                <div className="space-y-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-1.5">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <ShieldAlert className="h-5 w-5 text-red-500" />
                                                События по районам
                                            </CardTitle>
                                            <CardDescription>
                                                Гистограмма по выбранному типу события
                                            </CardDescription>
                                        </div>
                                        <Button asChild variant="outline" size="sm" className="shrink-0">
                                            <Link href={districtNotificationsHref}>
                                                <Bell className="h-4 w-4" />
                                                Уведомления
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </Link>
                                        </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={alertFilter === "all" ? "default" : "outline"}
                                            onClick={() => setAlertFilter("all")}
                                        >
                                            Все
                                        </Button>
                                        {STOP_SAFETY_ALERT_TYPES.map((type) => (
                                            <Button
                                                key={type}
                                                type="button"
                                                size="sm"
                                                variant={alertFilter === type ? "default" : "outline"}
                                                onClick={() => setAlertFilter(type)}
                                            >
                                                {STOP_SAFETY_ALERT_LABELS[type]}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={districtEventsConfig} className="h-[300px] w-full">
                                    <BarChart
                                        data={eventChartRows}
                                        layout="vertical"
                                        margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="districtName"
                                            width={118}
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            interval={0}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="selectedSafetyEvents" fill="var(--color-selectedSafetyEvents)" radius={[0, 5, 5, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Районная сводка</CardTitle>
                            <CardDescription>
                                Остановки, онлайн-покрытие, средняя загрузка и реальные события безопасности по районам
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Район</TableHead>
                                        <TableHead className="text-right">Подключено</TableHead>
                                        <TableHead className="text-right">Всего примерно</TableHead>
                                        <TableHead className="text-right">Покрытие</TableHead>
                                        <TableHead className="text-right">Онлайн-данные</TableHead>
                                        <TableHead className="text-right">Загрузка</TableHead>
                                        <TableHead className="text-right">Лежачий человек</TableHead>
                                        <TableHead className="text-right">Курение</TableHead>
                                        <TableHead className="text-right">Бездомные собаки</TableHead>
                                        <TableHead className="text-right">{alertFilterLabel}</TableHead>
                                        <TableHead>Ключевые остановки</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {districtEventRows.map((district) => (
                                        <TableRow key={district.districtName}>
                                            <TableCell className="font-medium">{district.districtName}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(district.stops)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{district.estimatedTotalLabel}</TableCell>
                                            <TableCell className="text-right tabular-nums">{district.coverageLabel}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(district.liveDirections)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{numberFormat.format(district.averagePeople)}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {integerFormat.format(district.safetyEventsByType.lying_person ?? 0)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {integerFormat.format(district.safetyEventsByType.smoking ?? 0)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {integerFormat.format(district.safetyEventsByType.dogs_without_people ?? 0)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(district.selectedSafetyEvents)}</TableCell>
                                            <TableCell>
                                                <div className="max-w-sm truncate text-sm text-muted-foreground">
                                                    {district.connectedStopNames.length > 0
                                                        ? district.connectedStopNames.join(", ")
                                                        : district.topStops.length > 0
                                                            ? district.topStops.join(", ")
                                                            : "Нет онлайн-наблюдений"}
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
