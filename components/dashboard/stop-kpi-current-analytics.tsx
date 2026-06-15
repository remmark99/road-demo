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
    BusFront,
    Camera,
    CheckCircle2,
    MapPin,
    Target,
    Video,
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
import {
    buildStopDistrictSummaries,
    buildStopLocationSummaries,
    fetchStopCurrentAnalyticsData,
    type RangeBounds,
    type StopCurrentAnalyticsData,
} from "@/lib/api/stop-current-analytics"
import {
    STOP_CITY_TOTAL,
    STOP_EQUIPPED_COUNT,
    STOP_EQUIPMENT_PLAN_TARGET,
    STOP_LIVE_CAMERA_COUNT,
    STOP_OPERATIONAL_COUNT,
} from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "success" | "attention" | "high"

const districtCoverageConfig = {
    coveragePct: { label: "Оценка покрытия", color: "hsl(221, 83%, 53%)" },
} satisfies ChartConfig

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

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
    caption,
    detail,
    icon: Icon,
    tone = "normal",
}: {
    title: string
    value: string
    caption: string
    detail: string
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

function ProgressRow({
    label,
    value,
    pct,
    tone = "normal",
}: {
    label: string
    value: string
    pct: number
    tone?: KpiTone
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
                <div
                    className={cn(
                        "h-full rounded-full",
                        tone === "success" && "bg-emerald-500",
                        tone === "attention" && "bg-amber-500",
                        tone === "high" && "bg-red-500",
                        tone === "normal" && "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
            </div>
        </div>
    )
}

export function StopKpiCurrentAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
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
    const districtSummaries = useMemo(
        () => data ? buildStopDistrictSummaries(data) : [],
        [data],
    )
    const latestAt = locationSummaries
        .map((location) => location.latestAt)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    const liveStopIds = new Set(
        locationSummaries
            .filter((location) => location.windows > 0 && location.stopId !== null)
            .map((location) => location.stopId)
            .filter((stopId): stopId is number => stopId !== null)
    )
    const totalStops = data?.stops.length ?? 0
    const cityStopTotal = Math.max(totalStops, STOP_CITY_TOTAL)
    const readyPct = STOP_EQUIPMENT_PLAN_TARGET > 0 ? (STOP_EQUIPPED_COUNT / STOP_EQUIPMENT_PLAN_TARGET) * 100 : 0
    const operationalPct = STOP_EQUIPPED_COUNT > 0 ? (STOP_OPERATIONAL_COUNT / STOP_EQUIPPED_COUNT) * 100 : 0
    const liveDataPct = STOP_EQUIPPED_COUNT > 0 ? (liveStopIds.size / STOP_EQUIPPED_COUNT) * 100 : 0
    const districtChartRows = districtSummaries
        .slice()
        .sort((a, b) => b.coveragePct - a.coveragePct)
        .slice(0, 8)

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
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Сводка текущего состояния остановок по данным камер, загруженности и событий безопасности.
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
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <KpiCard
                        title="Остановок в городе"
                        value={integerFormat.format(cityStopTotal)}
                        caption="городской справочник"
                        detail="полный городской реестр"
                        icon={BusFront}
                        tone="normal"
                    />
                    <KpiCard
                        title="План оснащения"
                        value={integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)}
                        caption="план дооснащения"
                        detail={`${integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)} остановок планируется дооснастить`}
                        icon={MapPin}
                        tone="attention"
                    />
                    <KpiCard
                        title="Готово"
                        value={integerFormat.format(STOP_EQUIPPED_COUNT)}
                        caption="оснащено сейчас"
                        detail={`${integerFormat.format(STOP_EQUIPPED_COUNT)} из ${integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)} плановых`}
                        icon={Target}
                        tone="success"
                    />
                    <KpiCard
                        title="Живые камеры"
                        value={integerFormat.format(STOP_LIVE_CAMERA_COUNT)}
                        caption="камер в системе"
                        detail="на 10 оснащенных остановках"
                        icon={Camera}
                        tone="success"
                    />
                    <KpiCard
                        title="Исправность"
                        value={`${integerFormat.format(operationalPct)}%`}
                        caption="доступно сейчас"
                        detail={`${integerFormat.format(STOP_OPERATIONAL_COUNT)} из ${integerFormat.format(STOP_EQUIPPED_COUNT)} остановок в строю`}
                        icon={CheckCircle2}
                        tone="success"
                    />
                </div>
            ) : null}

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

            {data && (
                <>
                    <div className="grid gap-6 xl:grid-cols-12">
                        <Card className="xl:col-span-5">
                            <CardHeader>
                                <CardTitle className="text-base">Оснащение и исправность</CardTitle>
                                <CardDescription>
                                    Городской справочник, оснащение и текущая доступность
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <ProgressRow
                                    label="Всего остановок в городе"
                                    value={integerFormat.format(cityStopTotal)}
                                    pct={100}
                                />
                                <ProgressRow
                                    label="Готово сейчас"
                                    value={`${integerFormat.format(STOP_EQUIPPED_COUNT)} из ${integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)}`}
                                    pct={readyPct}
                                    tone="success"
                                />
                                <ProgressRow
                                    label="Живые камеры в системе"
                                    value={integerFormat.format(STOP_LIVE_CAMERA_COUNT)}
                                    pct={100}
                                    tone="success"
                                />
                                <ProgressRow
                                    label="Исправность оснащенных"
                                    value={`${integerFormat.format(STOP_OPERATIONAL_COUNT)} из ${integerFormat.format(STOP_EQUIPPED_COUNT)} (${integerFormat.format(operationalPct)}%)`}
                                    pct={operationalPct}
                                    tone="success"
                                />
                                <ProgressRow
                                    label="Онлайн-данные за период"
                                    value={`${integerFormat.format(liveStopIds.size)} из ${integerFormat.format(STOP_EQUIPPED_COUNT)}`}
                                    pct={liveDataPct}
                                    tone={liveStopIds.size === STOP_EQUIPPED_COUNT ? "success" : "attention"}
                                />
                            </CardContent>
                        </Card>

                        <Card className="xl:col-span-7">
                            <CardHeader>
                                <CardTitle className="text-base">Покрытие по районам</CardTitle>
                                <CardDescription>
                                    Доля подключенных остановок от примерного количества остановок в районе
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <ChartContainer config={districtCoverageConfig} className="h-[260px] w-full">
                                    <BarChart data={districtChartRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="districtName" tickLine={false} axisLine={false} tickMargin={8} />
                                        <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="coveragePct" fill="var(--color-coveragePct)" radius={[5, 5, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Район</TableHead>
                                            <TableHead className="text-right">Подключено</TableHead>
                                            <TableHead className="text-right">Всего примерно</TableHead>
                                            <TableHead className="text-right">Покрытие</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {districtChartRows.map((district) => (
                                            <TableRow key={district.districtName}>
                                                <TableCell className="font-medium">{district.districtName}</TableCell>
                                                <TableCell className="text-right tabular-nums">{integerFormat.format(district.stops)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{district.estimatedTotalLabel}</TableCell>
                                                <TableCell className="text-right tabular-nums">{district.coverageLabel}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Готовность остановок</CardTitle>
                            <CardDescription>
                                Операционная таблица по направлениям с онлайн-наблюдениями и событиями безопасности
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Остановка</TableHead>
                                        <TableHead>Район</TableHead>
                                        <TableHead className="text-right">Сейчас</TableHead>
                                        <TableHead className="text-right">Пик</TableHead>
                                        <TableHead className="text-right">События</TableHead>
                                        <TableHead>Последние данные</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {locationSummaries.slice(0, 12).map((location) => (
                                        <TableRow key={location.locationId}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{location.label}</span>
                                                    <span className="text-xs text-muted-foreground">{location.detail}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{location.districtName}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(location.currentPeople)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(location.peakPeople)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{integerFormat.format(location.safetyEvents)}</TableCell>
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
