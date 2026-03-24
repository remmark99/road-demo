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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Filter,
    MapPin,
    ShieldAlert,
    Footprints,
    User,
    Car,
    BellRing,
    Siren,
} from "lucide-react"
import {
    SHORE_LOCATIONS,
    TIME_RANGES,
    securityData,
    filterByTimeRange,
    filterByLocations,
    type TimeRange,
} from "@/lib/mock/shore-mock-data"

const trafficConfig = {
    person_detect: { label: "Проход людей", color: "hsl(210, 100%, 50%)" },
    vehicle_detect: { label: "Проезд авто", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const incidentsConfig = {
    line_cross: { label: "Пересечения линии", color: "hsl(38, 92%, 50%)" },
    audio_alarm: { label: "Аудио оповещения", color: "hsl(280, 67%, 50%)" },
    light_alarm: { label: "Световые оповещения", color: "hsl(140, 70%, 50%)" },
} satisfies ChartConfig

export function ShoreSecurityAnalytics() {
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
        const byLoc = filterByLocations(securityData, selectedLocs)
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
                    person_detect: 0,
                    vehicle_detect: 0,
                    line_cross: 0,
                    audio_alarm: 0,
                    light_alarm: 0,
                })
            }
            const row = map.get(dateStr)!
            row.person_detect += item.person_detect
            row.vehicle_detect += item.vehicle_detect
            row.line_cross += item.line_cross
            row.audio_alarm += item.audio_alarm
            row.light_alarm += item.light_alarm
        }
        return Array.from(map.values())
    }, [filteredData])

    // KPIs
    const kpis = useMemo(() => {
        const totals = { persons: 0, vehicles: 0, crosses: 0, audio: 0, light: 0 }
        for (const d of filteredData) {
            totals.persons += d.person_detect
            totals.vehicles += d.vehicle_detect
            totals.crosses += d.line_cross
            totals.audio += d.audio_alarm
            totals.light += d.light_alarm
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
            {/* Filter bar */}
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
                                    id="all-locs-sec"
                                    checked={selectedLocs.length === SHORE_LOCATIONS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-locs-sec" className="font-medium">
                                    Все локации
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {SHORE_LOCATIONS.map((loc) => (
                                    <div key={loc.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`sec-${loc.id}`}
                                            checked={selectedLocs.includes(loc.id)}
                                            onCheckedChange={() => toggleLoc(loc.id)}
                                        />
                                        <Label htmlFor={`sec-${loc.id}`} className="text-sm">
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-blue-500" />
                            <span className="text-xs text-muted-foreground">Люди</span>
                        </div>
                        <div className="text-2xl font-bold">{kpis.persons}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Car className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-muted-foreground">Автомобили</span>
                        </div>
                        <div className="text-2xl font-bold">{kpis.vehicles}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Footprints className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-muted-foreground">Пересечения</span>
                        </div>
                        <div className="text-2xl font-bold">{kpis.crosses}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <BellRing className="h-4 w-4 text-purple-500" />
                            <span className="text-xs text-muted-foreground">Аудио-тревоги</span>
                        </div>
                        <div className="text-2xl font-bold">{kpis.audio}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Siren className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs text-muted-foreground">Световые тревоги</span>
                        </div>
                        <div className="text-2xl font-bold">{kpis.light}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <User className="h-5 w-5 text-blue-500" />
                            Динамика трафика
                        </CardTitle>
                        <CardDescription>
                            Активность посетителей и автотранспорта
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={trafficConfig} className="h-[280px] w-full">
                            <AreaChart data={dailyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="fillPerson" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-person_detect)" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="var(--color-person_detect)" stopOpacity={0.1} />
                                    </linearGradient>
                                    <linearGradient id="fillVeh" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-vehicle_detect)" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="var(--color-vehicle_detect)" stopOpacity={0.1} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Area type="monotone" dataKey="person_detect" stroke="var(--color-person_detect)" fillOpacity={1} fill="url(#fillPerson)" />
                                <Area type="monotone" dataKey="vehicle_detect" stroke="var(--color-vehicle_detect)" fillOpacity={1} fill="url(#fillVeh)" />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldAlert className="h-5 w-5 text-amber-500" />
                            Инциденты периметра
                        </CardTitle>
                        <CardDescription>
                            Количество пересечений и отработанных предупреждений
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={incidentsConfig} className="h-[280px] w-full">
                            <BarChart data={dailyData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="line_cross" fill="var(--color-line_cross)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="audio_alarm" fill="var(--color-audio_alarm)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="light_alarm" fill="var(--color-light_alarm)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
