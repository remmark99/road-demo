"use client"

import { useMemo, useState } from "react"
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Filter,
    Users2,
    DoorOpen,
    DoorClosed,
    Timer,
    Dog,
    AlertTriangle,
} from "lucide-react"
import {
    BUS_STOPS,
    TIME_RANGES,
    doorStatusData,
    animalEventsData,
    warmStopIncidentsData,
    filterByStops,
    filterByDay,
    getPerStopDoorSummary,
    getDailyDoorSummary,
    type BusStopId,
    type TimeRange,
} from "@/lib/mock/warmstop-mock-data"

// ─── Chart Configs ───────────────────────────────────

const doorHourlyConfig = {
    openCount: { label: "Открытий", color: "hsl(142, 71%, 45%)" },
    longOpenCount: { label: "Долго открыта", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const openPctConfig = {
    openPct: { label: "% времени открыта", color: "hsl(38, 92%, 50%)" },
} satisfies ChartConfig

const dailyConfig = {
    openings: { label: "Открытий", color: "hsl(142, 71%, 45%)" },
    longOpen: { label: "Долго открыта", color: "hsl(0, 84%, 60%)" },
    animals: { label: "Животные", color: "hsl(280, 67%, 50%)" },
} satisfies ChartConfig

const stopCompareConfig = {
    totalOpenings: { label: "Открытий", color: "hsl(142, 71%, 45%)" },
    totalLongOpen: { label: "Долго открыта", color: "hsl(0, 84%, 60%)" },
    totalAnimals: { label: "Животные", color: "hsl(280, 67%, 50%)" },
} satisfies ChartConfig

// ─── Main Component ──────────────────────────────────

export function WarmStopAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRange>("today")
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

    const doorFiltered = useMemo(() => {
        return filterByDay(filterByStops(doorStatusData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    const animalsFiltered = useMemo(() => {
        return filterByDay(filterByStops(animalEventsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    const incidentsFiltered = useMemo(() => {
        return filterByDay(filterByStops(warmStopIncidentsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    // Hourly door openings
    const doorHourly = useMemo(() => {
        const map = new Map<string, { openSum: number; longSum: number; count: number }>()
        for (let h = 0; h < 24; h++) map.set(`${String(h).padStart(2, "0")}:00`, { openSum: 0, longSum: 0, count: 0 })
        for (const r of doorFiltered) {
            const row = map.get(r.hour)!
            row.openSum += r.openCount
            row.longSum += r.longOpenCount
            row.count++
        }
        return Array.from(map.entries())
            .map(([hour, v]) => ({
                hour,
                openCount: v.count > 0 ? Math.round(v.openSum / v.count) : 0,
                longOpenCount: v.count > 0 ? Math.round(v.longSum / v.count) : 0,
            }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [doorFiltered])

    // Hourly open %
    const openPctHourly = useMemo(() => {
        const map = new Map<string, { sum: number; count: number }>()
        for (let h = 0; h < 24; h++) map.set(`${String(h).padStart(2, "0")}:00`, { sum: 0, count: 0 })
        for (const r of doorFiltered) {
            const row = map.get(r.hour)!
            row.sum += r.openPct
            row.count++
        }
        return Array.from(map.entries())
            .map(([hour, v]) => ({ hour, openPct: v.count > 0 ? Math.round(v.sum / v.count) : 0 }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [doorFiltered])

    // Daily summary
    const dailyData = useMemo(() => getDailyDoorSummary(doorFiltered, animalsFiltered), [doorFiltered, animalsFiltered])

    // Per-stop
    const perStopData = useMemo(() => getPerStopDoorSummary(doorFiltered, animalsFiltered), [doorFiltered, animalsFiltered])

    // KPIs
    const kpi = useMemo(() => {
        const totalOpenings = doorFiltered.reduce((s, r) => s + r.openCount, 0)
        const totalLong = doorFiltered.reduce((s, r) => s + r.longOpenCount, 0)
        const totalAnimals = animalsFiltered.reduce((s, a) => s + a.count, 0)
        const avgOpenPct = doorFiltered.length > 0
            ? Math.round(doorFiltered.reduce((s, r) => s + r.openPct, 0) / doorFiltered.length)
            : 0
        return { totalOpenings, totalLong, totalAnimals, avgOpenPct }
    }, [doorFiltered, animalsFiltered])

    const selectedLabel =
        selectedStops.length === BUS_STOPS.length
            ? "Все остановки"
            : selectedStops.length === 0
                ? "Не выбрано"
                : `${selectedStops.length} из ${BUS_STOPS.length}`

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            {/* ─── Filter bar ──────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TIME_RANGES.map((tr) => (
                            <SelectItem key={tr.value} value={tr.value}>
                                {tr.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

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
                                    id="all-stops-warm"
                                    checked={selectedStops.length === BUS_STOPS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-stops-warm" className="font-medium">Все остановки</Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {BUS_STOPS.map((stop) => (
                                    <div key={stop.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`warm-${stop.id}`}
                                            checked={selectedStops.includes(stop.id)}
                                            onCheckedChange={() => toggleStop(stop.id)}
                                        />
                                        <Label htmlFor={`warm-${stop.id}`} className="text-sm">{stop.name}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* ─── KPI Cards ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <DoorOpen className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs text-muted-foreground">Открытий</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.totalOpenings}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Timer className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-muted-foreground">Долго открыта</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.totalLong}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Dog className="h-4 w-4 text-purple-500" />
                            <span className="text-xs text-muted-foreground">Животные</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.totalAnimals}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <DoorClosed className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-muted-foreground">Средний % открыта</span>
                        </div>
                        <div className="text-2xl font-bold">{kpi.avgOpenPct}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* ─── Charts grid ─────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Hourly door openings — bar */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <DoorOpen className="h-5 w-5 text-emerald-500" />
                            Открытия двери по часам
                        </CardTitle>
                        <CardDescription>Среднее количество открытий и длительных открытий</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={doorHourlyConfig} className="h-[280px] w-full">
                            <BarChart data={doorHourly} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="openCount" fill="var(--color-openCount)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="longOpenCount" fill="var(--color-longOpenCount)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 2. % time open — area */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Timer className="h-5 w-5 text-amber-500" />
                            Процент времени открытия
                        </CardTitle>
                        <CardDescription>Средний % времени, когда дверь была открыта</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={openPctConfig} className="h-[280px] w-full">
                            <AreaChart data={openPctHourly} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <defs>
                                    <linearGradient id="fillOpenPct" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-openPct)" stopOpacity={0.7} />
                                        <stop offset="95%" stopColor="var(--color-openPct)" stopOpacity={0.1} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="openPct" stroke="var(--color-openPct)" fill="url(#fillOpenPct)" strokeWidth={2} />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 3. Daily summary — stacked bar */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            По дням недели
                        </CardTitle>
                        <CardDescription>Открытия, длительные события и животные</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={dailyConfig} className="h-[280px] w-full">
                            <LineChart data={dailyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Line type="monotone" dataKey="openings" stroke="var(--color-openings)" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" dataKey="longOpen" stroke="var(--color-longOpen)" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" dataKey="animals" stroke="var(--color-animals)" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 4. Per-stop comparison — horizontal */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Dog className="h-5 w-5 text-purple-500" />
                            По остановкам
                        </CardTitle>
                        <CardDescription>Сравнение показателей остановок</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={stopCompareConfig} className="h-[280px] w-full">
                            <BarChart
                                data={perStopData}
                                layout="vertical"
                                margin={{ left: 12, right: 12, top: 12, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
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
                                <Bar dataKey="totalOpenings" fill="var(--color-totalOpenings)" radius={[0, 4, 4, 0]} barSize={10} />
                                <Bar dataKey="totalLongOpen" fill="var(--color-totalLongOpen)" radius={[0, 4, 4, 0]} barSize={10} />
                                <Bar dataKey="totalAnimals" fill="var(--color-totalAnimals)" radius={[0, 4, 4, 0]} barSize={10} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 5. Incident log — full width */}
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Журнал событий
                        </CardTitle>
                        <CardDescription>Длительные открытия и появления животных</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[240px]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {incidentsFiltered.slice(0, 24).map((inc) => (
                                    <div
                                        key={inc.id}
                                        className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                    >
                                        {inc.type === "door_long" ? (
                                            <Timer className="h-4 w-4 text-red-500 flex-shrink-0" />
                                        ) : (
                                            <Dog className="h-4 w-4 text-purple-500 flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">{inc.id}</span>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] px-1.5 py-0 ${inc.type === "door_long"
                                                        ? "border-red-500/50 text-red-500"
                                                        : "border-purple-500/50 text-purple-500"
                                                        }`}
                                                >
                                                    {inc.type === "door_long" ? "Долго открыта" : inc.detail}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                {inc.stopName.split("/")[0].trim()} · {inc.hour}
                                            </p>
                                        </div>
                                        {inc.durationMin && (
                                            <span className="text-sm font-bold flex-shrink-0">{inc.durationMin} мин</span>
                                        )}
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
