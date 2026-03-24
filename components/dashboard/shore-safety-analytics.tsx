"use client"

import { useMemo, useState } from "react"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
    Filter,
    MapPin,
    Baby,
    ShieldAlert,
    Waves,
} from "lucide-react"
import {
    SHORE_LOCATIONS,
    TIME_RANGES,
    safetyData,
    filterByTimeRange,
    filterByLocations,
    type TimeRange,
} from "@/lib/mock/shore-mock-data"

const dailyBarConfig = {
    restricted_zone: { label: "Нарушение зоны (вода/лед)", color: "hsl(0, 84%, 60%)" },
    unaccompanied_child: { label: "Дети без присмотра", color: "hsl(280, 67%, 50%)" },
} satisfies ChartConfig

const PIE_COLORS = ["hsl(0, 84%, 60%)", "hsl(280, 67%, 50%)"]

export function ShoreSafetyAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRange>("week")
    const [selectedLocs, setSelectedLocs] = useState<string[]>(
        SHORE_LOCATIONS.map((s) => s.id)
    )

    const toggleLoc = (id: string) => {
        setSelectedLocs((prev) =>
            prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
        )
    }

    const toggleAll = () => {
        setSelectedLocs((prev) =>
            prev.length === SHORE_LOCATIONS.length ? [] : SHORE_LOCATIONS.map((s) => s.id)
        )
    }

    const filteredData = useMemo(() => {
        const byLoc = filterByLocations(safetyData, selectedLocs)
        const temporal = filterByTimeRange(byLoc, timeRange)
        return temporal.sort((a, b) => a.date.localeCompare(b.date))
    }, [timeRange, selectedLocs])

    // Group by date for charts
    const dailyData = useMemo(() => {
        const map = new Map<string, any>()
        for (const item of filteredData) {
            const dateStr = new Date(item.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
            if (!map.has(dateStr)) {
                map.set(dateStr, {
                    dateLabel: dateStr,
                    restricted_zone: 0,
                    unaccompanied_child: 0,
                })
            }
            const row = map.get(dateStr)!
            row.restricted_zone += item.restricted_zone
            row.unaccompanied_child += item.unaccompanied_child
        }
        return Array.from(map.values())
    }, [filteredData])

    const pieData = useMemo(() => {
        let restricted_zone = 0
        let unaccompanied_child = 0
        for (const item of filteredData) {
            restricted_zone += item.restricted_zone
            unaccompanied_child += item.unaccompanied_child
        }
        return [
            { name: "Запретная зона", value: restricted_zone },
            { name: "Дети без присмотра", value: unaccompanied_child },
        ]
    }, [filteredData])

    // KPIs
    const kpis = useMemo(() => {
        const totals = { restricted: 0, children: 0 }
        for (const d of filteredData) {
            totals.restricted += d.restricted_zone
            totals.children += d.unaccompanied_child
        }
        return totals
    }, [filteredData])

    const selectedLabel =
        selectedLocs.length === SHORE_LOCATIONS.length
            ? "Все локации"
            : selectedLocs.length === 0
                ? "Не выбрано"
                : `${selectedLocs.length} из ${SHORE_LOCATIONS.length}`

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
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
                            <MapPin className="h-4 w-4" />
                            {selectedLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="all-locs-saf"
                                    checked={selectedLocs.length === SHORE_LOCATIONS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-locs-saf" className="font-medium">
                                    Все локации
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {SHORE_LOCATIONS.map((loc) => (
                                    <div key={loc.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`saf-${loc.id}`}
                                            checked={selectedLocs.includes(loc.id)}
                                            onCheckedChange={() => toggleLoc(loc.id)}
                                        />
                                        <Label htmlFor={`saf-${loc.id}`} className="text-sm">
                                            {loc.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-4 px-6 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Waves className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium text-muted-foreground">Нарушение запретных зон</span>
                            </div>
                            <div className="text-3xl font-bold">{kpis.restricted}</div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                    <CardContent className="pt-4 pb-4 px-6 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Baby className="h-4 w-4 text-purple-500" />
                                <span className="text-sm font-medium text-muted-foreground">Дети без сопровождения</span>
                            </div>
                            <div className="text-3xl font-bold">{kpis.children}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldAlert className="h-5 w-5 text-red-500" />
                            Динамика инцидентов безопасности
                        </CardTitle>
                        <CardDescription>
                            Зафиксировано нарушений по дням
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={dailyBarConfig} className="h-[300px] w-full">
                            <BarChart data={dailyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="restricted_zone" stackId="safety" fill="var(--color-restricted_zone)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="unaccompanied_child" stackId="safety" fill="var(--color-unaccompanied_child)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldAlert className="h-5 w-5 text-purple-500" />
                            Распределение типов
                        </CardTitle>
                        <CardDescription>
                            Соотношение видов инцидентов
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center p-6">
                        <ChartContainer
                            config={{}}
                            className="h-[200px] w-[200px]"
                        >
                            <PieChart>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const d = payload[0].payload
                                        return (
                                            <div className="bg-background border rounded-lg px-3 py-2 text-xs shadow-xl">
                                                <p className="font-medium">{d.name}</p>
                                                <p className="text-muted-foreground">{d.value} инцидентов</p>
                                            </div>
                                        )
                                    }}
                                />
                                <Pie
                                    data={pieData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={2}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ChartContainer>
                        <div className="mt-4 space-y-2 w-full text-sm">
                            {pieData.map((s, i) => (
                                <div key={s.name} className="flex items-center gap-2 w-full">
                                    <div
                                        className="w-3 h-3 rounded-sm flex-shrink-0"
                                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                                    />
                                    <span className="text-muted-foreground flex-1 truncate">{s.name}</span>
                                    <span className="font-mono text-xs">{s.value}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
