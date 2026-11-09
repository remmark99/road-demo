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
    RadialBarChart,
    RadialBar,
    PolarAngleAxis,
    Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { StopMultiSelect } from "@/components/dashboard/stop-multi-select"
import { Users2, Gauge, BarChart3, ArrowUpFromLine, ArrowDownToLine } from "lucide-react"
import {
    BUS_STOPS,
    TIME_RANGES,
    hourlyFlowData,
    occupancyData,
    queueDensityData,
    boardingData,
    alightingData,
    filterByStops,
    filterByDay,
    type BusStopId,
} from "@/lib/mock/passenger-mock-data"

// ─── Chart Configs ───────────────────────────────────

const flowChartConfig = {
    arrivals: { label: "Пришли", color: "hsl(142, 76%, 36%)" },
    departures: { label: "Ушли", color: "hsl(346, 87%, 55%)" },
} satisfies ChartConfig

const densityChartConfig = {
    density: { label: "Плотность", color: "hsl(221, 83%, 53%)" },
} satisfies ChartConfig

const boardingChartConfig = Object.fromEntries(
    BUS_STOPS.map((s, i) => {
        const hues = [200, 280, 150, 30, 340]
        return [s.id, { label: s.name.split("/")[0].trim(), color: `hsl(${hues[i]}, 70%, 50%)` }]
    })
) satisfies ChartConfig

const alightingChartConfig = {
    total: { label: "Высадка", color: "hsl(262, 83%, 58%)" },
} satisfies ChartConfig

// ─── Main Component ──────────────────────────────────

const STOP_OPTIONS = BUS_STOPS.map((stop) => ({ id: stop.id, label: stop.name }))

export function PassengerAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    const [selectedStops, setSelectedStops] = useState<BusStopId[]>(
        BUS_STOPS.map((s) => s.id)
    )



    // ─── Filtered & aggregated data ──────────────────

    const flowFiltered = useMemo(() => {
        const byStops = filterByStops(hourlyFlowData, selectedStops)
        const byDay = filterByDayResult(byStops, timeRange)
        // Aggregate by hour
        const map = new Map<string, { arrivals: number; departures: number; count: number }>()
        for (const d of byDay) {
            const existing = map.get(d.hour)
            if (existing) {
                existing.arrivals += d.arrivals
                existing.departures += d.departures
                existing.count++
            } else {
                map.set(d.hour, { arrivals: d.arrivals, departures: d.departures, count: 1 })
            }
        }
        return Array.from(map.entries())
            .map(([hour, v]) => ({
                hour,
                arrivals: Math.round(v.arrivals / v.count),
                departures: Math.round(v.departures / v.count),
            }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [timeRange, selectedStops])

    const occupancyFiltered = useMemo(() => {
        return filterByStops(occupancyData, selectedStops)
    }, [selectedStops])

    const densityFiltered = useMemo(() => {
        const byStops = filterByStops(queueDensityData, selectedStops)
        const byDay = filterByDayResult(byStops, timeRange)
        const map = new Map<string, { density: number; count: number }>()
        for (const d of byDay) {
            const existing = map.get(d.hour)
            if (existing) {
                existing.density += d.density
                existing.count++
            } else {
                map.set(d.hour, { density: d.density, count: 1 })
            }
        }
        return Array.from(map.entries())
            .map(([hour, v]) => ({
                hour,
                density: Math.round(v.density / v.count),
            }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    }, [timeRange, selectedStops])

    const boardingFiltered = useMemo(() => {
        const byDay = filterByDayResult(boardingData, timeRange)
        const byStops = filterByStops(byDay, selectedStops)
        // Pivot: per hour, one key per stop
        const map = new Map<string, Record<string, number>>()
        for (const d of byStops) {
            if (!map.has(d.hour)) map.set(d.hour, {})
            const row = map.get(d.hour)!
            row[d.stopId] = (row[d.stopId] || 0) + d.count
        }
        return Array.from(map.entries())
            .map(([hour, row]) => ({ hour, ...row }))
            .sort((a, b) => String(a.hour).localeCompare(String(b.hour)))
    }, [timeRange, selectedStops])

    const alightingFiltered = useMemo(() => {
        const byDay = filterByDayResult(alightingData, timeRange)
        const byStops = filterByStops(byDay, selectedStops)
        // Aggregate by stop
        const map = new Map<string, { total: number; count: number; name: string }>()
        for (const d of byStops) {
            const existing = map.get(d.stopId)
            if (existing) {
                existing.total += d.total
                existing.count++
            } else {
                map.set(d.stopId, { total: d.total, count: 1, name: d.stopName })
            }
        }
        return Array.from(map.values())
            .map((v) => ({
                name: v.name.split("/")[0].trim(),
                total: Math.round(v.total / v.count),
            }))
            .sort((a, b) => b.total - a.total)
    }, [timeRange, selectedStops])

    // Compute aggregate occupancy for radial gauge
    const avgOccupancy = useMemo(() => {
        if (occupancyFiltered.length === 0) return { pct: 0, total: 0, capacity: 0 }
        const total = occupancyFiltered.reduce((s, d) => s + d.total, 0)
        const capacity = occupancyFiltered.reduce((s, d) => s + d.capacity, 0)
        return {
            pct: Math.round((total / capacity) * 100),
            total,
            capacity,
        }
    }, [occupancyFiltered])

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            {/* ─── Filter bar ──────────────────────────── */}
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
                <StopMultiSelect
                    options={STOP_OPTIONS}
                    selected={selectedStops}
                    onChange={setSelectedStops}
                    icon={<Users2 className="h-4 w-4" />}
                />
            </TimeRangeFilter>


            {/* ─── Charts grid ─────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* 2. Current Occupancy — Radial Bar */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Gauge className="h-5 w-5 text-amber-500" />
                            Загруженность
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                        <ChartContainer
                            config={{ occupancy: { label: "Загрузка", color: avgOccupancy.pct > 80 ? "hsl(0, 84%, 60%)" : avgOccupancy.pct > 50 ? "hsl(38, 92%, 50%)" : "hsl(142, 71%, 45%)" } }}
                            className="h-[220px] w-[220px]"
                        >
                            <RadialBarChart
                                data={[{ name: "occupancy", value: avgOccupancy.pct, fill: "var(--color-occupancy)" }]}
                                startAngle={180}
                                endAngle={0}
                                innerRadius={80}
                                outerRadius={110}
                                cx="50%"
                                cy="80%"
                            >
                                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                                <RadialBar
                                    dataKey="value"
                                    background
                                    cornerRadius={10}
                                    angleAxisId={0}
                                />
                            </RadialBarChart>
                        </ChartContainer>
                        <div className="text-center -mt-4">
                            <div className="text-3xl font-bold">{avgOccupancy.pct}%</div>
                            <p className="text-sm text-muted-foreground mt-1">
                                {avgOccupancy.total} из {avgOccupancy.capacity} мест
                            </p>
                        </div>
                        {/* Per-stop breakdown */}
                        <div className="mt-4 w-full space-y-2">
                            {occupancyFiltered.map((s) => (
                                <div key={s.stopId} className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground truncate max-w-[60%]">{s.stopName.split("/")[0].trim()}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                    width: `${s.pct}%`,
                                                    backgroundColor: s.pct > 80 ? "hsl(0, 84%, 60%)" : s.pct > 50 ? "hsl(38, 92%, 50%)" : "hsl(142, 71%, 45%)",
                                                }}
                                            />
                                        </div>
                                        <span className="font-mono text-xs w-8 text-right">{s.pct}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Queue Density — Bar + threshold */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3 className="h-5 w-5 text-blue-500" />
                            Плотность очереди
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={densityChartConfig} className="h-[280px] w-full">
                            <BarChart data={densityFiltered} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ReferenceLine
                                    y={70}
                                    stroke="hsl(0, 84%, 60%)"
                                    strokeDasharray="4 4"
                                    strokeWidth={2}
                                    label={{ value: "Порог", position: "right", fill: "hsl(0, 84%, 60%)", fontSize: 12 }}
                                />
                                <Bar dataKey="density" radius={[4, 4, 0, 0]}>
                                    {densityFiltered.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.density >= 70 ? "hsl(0, 84%, 60%)" : "var(--color-density)"}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 4. Boarding — Stacked Bar */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ArrowUpFromLine className="h-5 w-5 text-violet-500" />
                            Посадка в автобус
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={boardingChartConfig} className="h-[280px] w-full">
                            <BarChart data={boardingFiltered} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={3} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                {selectedStops.map((stopId) => (
                                    <Bar
                                        key={stopId}
                                        dataKey={stopId}
                                        stackId="boarding"
                                        fill={`var(--color-${stopId})`}
                                        radius={[0, 0, 0, 0]}
                                    />
                                ))}
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* 5. Alighting — Horizontal Bar */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ArrowDownToLine className="h-5 w-5 text-purple-500" />
                            Высадка из автобуса
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={alightingChartConfig} className="h-[280px] w-full">
                            <BarChart
                                data={alightingFiltered}
                                layout="vertical"
                                margin={{ left: 12, right: 12, top: 12, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    width={100}
                                    style={{ fontSize: "11px" }}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="total" fill="var(--color-total)" radius={[0, 6, 6, 0]} barSize={20} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
