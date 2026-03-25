"use client"

import { useMemo, useState } from "react"
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    ReferenceLine,
    Cell,
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
    Trash2,
    Snowflake,
    AlertTriangle,
    TrendingUp,
    Gauge,
} from "lucide-react"
import {
    BUS_STOPS,
    TIME_RANGES,
    conditionReadingsData,
    conditionAlertsData,
    filterByStops,
    filterByDay,
    getPerStopAverage,
    TRASH_WARNING,
    TRASH_CRITICAL,
    FOGGING_WARNING,
    FOGGING_CRITICAL,
    type BusStopId,
} from "@/lib/mock/condition-mock-data"

// ─── Chart Configs ───────────────────────────────────

const trashHourlyConfig = {
    trashLevel: { label: "Заполненность урн", color: "hsl(25, 95%, 53%)" },
} satisfies ChartConfig

const foggingHourlyConfig = {
    foggingLevel: { label: "Запотевание", color: "hsl(200, 80%, 55%)" },
} satisfies ChartConfig

const compareConfig = {
    avgTrash: { label: "Средний мусор", color: "hsl(25, 95%, 53%)" },
    avgFogging: { label: "Среднее запотевание", color: "hsl(200, 80%, 55%)" },
} satisfies ChartConfig

// ─── Main Component ──────────────────────────────────

export function ConditionAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
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

    const readingsFiltered = useMemo(() => {
        return filterByDayResult(filterByStops(conditionReadingsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    const alertsFiltered = useMemo(() => {
        return filterByDayResult(filterByStops(conditionAlertsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    // Hourly averages for trash
    const trashHourly = useMemo(() => {
        const map = new Map<string, { sum: number; count: number }>()
        for (let h = 0; h < 24; h++) map.set(`${String(h).padStart(2, "0")}:00`, { sum: 0, count: 0 })
        for (const r of readingsFiltered) {
            const row = map.get(r.hour)!
            row.sum += r.trashLevel
            row.count++
        }
        return Array.from(map.entries())
            .map(([hour, v]) => ({ hour, trashLevel: v.count > 0 ? Math.round(v.sum / v.count) : 0 }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [readingsFiltered])

    // Hourly averages for fogging
    const foggingHourly = useMemo(() => {
        const map = new Map<string, { sum: number; count: number }>()
        for (let h = 0; h < 24; h++) map.set(`${String(h).padStart(2, "0")}:00`, { sum: 0, count: 0 })
        for (const r of readingsFiltered) {
            const row = map.get(r.hour)!
            row.sum += r.foggingLevel
            row.count++
        }
        return Array.from(map.entries())
            .map(([hour, v]) => ({ hour, foggingLevel: v.count > 0 ? Math.round(v.sum / v.count) : 0 }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [readingsFiltered])

    // Per-stop averages
    const perStopData = useMemo(() => getPerStopAverage(readingsFiltered), [readingsFiltered])

    // KPI
    const kpi = useMemo(() => {
        const trashAlerts = alertsFiltered.filter((a) => a.type === "trash")
        const fogAlerts = alertsFiltered.filter((a) => a.type === "fogging")
        const criticals = alertsFiltered.filter((a) => a.severity === "critical")

        const avgTrash = readingsFiltered.length > 0
            ? Math.round(readingsFiltered.reduce((s, r) => s + r.trashLevel, 0) / readingsFiltered.length)
            : 0
        const avgFog = readingsFiltered.length > 0
            ? Math.round(readingsFiltered.reduce((s, r) => s + r.foggingLevel, 0) / readingsFiltered.length)
            : 0

        return {
            trashAlerts: trashAlerts.length,
            fogAlerts: fogAlerts.length,
            criticals: criticals.length,
            avgTrash,
            avgFog,
        }
    }, [readingsFiltered, alertsFiltered])

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
                                    id="all-stops-cond"
                                    checked={selectedStops.length === BUS_STOPS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-stops-cond" className="font-medium">Все остановки</Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {BUS_STOPS.map((stop) => (
                                    <div key={stop.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`cond-${stop.id}`}
                                            checked={selectedStops.includes(stop.id)}
                                            onCheckedChange={() => toggleStop(stop.id)}
                                        />
                                        <Label htmlFor={`cond-${stop.id}`} className="text-sm">{stop.name}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </TimeRangeFilter>

            {/* ─── KPI Cards ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Trash2 className="h-4 w-4 text-orange-500" />
                            <span className="text-xs text-muted-foreground">Средний мусор</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.avgTrash}%</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-sky-500/10 to-sky-600/5 border-sky-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Snowflake className="h-4 w-4 text-sky-500" />
                            <span className="text-xs text-muted-foreground">Среднее запотевание</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.avgFog}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Trash2 className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-muted-foreground">Тревоги мусор</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.trashAlerts}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Snowflake className="h-4 w-4 text-blue-500" />
                            <span className="text-xs text-muted-foreground">Тревоги стёкла</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.fogAlerts}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-muted-foreground">Критические</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.criticals}</div>
                    </CardContent>
                </Card>
            </div>

            {/* ─── Charts grid ─────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Trash level — area + thresholds */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Trash2 className="h-5 w-5 text-orange-500" />
                            Заполненность урн
                        </CardTitle>
                        <CardDescription>Средний уровень заполненности по часам</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={trashHourlyConfig} className="h-[280px] w-full">
                            <AreaChart data={trashHourly} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ReferenceLine
                                    y={TRASH_WARNING}
                                    stroke="hsl(38, 92%, 50%)"
                                    strokeDasharray="4 4"
                                    strokeWidth={1.5}
                                    label={{ value: "Внимание", position: "right", fill: "hsl(38, 92%, 50%)", fontSize: 10 }}
                                />
                                <ReferenceLine
                                    y={TRASH_CRITICAL}
                                    stroke="hsl(0, 84%, 60%)"
                                    strokeDasharray="4 4"
                                    strokeWidth={1.5}
                                    label={{ value: "Критично", position: "right", fill: "hsl(0, 84%, 60%)", fontSize: 10 }}
                                />
                                <defs>
                                    <linearGradient id="fillTrash" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-trashLevel)" stopOpacity={0.7} />
                                        <stop offset="95%" stopColor="var(--color-trashLevel)" stopOpacity={0.1} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone"
                                    dataKey="trashLevel"
                                    stroke="var(--color-trashLevel)"
                                    fill="url(#fillTrash)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 2. Fogging level — bar + thresholds */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Snowflake className="h-5 w-5 text-sky-500" />
                            Запотевание / Обмерзание
                        </CardTitle>
                        <CardDescription>Уровень запотевания стёкол по часам</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={foggingHourlyConfig} className="h-[280px] w-full">
                            <BarChart data={foggingHourly} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ReferenceLine
                                    y={FOGGING_WARNING}
                                    stroke="hsl(38, 92%, 50%)"
                                    strokeDasharray="4 4"
                                    strokeWidth={1.5}
                                    label={{ value: "Внимание", position: "right", fill: "hsl(38, 92%, 50%)", fontSize: 10 }}
                                />
                                <ReferenceLine
                                    y={FOGGING_CRITICAL}
                                    stroke="hsl(0, 84%, 60%)"
                                    strokeDasharray="4 4"
                                    strokeWidth={1.5}
                                    label={{ value: "Критично", position: "right", fill: "hsl(0, 84%, 60%)", fontSize: 10 }}
                                />
                                <Bar dataKey="foggingLevel" radius={[4, 4, 0, 0]}>
                                    {foggingHourly.map((entry, index) => (
                                        <Cell
                                            key={`fog-${index}`}
                                            fill={
                                                entry.foggingLevel >= FOGGING_CRITICAL
                                                    ? "hsl(0, 84%, 60%)"
                                                    : entry.foggingLevel >= FOGGING_WARNING
                                                        ? "hsl(38, 92%, 50%)"
                                                        : "var(--color-foggingLevel)"
                                            }
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 3. Per-stop comparison — grouped bars */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Gauge className="h-5 w-5 text-violet-500" />
                            Сравнение остановок
                        </CardTitle>
                        <CardDescription>Средние показатели по остановкам</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={compareConfig} className="h-[280px] w-full">
                            <BarChart
                                data={perStopData}
                                layout="vertical"
                                margin={{ left: 12, right: 12, top: 12, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                                <YAxis
                                    dataKey="stopName"
                                    type="category"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    width={100}
                                    style={{ fontSize: "11px" }}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="avgTrash" fill="var(--color-avgTrash)" radius={[0, 4, 4, 0]} barSize={12} />
                                <Bar dataKey="avgFogging" fill="var(--color-avgFogging)" radius={[0, 4, 4, 0]} barSize={12} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 4. Alert log */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Журнал тревог
                        </CardTitle>
                        <CardDescription>Превышения пороговых значений</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[280px]">
                            <div className="space-y-2">
                                {alertsFiltered.slice(0, 25).map((alert) => (
                                    <div
                                        key={alert.id}
                                        className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                    >
                                        {alert.type === "trash" ? (
                                            <Trash2 className="h-4 w-4 text-orange-500 flex-shrink-0" />
                                        ) : (
                                            <Snowflake className="h-4 w-4 text-sky-500 flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">{alert.id}</span>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] px-1.5 py-0 ${alert.severity === "critical"
                                                        ? "border-red-500/50 text-red-500"
                                                        : "border-amber-500/50 text-amber-500"
                                                        }`}
                                                >
                                                    {alert.severity === "critical" ? "Критично" : "Внимание"}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                {alert.stopName.split("/")[0].trim()} · {alert.hour}
                                            </p>
                                        </div>
                                        <div className="flex-shrink-0 text-right">
                                            <div className="text-sm font-bold">{alert.level}%</div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {alert.type === "trash" ? "заполн." : "запот."}
                                            </div>
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
