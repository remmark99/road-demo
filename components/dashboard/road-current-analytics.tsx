"use client"

import { useMemo, useState } from "react"
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import { Activity, Camera, CameraOff, CheckCircle2, MapPinned, TrafficCone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    TimeRangeFilter,
    filterByTimeRangeResult,
    type TimeRangeResult,
} from "@/components/dashboard/time-range-filter"
import {
    ROAD_KPI,
    ROAD_SEASONS,
    filterRoadRowsBySeason,
    getRoadSeasonLabel,
    roadDailyContractorRows,
    type RoadSeasonFilter,
} from "@/lib/mock/road-analytics-mock-data"

const statusConfig = {
    incidents: { label: "Инциденты", color: "hsl(35, 92%, 52%)" },
    overdueIncidents: { label: "Просрочено", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const efficiencyConfig = {
    efficiencyPct: { label: "Эффективность", color: "hsl(160, 72%, 38%)" },
    reactionHours: { label: "Реакция, ч", color: "hsl(210, 89%, 54%)" },
} satisfies ChartConfig

const integerFormat = new Intl.NumberFormat("ru-RU")

export function RoadCurrentAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "week" })
    const [season, setSeason] = useState<RoadSeasonFilter>("all")

    const filteredRows = useMemo(() => {
        return filterRoadRowsBySeason(
            filterByTimeRangeResult(roadDailyContractorRows, timeRange),
            season
        )
    }, [timeRange, season])

    const dailyRows = useMemo(() => {
        const grouped = new Map<
            string,
            {
                date: string
                dateLabel: string
                incidents: number
                overdueIncidents: number
                completedOrders: number
                efficiencyPct: number
                reactionHours: number
                rows: number
            }
        >()

        for (const row of filteredRows) {
            if (!grouped.has(row.date)) {
                grouped.set(row.date, {
                    date: row.date,
                    dateLabel: new Date(`${row.date}T00:00:00`).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                    }),
                    incidents: 0,
                    overdueIncidents: 0,
                    completedOrders: 0,
                    efficiencyPct: 0,
                    reactionHours: 0,
                    rows: 0,
                })
            }

            const entry = grouped.get(row.date)!
            entry.incidents += row.incidents
            entry.overdueIncidents += row.overdueIncidents
            entry.completedOrders += row.completedOrders
            entry.efficiencyPct += row.efficiencyPct
            entry.reactionHours += row.reactionHours
            entry.rows += 1
        }

        return Array.from(grouped.values())
            .map((row) => ({
                ...row,
                efficiencyPct: row.rows === 0 ? 0 : Math.round(row.efficiencyPct / row.rows),
                reactionHours: row.rows === 0 ? 0 : Number((row.reactionHours / row.rows).toFixed(1)),
            }))
            .sort((left, right) => left.date.localeCompare(right.date))
    }, [filteredRows])

    const totals = useMemo(() => {
        const incidents = filteredRows.reduce((sum, row) => sum + row.incidents, 0)
        const overdueIncidents = filteredRows.reduce((sum, row) => sum + row.overdueIncidents, 0)
        const completedOrders = filteredRows.reduce((sum, row) => sum + row.completedOrders, 0)
        const avgReaction =
            filteredRows.length === 0
                ? 0
                : Number((filteredRows.reduce((sum, row) => sum + row.reactionHours, 0) / filteredRows.length).toFixed(1))

        return {
            incidents,
            overdueIncidents,
            completedOrders,
            avgReaction,
        }
    }, [filteredRows])

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
                <Select value={season} onValueChange={(value) => setSeason(value as RoadSeasonFilter)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Сезон" />
                    </SelectTrigger>
                    <SelectContent>
                        {ROAD_SEASONS.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TimeRangeFilter>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-sky-500/20 bg-sky-500/[0.05]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                            <Camera className="h-4 w-4" />
                            Камеры
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{ROAD_KPI.connectedCameras}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Подключены к дорожному контуру мониторинга.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-emerald-500/20 bg-emerald-500/[0.06]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                            <TrafficCone className="h-4 w-4" />
                            Перекрестки
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{ROAD_KPI.servicedIntersections}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Обслуживаются подрядчиками и диспетчерским центром.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/[0.06]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                            <CheckCircle2 className="h-4 w-4" />
                            Онлайн
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{ROAD_KPI.onlinePct}%</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Доля камер, передающих актуальный сигнал.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-amber-500/25 bg-amber-500/[0.07]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                            <CameraOff className="h-4 w-4" />
                            Требует внимания
                        </div>
                        <div className="mt-3 text-sm font-medium leading-5">
                            {ROAD_KPI.offlineNote}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Инцидент оставлен в витрине как пример операционного уведомления.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-5">
                <Card className="xl:col-span-3">
                    <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="h-5 w-5 text-primary" />
                                    Текущая динамика инцидентов
                                </CardTitle>
                                <CardDescription>
                                    Период: {getRoadSeasonLabel(season).toLowerCase()}, агрегировано по всем подрядчикам.
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-background">
                                {integerFormat.format(totals.incidents)} событий
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={statusConfig} className="h-[320px] w-full">
                            <BarChart data={dailyRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={18} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="incidents" fill="var(--color-incidents)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="overdueIncidents" fill="var(--color-overdueIncidents)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                    <CardHeader>
                        <CardTitle>Исполнение и реакция</CardTitle>
                        <CardDescription>
                            Средняя эффективность исполнения и время реакции диспетчерского контура.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={efficiencyConfig} className="h-[320px] w-full">
                            <AreaChart data={dailyRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={18} />
                                <YAxis
                                    yAxisId="efficiency"
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 100]}
                                    ticks={[0, 25, 50, 75, 100]}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <YAxis
                                    yAxisId="reaction"
                                    orientation="right"
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 24]}
                                    ticks={[0, 6, 12, 18, 24]}
                                    tickFormatter={(value) => `${value} ч`}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Area
                                    yAxisId="efficiency"
                                    type="monotone"
                                    dataKey="efficiencyPct"
                                    stroke="var(--color-efficiencyPct)"
                                    fill="var(--color-efficiencyPct)"
                                    fillOpacity={0.22}
                                    strokeWidth={2}
                                />
                                <Area
                                    yAxisId="reaction"
                                    type="monotone"
                                    dataKey="reactionHours"
                                    stroke="var(--color-reactionHours)"
                                    fill="var(--color-reactionHours)"
                                    fillOpacity={0.12}
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="p-5">
                        <div className="text-sm text-muted-foreground">Закрыто поручений за период</div>
                        <div className="mt-2 text-2xl font-semibold tabular-nums">{integerFormat.format(totals.completedOrders)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="text-sm text-muted-foreground">Просрочено инцидентов</div>
                        <div className="mt-2 text-2xl font-semibold tabular-nums">{integerFormat.format(totals.overdueIncidents)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPinned className="h-4 w-4 text-primary" />
                            Средняя реакция
                        </div>
                        <div className="mt-2 text-2xl font-semibold tabular-nums">{totals.avgReaction} ч</div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
