"use client"

import { useMemo, useState } from "react"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    Tooltip,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
    ChartLegendContent,
    type ChartConfig,
} from "@/components/ui/chart"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { TimeRangeFilter, filterByDayResult, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Users2,
    ShieldAlert,
    Package,
    PersonStanding,
    Swords,
    AlertTriangle,
    Clock,
    CheckCircle2,
    XCircle,
} from "lucide-react"
import {
    BUS_STOPS,
    TIME_RANGES,
    securityEventsData,
    incidentDetailsData,
    filterByStops,
    filterByDay,
    getDailyTypeSummary,
    getSubtypeBreakdown,
    EVENT_TYPE_LABELS,
    type BusStopId,
    type SecurityEventType,
} from "@/lib/mock/security-mock-data"

// ─── Chart Configs ───────────────────────────────────

const dailyStackedConfig = {
    abandoned: { label: "Оставленные предметы", color: "hsl(38, 92%, 50%)" },
    fallen: { label: "Лежачий человек", color: "hsl(0, 84%, 60%)" },
    fight: { label: "Драка", color: "hsl(280, 67%, 50%)" },
} satisfies ChartConfig

const hourlyLineConfig = {
    abandoned: { label: "Оставленные предметы", color: "hsl(38, 92%, 50%)" },
    fallen: { label: "Лежачий человек", color: "hsl(0, 84%, 60%)" },
    fight: { label: "Драка", color: "hsl(280, 67%, 50%)" },
} satisfies ChartConfig

const PIE_COLORS: Record<SecurityEventType, string> = {
    abandoned: "hsl(38, 92%, 50%)",
    fallen: "hsl(0, 84%, 60%)",
    fight: "hsl(280, 67%, 50%)",
}

const SUBTYPE_COLORS = [
    "hsl(38, 92%, 50%)",   // amber — abandoned
    "hsl(0, 84%, 60%)",    // red — fallen
    "hsl(280, 67%, 50%)",  // purple — fight
]

// ─── Main Component ──────────────────────────────────

export function SecurityAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "week" })
    const [selectedStops, setSelectedStops] = useState<BusStopId[]>(
        BUS_STOPS.map((s) => s.id)
    )

    const toggleStop = (stopId: BusStopId) => {
        setSelectedStops((prev) =>
            prev.includes(stopId) ? prev.filter((id) => id !== stopId) : [...prev, stopId]
        )
    }

    const toggleAll = () => {
        setSelectedStops((prev) =>
            prev.length === BUS_STOPS.length ? [] : BUS_STOPS.map((s) => s.id)
        )
    }

    // ─── Filtered data ─────────────────────────────────

    const eventsFiltered = useMemo(() => {
        const byStops = filterByStops(securityEventsData, selectedStops)
        return filterByDayResult(byStops, timeRange)
    }, [timeRange, selectedStops])

    const incidentsFiltered = useMemo(() => {
        const byStops = filterByStops(incidentDetailsData, selectedStops)
        return filterByDayResult(byStops, timeRange)
    }, [timeRange, selectedStops])

    // 1. Daily stacked bar data
    const dailyData = useMemo(() => getDailyTypeSummary(eventsFiltered), [eventsFiltered])

    // 2. Hourly line chart
    const hourlyData = useMemo(() => {
        const map = new Map<string, { abandoned: number; fallen: number; fight: number }>()
        for (let h = 0; h < 24; h++) {
            map.set(`${String(h).padStart(2, "0")}:00`, { abandoned: 0, fallen: 0, fight: 0 })
        }
        for (const evt of eventsFiltered) {
            const row = map.get(evt.hour)!
            row[evt.type] += evt.count
        }
        return Array.from(map.entries())
            .map(([hour, counts]) => ({ hour, ...counts }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [eventsFiltered])

    // 3. Subtype pie
    const subtypeData = useMemo(() => getSubtypeBreakdown(eventsFiltered), [eventsFiltered])

    // KPI summary cards
    const kpiTotals = useMemo(() => {
        const totals = { abandoned: 0, fallen: 0, fight: 0, total: 0 }
        for (const evt of eventsFiltered) {
            totals[evt.type] += evt.count
            totals.total += evt.count
        }
        return totals
    }, [eventsFiltered])

    const avgResponse = useMemo(() => {
        if (incidentsFiltered.length === 0) return 0
        return Math.round(incidentsFiltered.reduce((s, i) => s + i.responseMinutes, 0) / incidentsFiltered.length)
    }, [incidentsFiltered])

    const selectedLabel =
        selectedStops.length === BUS_STOPS.length
            ? "Все остановки"
            : selectedStops.length === 0
                ? "Не выбрано"
                : `${selectedStops.length} из ${BUS_STOPS.length}`

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            {/* ─── Filter bar ──────────────────────────── */}
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Users2 className="h-4 w-4" />
                            {selectedLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="all-stops-sec"
                                    checked={selectedStops.length === BUS_STOPS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-stops-sec" className="font-medium">
                                    Все остановки
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {BUS_STOPS.map((stop) => (
                                    <div key={stop.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`sec-${stop.id}`}
                                            checked={selectedStops.includes(stop.id)}
                                            onCheckedChange={() => toggleStop(stop.id)}
                                        />
                                        <Label htmlFor={`sec-${stop.id}`} className="text-sm">
                                            {stop.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </TimeRangeFilter>

            {/* ─── KPI Cards ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Package className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-muted-foreground">Оставленные предметы</span>
                        </div>
                        <div className="text-2xl font-bold">{kpiTotals.abandoned}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <PersonStanding className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-muted-foreground">Лежачий человек</span>
                        </div>
                        <div className="text-2xl font-bold">{kpiTotals.fallen}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Swords className="h-4 w-4 text-purple-500" />
                            <span className="text-xs text-muted-foreground">Драки</span>
                        </div>
                        <div className="text-2xl font-bold">{kpiTotals.fight}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-blue-500" />
                            <span className="text-xs text-muted-foreground">Средняя реакция</span>
                        </div>
                        <div className="text-2xl font-bold">{avgResponse} <span className="text-sm font-normal">мин</span></div>
                    </CardContent>
                </Card>
            </div>

            {/* ─── Charts grid ─────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Daily stacked bar — events by day and type */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldAlert className="h-5 w-5 text-amber-500" />
                            События по дням
                        </CardTitle>
                        <CardDescription>
                            Распределение инцидентов по дням недели
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={dailyStackedConfig} className="h-[280px] w-full">
                            <BarChart data={dailyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="abandoned" stackId="events" fill="var(--color-abandoned)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="fallen" stackId="events" fill="var(--color-fallen)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="fight" stackId="events" fill="var(--color-fight)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 2. Hourly line chart — when events happen */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Почасовое распределение
                        </CardTitle>
                        <CardDescription>
                            Когда чаще всего происходят инциденты
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={hourlyLineConfig} className="h-[280px] w-full">
                            <LineChart data={hourlyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Line type="monotone" dataKey="abandoned" stroke="var(--color-abandoned)" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="fallen" stroke="var(--color-fallen)" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="fight" stroke="var(--color-fight)" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 3. Subtype donut — breakdown of what exactly */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Package className="h-5 w-5 text-violet-500" />
                            Типы событий
                        </CardTitle>
                        <CardDescription>
                            Детальная разбивка по подтипам
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row items-center gap-4">
                        <ChartContainer
                            config={{ subtype: { label: "Тип", color: "hsl(0,0%,50%)" } }}
                            className="h-[250px] w-[250px] flex-shrink-0"
                        >
                            <PieChart>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const d = payload[0].payload
                                        return (
                                            <div className="bg-background border rounded-lg px-3 py-2 text-xs shadow-xl">
                                                <p className="font-medium">{d.subtype}</p>
                                                <p className="text-muted-foreground">{d.count} событий</p>
                                            </div>
                                        )
                                    }}
                                />
                                <Pie
                                    data={subtypeData}
                                    dataKey="count"
                                    nameKey="subtype"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                >
                                    {subtypeData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={SUBTYPE_COLORS[index % SUBTYPE_COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ChartContainer>
                        <div className="space-y-1.5 text-sm flex-1">
                            {subtypeData.slice(0, 8).map((s, i) => (
                                <div key={s.subtype} className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-sm flex-shrink-0"
                                        style={{ backgroundColor: SUBTYPE_COLORS[i % SUBTYPE_COLORS.length] }}
                                    />
                                    <span className="text-muted-foreground flex-1 truncate">{s.subtype}</span>
                                    <span className="font-mono text-xs">{s.count}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Recent incidents list */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldAlert className="h-5 w-5 text-blue-500" />
                            Последние инциденты
                        </CardTitle>
                        <CardDescription>
                            Журнал событий безопасности
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[280px]">
                            <div className="space-y-2">
                                {incidentsFiltered.slice(0, 20).map((inc) => (
                                    <div
                                        key={inc.id}
                                        className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                    >
                                        <div
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: PIE_COLORS[inc.type] }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">{inc.id}</span>
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                    {inc.subtype}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                {inc.stopName.split("/")[0].trim()} · {inc.hour}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-xs text-muted-foreground">{inc.responseMinutes} мин</span>
                                            {inc.resolved ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            ) : (
                                                <XCircle className="h-4 w-4 text-red-500" />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
