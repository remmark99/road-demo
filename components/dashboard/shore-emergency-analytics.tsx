"use client"

import { useMemo, useState } from "react"
import {
    BarChart,
    Bar,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
    Filter,
    MapPin,
    Flame,
    LifeBuoy,
    Clock,
    Siren,
    CheckCircle2,
    XCircle,
    PhoneCall,
} from "lucide-react"
import {
    SHORE_LOCATIONS,
    TIME_RANGES,
    emergencyData,
    filterByTimeRange,
    filterByLocations,
    type TimeRange,
} from "@/lib/mock/shore-mock-data"

const emergencyConfig = {
    water_fall: { label: "Падение в воду", color: "hsl(210, 100%, 50%)" },
    fire_detect: { label: "Возгорание", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

export function ShoreEmergencyAnalytics() {
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
        const byLoc = filterByLocations(emergencyData, selectedLocs)
        const temporal = filterByTimeRange(byLoc, timeRange)
        return temporal.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [timeRange, selectedLocs])

    // Group by date for charts
    const dailyData = useMemo(() => {
        const map = new Map<string, any>()
        for (const item of filteredData) {
            const dateStr = new Date(item.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
            if (!map.has(dateStr)) {
                map.set(dateStr, {
                    dateLabel: dateStr,
                    water_fall: 0,
                    fire_detect: 0,
                })
            }
            const row = map.get(dateStr)!
            row[item.type] += 1
        }
        return Array.from(map.values()).reverse()
    }, [filteredData])

    // KPIs
    const kpis = useMemo(() => {
        let fired = 0
        let falls = 0
        let totalResponse = 0
        let resolvedAndNotified = 0

        for (const d of filteredData) {
            if (d.type === "fire_detect") fired++
            if (d.type === "water_fall") falls++
            totalResponse += d.responseMinutes
            if (d.servicesNotified) resolvedAndNotified++
        }

        const avgResponse = filteredData.length ? Math.round(totalResponse / filteredData.length) : 0
        const notifiedPct = filteredData.length ? Math.round((resolvedAndNotified / filteredData.length) * 100) : 0

        return { fired, falls, avgResponse, notifiedPct }
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
                                    id="all-locs-emg"
                                    checked={selectedLocs.length === SHORE_LOCATIONS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-locs-emg" className="font-medium">
                                    Все локации
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {SHORE_LOCATIONS.map((loc) => (
                                    <div key={loc.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`emg-${loc.id}`}
                                            checked={selectedLocs.includes(loc.id)}
                                            onCheckedChange={() => toggleLoc(loc.id)}
                                        />
                                        <Label htmlFor={`emg-${loc.id}`} className="text-sm">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Flame className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-muted-foreground">Возгорания</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">{kpis.fired}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <LifeBuoy className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span className="text-xs text-muted-foreground">Падения в воду</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-600">{kpis.falls}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-orange-500" />
                            <span className="text-xs text-muted-foreground">Время реакции</span>
                        </div>
                        <div className="text-2xl font-bold">{kpis.avgResponse} <span className="text-sm font-normal">мин</span></div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <PhoneCall className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs text-muted-foreground">Вызовы 112 (Авто)</span>
                        </div>
                        <div className="text-2xl font-bold">{kpis.notifiedPct}%</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Siren className="h-5 w-5 text-red-500" />
                            Динамика ЧС
                        </CardTitle>
                        <CardDescription>
                            Критические инциденты на объектах
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={emergencyConfig} className="h-[280px] w-full">
                            <BarChart data={dailyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="water_fall" stackId="emg" fill="var(--color-water_fall)" radius={[0, 0, 0, 0]}>
                                </Bar>
                                <Bar dataKey="fire_detect" stackId="emg" fill="var(--color-fire_detect)" radius={[4, 4, 0, 0]}>
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <PhoneCall className="h-5 w-5 text-blue-500" />
                            Журнал вызовов экстренных служб
                        </CardTitle>
                        <CardDescription>
                            Автоматическая передача данных в систему 112
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[280px]">
                            <div className="space-y-2">
                                {filteredData.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground mt-10">
                                        Инцидентов не найдено
                                    </div>
                                ) : (
                                    filteredData.slice(0, 20).map((inc) => (
                                        <div
                                            key={inc.id}
                                            className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex-shrink-0">
                                                {inc.type === "fire_detect" ? (
                                                    <Flame className="h-5 w-5 text-red-500" />
                                                ) : (
                                                    <LifeBuoy className="h-5 w-5 text-blue-500" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono text-muted-foreground">{inc.id}</span>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/30 text-red-500 bg-red-500/10">
                                                        Вызов 112
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                    {SHORE_LOCATIONS.find(l => l.id === inc.locationId)?.name} · {new Date(inc.date).toLocaleDateString("ru-RU")}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-xs text-muted-foreground">{inc.responseMinutes} мин ответ</span>
                                                {inc.resolved ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                ) : (
                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
