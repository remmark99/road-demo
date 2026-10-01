"use client"

import { useMemo } from "react"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    LabelList,
    Label,
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
import { filterByDayResult, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Hammer,
    GlassWater,
    Paintbrush,
    StickyNote,
    Construction,
} from "lucide-react"
import {
    BUS_STOPS,
    vandalismEventsData,
    vandalismIncidentsData,
    filterByStops,
    getDailyVandalismSummary,
    getPerStopTotals,
    VANDALISM_LABELS,
    type BusStopId,
    type VandalismType,
} from "@/lib/mock/vandalism-mock-data"

// ─── Chart Configs ───────────────────────────────────

const typeConfig = {
    glass: { label: "Стекло", color: "#688faa" },
    structural: { label: "Конструкция", color: "#bc837c" },
    graffiti: { label: "Граффити", color: "#8c83ad" },
    postings: { label: "Объявления", color: "#b59b62" },
} satisfies ChartConfig
const dailyConfig = { total: { label: "События", color: "#5b9b91" } } satisfies ChartConfig
const hourlyConfig = typeConfig
const stopCompareConfig = { total: { label: "События", color: "#688faa" } } satisfies ChartConfig

const TYPE_ICONS: Record<VandalismType, typeof GlassWater> = {
    glass: GlassWater,
    structural: Construction,
    graffiti: Paintbrush,
    postings: StickyNote,
}

const DAMAGE_COLORS: Record<string, string> = {
    minor: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
    moderate: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    severe: "bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold",
}

const DAMAGE_LABELS: Record<string, string> = {
    minor: "Незначительный",
    moderate: "Средний",
    severe: "Серьёзный",
}

// ─── Main Component ──────────────────────────────────

export function VandalismAnalytics({ timeRange, selectedStops }: {
    timeRange: TimeRangeResult
    selectedStops: BusStopId[]
}) {
    // ─── Filtered data ─────────────────────────────────

    const eventsFiltered = useMemo(() => {
        return filterByDayResult(filterByStops(vandalismEventsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    const incidentsFiltered = useMemo(() => {
        return filterByDayResult(filterByStops(vandalismIncidentsData, selectedStops), timeRange)
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
    const dailyData = useMemo(() => {
        const totals = new Map(getDailyVandalismSummary(eventsFiltered).map(row => [row.day, row]))
        const days = filterByDayResult(Array.from({ length: 30 }, (_, day) => ({ day })), timeRange)
        return days.sort((a, b) => b.day - a.day).map(({ day }) => {
            const row = totals.get(day) || { glass: 0, structural: 0, graffiti: 0, postings: 0 }
            const date = new Date(); date.setDate(date.getDate() - day)
            return { day, dayLabel: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
                total: row.glass + row.structural + row.graffiti + row.postings }
        })
    }, [eventsFiltered, timeRange])

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
    const perStopData = useMemo(() => getPerStopTotals(eventsFiltered).filter(row => selectedStops.includes(row.stopId)), [eventsFiltered, selectedStops])

    // Radar data for type comparison
    const radarData = useMemo(() => {
        const shortLabels: Record<VandalismType, string> = {
            glass: "Стекло",
            structural: "Конструкция",
            graffiti: "Граффити",
            postings: "Объявления",
        }
        return (Object.keys(VANDALISM_LABELS) as VandalismType[]).map((type) => ({
            type: shortLabels[type], key: type, fill: typeConfig[type].color,
            value: eventsFiltered.filter((e) => e.type === type).reduce((s, e) => s + e.count, 0),
        }))
    }, [eventsFiltered])

    if (!selectedStops.length) return <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Выберите остановки для просмотра вандализма.</CardContent></Card>

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-xl font-semibold">Вандализм</h2><p className="text-sm text-muted-foreground">Повреждения остановок и динамика событий</p></div>
                <Badge variant="secondary">Демонстрационные данные</Badge>
            </div>
            {/* ─── KPI Cards ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(Object.keys(VANDALISM_LABELS) as VandalismType[]).map((type) => {
                    const Icon = TYPE_ICONS[type]
                    return (
                        <Card key={type} className="border-border/60 shadow-sm">
                            <CardContent className="pt-4 pb-3 px-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon className="h-4 w-4" style={{ color: typeConfig[type].color }} />
                                    <span className="text-xs text-muted-foreground">{VANDALISM_LABELS[type]}</span>
                                </div>
                                <div className="text-3xl font-semibold tabular-nums">{kpiTotals[type]}</div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* ─── Charts grid ─────────────────────────── */}
            {!eventsFiltered.length ? <Card><CardContent className="py-12 text-center text-muted-foreground">За выбранный период на этих остановках событий вандализма нет.</CardContent></Card> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Daily stacked bar */}
                <Card className="min-w-0">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Hammer className="h-5 w-5 text-muted-foreground" />
                            Вандализм по дням
                        </CardTitle>
                        <CardDescription>Общее число событий за каждый день выбранного периода</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={dailyConfig} className="h-[280px] w-full">
                            <AreaChart data={dailyData} margin={{ left: 0, right: 16, top: 20, bottom: 0 }}>
                                <defs><linearGradient id="vandalism-daily-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.24} /><stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.02} /></linearGradient></defs>
                                <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 6" />
                                <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tickMargin={10} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Area type="monotone" dataKey="total" stroke="var(--color-total)" fill="url(#vandalism-daily-fill)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--color-total)", stroke: "var(--background)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 2. Hourly area chart */}
                <Card className="min-w-0">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <GlassWater className="h-5 w-5 text-muted-foreground" />
                            Почасовое распределение
                        </CardTitle>
                        <CardDescription>Когда чаще всего фиксируется вандализм</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={hourlyConfig} className="h-[280px] w-full">
                            <AreaChart data={hourlyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <defs>
                                    <linearGradient id="vandalism-fill-glass" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-glass)" stopOpacity={0.6} />
                                        <stop offset="95%" stopColor="var(--color-glass)" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="vandalism-fill-graffiti" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-graffiti)" stopOpacity={0.6} />
                                        <stop offset="95%" stopColor="var(--color-graffiti)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="glass" stroke="var(--color-glass)" fill="url(#vandalism-fill-glass)" strokeWidth={2} />
                                <Area type="monotone" dataKey="structural" stroke="var(--color-structural)" fill="var(--color-structural)" fillOpacity={0.1} strokeWidth={2} />
                                <Area type="monotone" dataKey="graffiti" stroke="var(--color-graffiti)" fill="url(#vandalism-fill-graffiti)" strokeWidth={2} />
                                <Area type="monotone" dataKey="postings" stroke="var(--color-postings)" fill="var(--color-postings)" fillOpacity={0.1} strokeWidth={2} />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 3. Radar — type profile */}
                <Card className="min-w-0">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Paintbrush className="h-5 w-5 text-muted-foreground" />
                            Типы повреждений
                        </CardTitle>
                        <CardDescription>Доля каждого типа в общем числе событий</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <ChartContainer config={typeConfig} className="h-[280px] w-full">
                            <PieChart>
                                <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
                                <Pie data={radarData.filter(row => row.value > 0)} dataKey="value" nameKey="key" innerRadius={62} outerRadius={96} paddingAngle={3} cornerRadius={5} stroke="var(--background)" strokeWidth={2}>
                                    {radarData.filter(row => row.value > 0).map(row => <Cell key={row.key} fill={row.fill} />)}
                                    <Label content={({ viewBox }) => viewBox && "cx" in viewBox && "cy" in viewBox ? <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle"><tspan className="fill-foreground text-3xl font-semibold">{kpiTotals.total}</tspan><tspan x={viewBox.cx} dy={24} className="fill-muted-foreground text-xs">событий</tspan></text> : null} />
                                </Pie>
                                <ChartLegend content={<ChartLegendContent nameKey="key" />} />
                            </PieChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 4. Per-stop horizontal stacked bars */}
                <Card className="min-w-0">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Construction className="h-5 w-5 text-muted-foreground" />
                            По остановкам
                        </CardTitle>
                        <CardDescription>Выбранные остановки — от большего числа событий к меньшему</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={stopCompareConfig} className="h-[280px] w-full">
                            <BarChart
                                data={perStopData}
                                layout="vertical"
                                margin={{ left: 0, right: 30, top: 12, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis
                                    dataKey="stopName"
                                    type="category"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    width={132}
                                    style={{ fontSize: "11px" }}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="total" fill="var(--color-total)" radius={[0, 7, 7, 0]} maxBarSize={16} background={{ fill: "var(--muted)", radius: 7 }}>
                                    <LabelList dataKey="total" position="right" className="fill-foreground" fontSize={12} />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 5. Incident log */}
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Hammer className="h-5 w-5 text-muted-foreground" />
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
                                            <Icon className={`h-4 w-4 flex-shrink-0 text-muted-foreground`} />
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
            </div>}
        </div>
    )
}
