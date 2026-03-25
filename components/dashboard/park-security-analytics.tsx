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
import { TimeRangeFilter, filterByTimeRangeResult, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    MapPin,
    PackageSearch,
    PersonStanding,
    Swords,
    Flame,
    Clock,
    AlertTriangle,
} from "lucide-react"
import {
    PARKS,
    TIME_RANGES,
    PARK_SECURITY_LABELS,
    parkSecurityDailyData,
    parkSecurityIncidentsData,
    filterByLocations,
    filterByTimeRange,
    type ParkId,
    type ParkSecurityType,
} from "@/lib/mock/park-mock-data"

const dailyConfig = {
    left_item: { label: "Предметы", color: "hsl(270, 80%, 65%)" },
    person_down: { label: "Лежачий человек", color: "hsl(24, 95%, 60%)" },
    fight: { label: "Драка", color: "hsl(0, 84%, 60%)" },
    fire: { label: "Возгорание", color: "hsl(8, 90%, 57%)" },
} satisfies ChartConfig

const compareConfig = {
    left_item: { label: "Предметы", color: "hsl(270, 80%, 65%)" },
    person_down: { label: "Лежачий человек", color: "hsl(24, 95%, 60%)" },
    fight: { label: "Драка", color: "hsl(0, 84%, 60%)" },
    fire: { label: "Возгорание", color: "hsl(8, 90%, 57%)" },
} satisfies ChartConfig

const TYPE_ICONS: Record<ParkSecurityType, typeof PackageSearch> = {
    left_item: PackageSearch,
    person_down: PersonStanding,
    fight: Swords,
    fire: Flame,
}

const TYPE_COLORS: Record<ParkSecurityType, string> = {
    left_item: "text-violet-500",
    person_down: "text-orange-500",
    fight: "text-red-500",
    fire: "text-rose-500",
}

const SEVERITY_STYLES = {
    medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    high: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    critical: "bg-red-500/15 text-red-600 dark:text-red-400",
} as const

const SEVERITY_LABELS = {
    medium: "Средний",
    high: "Высокий",
    critical: "Критичный",
} as const

export function ParkSecurityAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "week" })
    const [selectedParks, setSelectedParks] = useState<ParkId[]>(
        PARKS.map((park) => park.id)
    )

    const togglePark = (parkId: ParkId) => {
        setSelectedParks((prev) =>
            prev.includes(parkId)
                ? prev.filter((id) => id !== parkId)
                : [...prev, parkId]
        )
    }

    const toggleAll = () => {
        setSelectedParks((prev) =>
            prev.length === PARKS.length ? [] : PARKS.map((park) => park.id)
        )
    }

    const filteredDaily = useMemo(() => {
        return filterByTimeRangeResult(
            filterByLocations(parkSecurityDailyData, selectedParks),
            timeRange
        ).sort((a, b) => a.date.localeCompare(b.date))
    }, [selectedParks, timeRange])

    const filteredIncidents = useMemo(() => {
        return filterByTimeRangeResult(
            filterByLocations(parkSecurityIncidentsData, selectedParks),
            timeRange
        )
    }, [selectedParks, timeRange])

    const dailyData = useMemo(() => {
        const map = new Map<
            string,
            { dateLabel: string; left_item: number; person_down: number; fight: number; fire: number }
        >()

        for (const item of filteredDaily) {
            const dateLabel = new Date(item.date).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
            })

            if (!map.has(item.date)) {
                map.set(item.date, {
                    dateLabel,
                    left_item: 0,
                    person_down: 0,
                    fight: 0,
                    fire: 0,
                })
            }

            const row = map.get(item.date)!
            row.left_item += item.left_item
            row.person_down += item.person_down
            row.fight += item.fight
            row.fire += item.fire
        }

        return Array.from(map.values())
    }, [filteredDaily])

    const compareData = useMemo(() => {
        return PARKS.filter((park) => selectedParks.includes(park.id)).map((park) => {
            const rows = filteredDaily.filter((item) => item.locationId === park.id)
            return {
                park: park.name,
                left_item: rows.reduce((sum, item) => sum + item.left_item, 0),
                person_down: rows.reduce((sum, item) => sum + item.person_down, 0),
                fight: rows.reduce((sum, item) => sum + item.fight, 0),
                fire: rows.reduce((sum, item) => sum + item.fire, 0),
            }
        })
    }, [filteredDaily, selectedParks])

    const totals = useMemo(() => {
        return filteredDaily.reduce(
            (acc, item) => {
                acc.left_item += item.left_item
                acc.person_down += item.person_down
                acc.fight += item.fight
                acc.fire += item.fire
                return acc
            },
            { left_item: 0, person_down: 0, fight: 0, fire: 0 }
        )
    }, [filteredDaily])

    const avgResponse = useMemo(() => {
        if (filteredIncidents.length === 0) return 0
        const total = filteredIncidents.reduce(
            (sum, incident) => sum + incident.responseMinutes,
            0
        )
        return Math.round(total / filteredIncidents.length)
    }, [filteredIncidents])


    const selectedLabel =
        selectedParks.length === PARKS.length
            ? "Все парки"
            : selectedParks.length === 0
                ? "Не выбрано"
                : `${selectedParks.length} из ${PARKS.length}`

    const getParkName = (parkId: ParkId) =>
        PARKS.find((park) => park.id === parkId)?.name ?? parkId

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
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
                                    id="all-parks-security"
                                    checked={selectedParks.length === PARKS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-parks-security" className="font-medium">
                                    Все парки
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {PARKS.map((park) => (
                                    <div key={park.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`park-security-${park.id}`}
                                            checked={selectedParks.includes(park.id)}
                                            onCheckedChange={() => togglePark(park.id)}
                                        />
                                        <Label htmlFor={`park-security-${park.id}`} className="text-sm">
                                            {park.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </TimeRangeFilter>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <PackageSearch className="h-4 w-4 text-violet-500" />
                            <span className="text-xs text-muted-foreground">Предметы</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.left_item}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <PersonStanding className="h-4 w-4 text-orange-500" />
                            <span className="text-xs text-muted-foreground">Лежачий человек</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.person_down}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Swords className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-muted-foreground">Драки</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.fight}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Flame className="h-4 w-4 text-rose-500" />
                            <span className="text-xs text-muted-foreground">Возгорания</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.fire}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-blue-500" />
                            <span className="text-xs text-muted-foreground">Ср. реакция</span>
                        </div>
                        <div className="text-2xl font-bold">{avgResponse} мин</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Динамика инцидентов
                        </CardTitle>
                        <CardDescription>
                            Суммарные события безопасности по выбранным паркам
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={dailyConfig} className="h-[300px] w-full">
                            <AreaChart data={dailyData} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="fill-left-item" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-left_item)" stopOpacity={0.75} />
                                        <stop offset="95%" stopColor="var(--color-left_item)" stopOpacity={0.08} />
                                    </linearGradient>
                                    <linearGradient id="fill-person-down" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-person_down)" stopOpacity={0.75} />
                                        <stop offset="95%" stopColor="var(--color-person_down)" stopOpacity={0.08} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Area type="monotone" dataKey="left_item" fill="url(#fill-left-item)" stroke="var(--color-left_item)" strokeWidth={2} />
                                <Area type="monotone" dataKey="person_down" fill="url(#fill-person-down)" stroke="var(--color-person_down)" strokeWidth={2} />
                                <Area type="monotone" dataKey="fight" fillOpacity={0.2} fill="var(--color-fight)" stroke="var(--color-fight)" strokeWidth={2} />
                                <Area type="monotone" dataKey="fire" fillOpacity={0.2} fill="var(--color-fire)" stroke="var(--color-fire)" strokeWidth={2} />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-muted-foreground" />
                            Сравнение парков
                        </CardTitle>
                        <CardDescription>
                            Какие территории дают больше тревожных событий
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={compareConfig} className="h-[300px] w-full">
                            <BarChart data={compareData} layout="vertical" margin={{ left: 8, right: 12, top: 10, bottom: 0 }}>
                                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                                <YAxis dataKey="park" type="category" tickLine={false} axisLine={false} width={72} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="left_item" stackId="incidents" fill="var(--color-left_item)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="person_down" stackId="incidents" fill="var(--color-person_down)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="fight" stackId="incidents" fill="var(--color-fight)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="fire" stackId="incidents" fill="var(--color-fire)" radius={[4, 4, 4, 4]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Последние инциденты</CardTitle>
                    <CardDescription>
                        Журнал критичных и операционно значимых событий
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[260px] pr-4">
                        <div className="space-y-3">
                            {filteredIncidents.slice(0, 12).map((incident) => {
                                const Icon = TYPE_ICONS[incident.type]
                                return (
                                    <div
                                        key={incident.id}
                                        className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="outline" className="gap-1.5">
                                                    <Icon className={`h-3.5 w-3.5 ${TYPE_COLORS[incident.type]}`} />
                                                    {PARK_SECURITY_LABELS[incident.type]}
                                                </Badge>
                                                <Badge className={SEVERITY_STYLES[incident.severity]}>
                                                    {SEVERITY_LABELS[incident.severity]}
                                                </Badge>
                                            </div>
                                            <div className="text-sm font-medium">
                                                {getParkName(incident.locationId)} · {incident.zone}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(incident.date).toLocaleDateString("ru-RU", {
                                                    day: "2-digit",
                                                    month: "long",
                                                })}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="text-muted-foreground">
                                                Реакция: <span className="font-medium text-foreground">{incident.responseMinutes} мин</span>
                                            </div>
                                            <Badge variant={incident.resolved ? "secondary" : "outline"}>
                                                {incident.resolved ? "Закрыт" : "В работе"}
                                            </Badge>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    )
}
