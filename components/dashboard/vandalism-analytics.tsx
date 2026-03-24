"use client"

import { useMemo, useState } from "react"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    AreaChart,
    Area,
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
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
    Hammer,
    GlassWater,
    Paintbrush,
    StickyNote,
    Construction,
} from "lucide-react"
import {
    BUS_STOPS,
    TIME_RANGES,
    vandalismEventsData,
    vandalismIncidentsData,
    filterByStops,
    filterByDay,
    getDailyVandalismSummary,
    getPerStopTotals,
    VANDALISM_LABELS,
    type BusStopId,
    type TimeRange,
    type VandalismType,
} from "@/lib/mock/vandalism-mock-data"

// ─── Chart Configs ───────────────────────────────────

const dailyConfig = {
    glass: { label: "Стекло", color: "hsl(200, 80%, 55%)" },
    structural: { label: "Конструкция", color: "hsl(25, 95%, 53%)" },
    graffiti: { label: "Граффити", color: "hsl(330, 80%, 55%)" },
    postings: { label: "Объявления", color: "hsl(50, 90%, 50%)" },
} satisfies ChartConfig

const hourlyConfig = {
    glass: { label: "Стекло", color: "hsl(200, 80%, 55%)" },
    structural: { label: "Конструкция", color: "hsl(25, 95%, 53%)" },
    graffiti: { label: "Граффити", color: "hsl(330, 80%, 55%)" },
    postings: { label: "Объявления", color: "hsl(50, 90%, 50%)" },
} satisfies ChartConfig

const stopCompareConfig = {
    glass: { label: "Стекло", color: "hsl(200, 80%, 55%)" },
    structural: { label: "Конструкция", color: "hsl(25, 95%, 53%)" },
    graffiti: { label: "Граффити", color: "hsl(330, 80%, 55%)" },
    postings: { label: "Объявления", color: "hsl(50, 90%, 50%)" },
} satisfies ChartConfig

const TYPE_ICONS: Record<VandalismType, typeof GlassWater> = {
    glass: GlassWater,
    structural: Construction,
    graffiti: Paintbrush,
    postings: StickyNote,
}

const TYPE_COLORS: Record<VandalismType, string> = {
    glass: "text-sky-500",
    structural: "text-orange-500",
    graffiti: "text-pink-500",
    postings: "text-yellow-500",
}

const DAMAGE_COLORS: Record<string, string> = {
    minor: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    moderate: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    severe: "bg-red-500/20 text-red-600 dark:text-red-400",
}

const DAMAGE_LABELS: Record<string, string> = {
    minor: "Незначительный",
    moderate: "Средний",
    severe: "Серьёзный",
}

// ─── Main Component ──────────────────────────────────

export function VandalismAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRange>("week")
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
        return filterByDay(filterByStops(vandalismEventsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    const incidentsFiltered = useMemo(() => {
        return filterByDay(filterByStops(vandalismIncidentsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    // KPI totals
    const kpiTotals = useMemo(() => {
        const totals = { glass: 0, structural: 0, graffiti: 0, postings: 0, total: 0 }
        for (const evt of eventsFiltered) {
            totals[evt.type] += evt.count
            totals.total += evt.count
        }
        return totals
    }, [eventsFiltered])

    // Daily stacked
    const dailyData = useMemo(() => getDailyVandalismSummary(eventsFiltered), [eventsFiltered])

    // Hourly area chart
    const hourlyData = useMemo(() => {
        const map = new Map<string, { glass: number; structural: number; graffiti: number; postings: number }>()
        for (let h = 0; h < 24; h++) {
            map.set(`${String(h).padStart(2, "0")}:00`, { glass: 0, structural: 0, graffiti: 0, postings: 0 })
        }
        for (const evt of eventsFiltered) {
            const row = map.get(evt.hour)!
            row[evt.type] += evt.count
        }
        return Array.from(map.entries())
            .map(([hour, counts]) => ({ hour, ...counts }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [eventsFiltered])

    // Per-stop comparison
    const perStopData = useMemo(() => getPerStopTotals(eventsFiltered), [eventsFiltered])

    // Radar data for type comparison
    const radarData = useMemo(() => {
        const shortLabels: Record<VandalismType, string> = {
            glass: "Стекло",
            structural: "Конструкция",
            graffiti: "Граффити",
            postings: "Объявления",
        }
        return (Object.keys(VANDALISM_LABELS) as VandalismType[]).map((type) => ({
            type: shortLabels[type],
            value: eventsFiltered.filter((e) => e.type === type).reduce((s, e) => s + e.count, 0),
        }))
    }, [eventsFiltered])

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
                                    id="all-stops-van"
                                    checked={selectedStops.length === BUS_STOPS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-stops-van" className="font-medium">Все остановки</Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {BUS_STOPS.map((stop) => (
                                    <div key={stop.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`van-${stop.id}`}
                                            checked={selectedStops.includes(stop.id)}
                                            onCheckedChange={() => toggleStop(stop.id)}
                                        />
                                        <Label htmlFor={`van-${stop.id}`} className="text-sm">{stop.name}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* ─── KPI Cards ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(Object.keys(VANDALISM_LABELS) as VandalismType[]).map((type) => {
                    const Icon = TYPE_ICONS[type]
                    return (
                        <Card key={type}>
                            <CardContent className="pt-4 pb-3 px-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon className={`h-4 w-4 ${TYPE_COLORS[type]}`} />
                                    <span className="text-xs text-muted-foreground">{VANDALISM_LABELS[type]}</span>
                                </div>
                                <div className="text-2xl font-bold">{kpiTotals[type]}</div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* ─── Charts grid ─────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Daily stacked bar */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Hammer className="h-5 w-5 text-orange-500" />
                            Вандализм по дням
                        </CardTitle>
                        <CardDescription>Распределение по дням недели</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={dailyConfig} className="h-[280px] w-full">
                            <BarChart data={dailyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="glass" stackId="v" fill="var(--color-glass)" />
                                <Bar dataKey="structural" stackId="v" fill="var(--color-structural)" />
                                <Bar dataKey="graffiti" stackId="v" fill="var(--color-graffiti)" />
                                <Bar dataKey="postings" stackId="v" fill="var(--color-postings)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 2. Hourly area chart */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <GlassWater className="h-5 w-5 text-sky-500" />
                            Почасовое распределение
                        </CardTitle>
                        <CardDescription>Когда чаще всего фиксируется вандализм</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={hourlyConfig} className="h-[280px] w-full">
                            <AreaChart data={hourlyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <defs>
                                    <linearGradient id="fillGlass" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-glass)" stopOpacity={0.6} />
                                        <stop offset="95%" stopColor="var(--color-glass)" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="fillGraffiti" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-graffiti)" stopOpacity={0.6} />
                                        <stop offset="95%" stopColor="var(--color-graffiti)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="glass" stroke="var(--color-glass)" fill="url(#fillGlass)" strokeWidth={2} />
                                <Area type="monotone" dataKey="structural" stroke="var(--color-structural)" fill="var(--color-structural)" fillOpacity={0.1} strokeWidth={2} />
                                <Area type="monotone" dataKey="graffiti" stroke="var(--color-graffiti)" fill="url(#fillGraffiti)" strokeWidth={2} />
                                <Area type="monotone" dataKey="postings" stroke="var(--color-postings)" fill="var(--color-postings)" fillOpacity={0.1} strokeWidth={2} />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 3. Radar — type profile */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Paintbrush className="h-5 w-5 text-pink-500" />
                            Профиль вандализма
                        </CardTitle>
                        <CardDescription>Сравнительный анализ типов</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <ChartContainer
                            config={{ value: { label: "Кол-во", color: "hsl(330, 80%, 55%)" } }}
                            className="h-[280px] w-[340px]"
                        >
                            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                                <PolarGrid stroke="currentColor" className="text-border" />
                                <PolarAngleAxis
                                    dataKey="type"
                                    tick={{ fill: "currentColor", fontSize: 12 }}
                                    className="text-muted-foreground"
                                />
                                <PolarRadiusAxis
                                    angle={90}
                                    tick={{ fill: "currentColor", fontSize: 10 }}
                                    className="text-muted-foreground"
                                />
                                <Radar
                                    name="События"
                                    dataKey="value"
                                    stroke="hsl(330, 80%, 55%)"
                                    fill="hsl(330, 80%, 55%)"
                                    fillOpacity={0.3}
                                    strokeWidth={2}
                                />
                            </RadarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 4. Per-stop horizontal stacked bars */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Construction className="h-5 w-5 text-orange-500" />
                            По остановкам
                        </CardTitle>
                        <CardDescription>Вандализм в разрезе остановок</CardDescription>
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
                                <Bar dataKey="glass" stackId="s" fill="var(--color-glass)" />
                                <Bar dataKey="structural" stackId="s" fill="var(--color-structural)" />
                                <Bar dataKey="graffiti" stackId="s" fill="var(--color-graffiti)" />
                                <Bar dataKey="postings" stackId="s" fill="var(--color-postings)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 5. Incident log */}
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Hammer className="h-5 w-5 text-violet-500" />
                            Журнал инцидентов вандализма
                        </CardTitle>
                        <CardDescription>Последние зафиксированные события</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[240px]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {incidentsFiltered.slice(0, 20).map((inc) => {
                                    const Icon = TYPE_ICONS[inc.type]
                                    return (
                                        <div
                                            key={inc.id}
                                            className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                        >
                                            <Icon className={`h-4 w-4 flex-shrink-0 ${TYPE_COLORS[inc.type]}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono text-muted-foreground">{inc.id}</span>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                        {VANDALISM_LABELS[inc.type]}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                    {inc.stopName.split("/")[0].trim()} · {inc.hour}
                                                </p>
                                            </div>
                                            <Badge className={`text-[10px] ${DAMAGE_COLORS[inc.damageLevel]}`}>
                                                {DAMAGE_LABELS[inc.damageLevel]}
                                            </Badge>
                                        </div>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
