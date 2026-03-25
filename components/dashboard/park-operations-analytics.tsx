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
    Trash2,
    CameraOff,
    LightbulbOff,
    Car,
    AlertTriangle,
} from "lucide-react"
import {
    PARKS,
    TIME_RANGES,
    PARK_OPERATIONS_LABELS,
    parkOperationsDailyData,
    parkOperationsIncidentsData,
    filterByLocations,
    filterByTimeRange,
    type ParkId,
    type ParkOperationsType,
} from "@/lib/mock/park-mock-data"

const operationsConfig = {
    trash_overflow: { label: "Урны", color: "hsl(38, 92%, 50%)" },
    camera_obstruction: { label: "Камеры", color: "hsl(0, 84%, 60%)" },
    light_off: { label: "Освещение", color: "hsl(220, 14%, 65%)" },
    vehicle_detect: { label: "Авто", color: "hsl(201, 96%, 52%)" },
} satisfies ChartConfig

const compareConfig = {
    trash_overflow: { label: "Урны", color: "hsl(38, 92%, 50%)" },
    camera_obstruction: { label: "Камеры", color: "hsl(0, 84%, 60%)" },
    light_off: { label: "Освещение", color: "hsl(220, 14%, 65%)" },
    vehicle_detect: { label: "Авто", color: "hsl(201, 96%, 52%)" },
} satisfies ChartConfig

const TYPE_ICONS: Record<ParkOperationsType, typeof Trash2> = {
    trash_overflow: Trash2,
    camera_obstruction: CameraOff,
    light_off: LightbulbOff,
    vehicle_detect: Car,
}

const TYPE_COLORS: Record<ParkOperationsType, string> = {
    trash_overflow: "text-amber-500",
    camera_obstruction: "text-red-500",
    light_off: "text-zinc-500",
    vehicle_detect: "text-sky-500",
}

export function ParkOperationsAnalytics() {
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
            filterByLocations(parkOperationsDailyData, selectedParks),
            timeRange
        ).sort((a, b) => a.date.localeCompare(b.date))
    }, [selectedParks, timeRange])

    const filteredIncidents = useMemo(() => {
        return filterByTimeRangeResult(
            filterByLocations(parkOperationsIncidentsData, selectedParks),
            timeRange
        )
    }, [selectedParks, timeRange])

    const dailyData = useMemo(() => {
        const map = new Map<
            string,
            {
                dateLabel: string
                trash_overflow: number
                camera_obstruction: number
                light_off: number
                vehicle_detect: number
            }
        >()

        for (const item of filteredDaily) {
            const dateLabel = new Date(item.date).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
            })

            if (!map.has(item.date)) {
                map.set(item.date, {
                    dateLabel,
                    trash_overflow: 0,
                    camera_obstruction: 0,
                    light_off: 0,
                    vehicle_detect: 0,
                })
            }

            const row = map.get(item.date)!
            row.trash_overflow += item.trash_overflow
            row.camera_obstruction += item.camera_obstruction
            row.light_off += item.light_off
            row.vehicle_detect += item.vehicle_detect
        }

        return Array.from(map.values())
    }, [filteredDaily])

    const compareData = useMemo(() => {
        return PARKS.filter((park) => selectedParks.includes(park.id)).map((park) => {
            const rows = filteredDaily.filter((item) => item.locationId === park.id)
            return {
                park: park.name,
                trash_overflow: rows.reduce((sum, item) => sum + item.trash_overflow, 0),
                camera_obstruction: rows.reduce((sum, item) => sum + item.camera_obstruction, 0),
                light_off: rows.reduce((sum, item) => sum + item.light_off, 0),
                vehicle_detect: rows.reduce((sum, item) => sum + item.vehicle_detect, 0),
            }
        })
    }, [filteredDaily, selectedParks])

    const totals = useMemo(() => {
        return filteredDaily.reduce(
            (acc, item) => {
                acc.trash_overflow += item.trash_overflow
                acc.camera_obstruction += item.camera_obstruction
                acc.light_off += item.light_off
                acc.vehicle_detect += item.vehicle_detect
                return acc
            },
            {
                trash_overflow: 0,
                camera_obstruction: 0,
                light_off: 0,
                vehicle_detect: 0,
            }
        )
    }, [filteredDaily])


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
                                    id="all-parks-ops"
                                    checked={selectedParks.length === PARKS.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-parks-ops" className="font-medium">
                                    Все парки
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {PARKS.map((park) => (
                                    <div key={park.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`park-ops-${park.id}`}
                                            checked={selectedParks.includes(park.id)}
                                            onCheckedChange={() => togglePark(park.id)}
                                        />
                                        <Label htmlFor={`park-ops-${park.id}`} className="text-sm">
                                            {park.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </TimeRangeFilter>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Trash2 className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-muted-foreground">Урны</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.trash_overflow}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <CameraOff className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-muted-foreground">Камеры</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.camera_obstruction}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-zinc-500/10 to-zinc-600/5 border-zinc-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <LightbulbOff className="h-4 w-4 text-zinc-500" />
                            <span className="text-xs text-muted-foreground">Освещение</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.light_off}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-sky-500/10 to-sky-600/5 border-sky-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Car className="h-4 w-4 text-sky-500" />
                            <span className="text-xs text-muted-foreground">Проезд авто</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.vehicle_detect}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Эксплуатационные проблемы по дням
                        </CardTitle>
                        <CardDescription>
                            Тренд урн, камер, освещения и проезда машин по территории парка
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={operationsConfig} className="h-[300px] w-full">
                            <AreaChart data={dailyData} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Area type="monotone" dataKey="trash_overflow" fill="var(--color-trash_overflow)" fillOpacity={0.12} stroke="var(--color-trash_overflow)" strokeWidth={2} />
                                <Area type="monotone" dataKey="camera_obstruction" fill="var(--color-camera_obstruction)" fillOpacity={0.12} stroke="var(--color-camera_obstruction)" strokeWidth={2} />
                                <Area type="monotone" dataKey="light_off" fill="var(--color-light_off)" fillOpacity={0.12} stroke="var(--color-light_off)" strokeWidth={2} />
                                <Area type="monotone" dataKey="vehicle_detect" fill="var(--color-vehicle_detect)" fillOpacity={0.12} stroke="var(--color-vehicle_detect)" strokeWidth={2} />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-muted-foreground" />
                            Нагрузка по паркам
                        </CardTitle>
                        <CardDescription>
                            Где концентрация эксплуатационных проблем выше
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={compareConfig} className="h-[300px] w-full">
                            <BarChart data={compareData} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                <XAxis dataKey="park" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="trash_overflow" fill="var(--color-trash_overflow)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="camera_obstruction" fill="var(--color-camera_obstruction)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="light_off" fill="var(--color-light_off)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="vehicle_detect" fill="var(--color-vehicle_detect)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Последние эксплуатационные инциденты</CardTitle>
                    <CardDescription>
                        Проблемы, которые влияют на обслуживание и безопасность территории
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
                                                    {PARK_OPERATIONS_LABELS[incident.type]}
                                                </Badge>
                                                <Badge variant={incident.resolved ? "secondary" : "outline"}>
                                                    {incident.resolved ? "Закрыт" : "Требует реакции"}
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

                                        <div className="text-sm text-muted-foreground">
                                            Приоритет:{" "}
                                            <span className="font-medium text-foreground">
                                                {incident.severity === "high" ? "Высокий" : "Средний"}
                                            </span>
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
