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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    BusFront,
    CheckCircle2,
    Clock,
    Filter,
    MapPin,
    Route,
    TriangleAlert,
} from "lucide-react"
import {
    TRANSPORT_ROUTES,
    TIME_RANGES,
    TRANSPORT_INCIDENT_LABELS,
    transportDailyData,
    transportIncidentsData,
    filterByRoutes,
    filterByTimeRange,
    type TimeRange,
    type TransportIncidentType,
    type TransportRouteId,
} from "@/lib/mock/transport-mock-data"

const trendConfig = {
    route_deviation: { label: "Отклонения", color: "hsl(38, 92%, 50%)" },
    wait_overrun: { label: "Превышение ожидания", color: "hsl(210, 100%, 55%)" },
} satisfies ChartConfig

const compareConfig = {
    route_deviation: { label: "Отклонения", color: "hsl(38, 92%, 50%)" },
    wait_overrun: { label: "Превышение ожидания", color: "hsl(210, 100%, 55%)" },
} satisfies ChartConfig

const TYPE_COLORS: Record<TransportIncidentType, string> = {
    route_deviation: "text-amber-500",
    wait_overrun: "text-blue-500",
    doors_not_opened: "text-rose-500",
}

export function TransportRouteAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRange>("week")
    const [selectedRoutes, setSelectedRoutes] = useState<TransportRouteId[]>(
        TRANSPORT_ROUTES.map((route) => route.id)
    )

    const toggleRoute = (routeId: TransportRouteId) => {
        setSelectedRoutes((prev) =>
            prev.includes(routeId)
                ? prev.filter((id) => id !== routeId)
                : [...prev, routeId]
        )
    }

    const toggleAll = () => {
        setSelectedRoutes((prev) =>
            prev.length === TRANSPORT_ROUTES.length
                ? []
                : TRANSPORT_ROUTES.map((route) => route.id)
        )
    }

    const filteredDaily = useMemo(() => {
        return filterByTimeRange(
            filterByRoutes(transportDailyData, selectedRoutes),
            timeRange
        ).sort((a, b) => a.date.localeCompare(b.date))
    }, [selectedRoutes, timeRange])

    const filteredIncidents = useMemo(() => {
        return filterByTimeRange(
            filterByRoutes(transportIncidentsData, selectedRoutes),
            timeRange
        ).filter((incident) => incident.type !== "doors_not_opened")
    }, [selectedRoutes, timeRange])

    const dailyData = useMemo(() => {
        const map = new Map<
            string,
            {
                dateLabel: string
                route_deviation: number
                wait_overrun: number
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
                    route_deviation: 0,
                    wait_overrun: 0,
                })
            }

            const row = map.get(item.date)!
            row.route_deviation += item.route_deviation
            row.wait_overrun += item.wait_overrun
        }

        return Array.from(map.values())
    }, [filteredDaily])

    const routeCompare = useMemo(() => {
        return TRANSPORT_ROUTES.filter((route) => selectedRoutes.includes(route.id)).map((route) => {
            const rows = filteredDaily.filter((item) => item.routeId === route.id)
            const avgOntime =
                rows.length === 0
                    ? 0
                    : Math.round(
                        rows.reduce((sum, item) => sum + item.ontimePct, 0) / rows.length
                    )

            return {
                route: route.name,
                route_deviation: rows.reduce((sum, item) => sum + item.route_deviation, 0),
                wait_overrun: rows.reduce((sum, item) => sum + item.wait_overrun, 0),
                ontimePct: avgOntime,
            }
        })
    }, [filteredDaily, selectedRoutes])

    const totals = useMemo(() => {
        const result = filteredDaily.reduce(
            (acc, item) => {
                acc.route_deviation += item.route_deviation
                acc.wait_overrun += item.wait_overrun
                acc.completedTrips += item.completedTrips
                acc.avgWaitMinutes += item.avgWaitMinutes
                acc.ontimePct += item.ontimePct
                return acc
            },
            {
                route_deviation: 0,
                wait_overrun: 0,
                completedTrips: 0,
                avgWaitMinutes: 0,
                ontimePct: 0,
            }
        )

        return {
            ...result,
            avgWaitMinutes:
                filteredDaily.length === 0
                    ? 0
                    : Math.round(result.avgWaitMinutes / filteredDaily.length),
            ontimePct:
                filteredDaily.length === 0
                    ? 0
                    : Math.round(result.ontimePct / filteredDaily.length),
        }
    }, [filteredDaily])

    const selectedLabel =
        selectedRoutes.length === TRANSPORT_ROUTES.length
            ? "Все маршруты"
            : selectedRoutes.length === 0
                ? "Не выбрано"
                : `${selectedRoutes.length} из ${TRANSPORT_ROUTES.length}`

    const getRouteName = (routeId: TransportRouteId) =>
        TRANSPORT_ROUTES.find((route) => route.id === routeId)?.name ?? routeId

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TIME_RANGES.map((range) => (
                            <SelectItem key={range.value} value={range.value}>
                                {range.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Route className="h-4 w-4" />
                            {selectedLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="all-routes-analytics"
                                    checked={selectedRoutes.length === TRANSPORT_ROUTES.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="all-routes-analytics" className="font-medium">
                                    Все маршруты
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {TRANSPORT_ROUTES.map((route) => (
                                    <div key={route.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`transport-route-${route.id}`}
                                            checked={selectedRoutes.includes(route.id)}
                                            onCheckedChange={() => toggleRoute(route.id)}
                                        />
                                        <Label htmlFor={`transport-route-${route.id}`} className="text-sm">
                                            {route.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Route className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-muted-foreground">Отклонения</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.route_deviation}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-blue-500" />
                            <span className="text-xs text-muted-foreground">Ожидание</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.wait_overrun}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-sky-500/10 to-sky-600/5 border-sky-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-sky-500" />
                            <span className="text-xs text-muted-foreground">Ср. ожидание</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.avgWaitMinutes} мин</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs text-muted-foreground">По графику</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.ontimePct}%</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
                    <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                            <BusFront className="h-4 w-4 text-violet-500" />
                            <span className="text-xs text-muted-foreground">Рейсы</span>
                        </div>
                        <div className="text-2xl font-bold">{totals.completedTrips}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <TriangleAlert className="h-5 w-5 text-amber-500" />
                            Маршрутная дисциплина по дням
                        </CardTitle>
                        <CardDescription>
                            Отклонения и превышения ожидания на выбранных маршрутах
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={trendConfig} className="h-[300px] w-full">
                            <AreaChart data={dailyData} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Area type="monotone" dataKey="route_deviation" fill="var(--color-route_deviation)" fillOpacity={0.12} stroke="var(--color-route_deviation)" strokeWidth={2} />
                                <Area type="monotone" dataKey="wait_overrun" fill="var(--color-wait_overrun)" fillOpacity={0.12} stroke="var(--color-wait_overrun)" strokeWidth={2} />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-muted-foreground" />
                            Сравнение маршрутов
                        </CardTitle>
                        <CardDescription>
                            Где дисциплина отклоняется сильнее всего
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={compareConfig} className="h-[300px] w-full">
                            <BarChart data={routeCompare} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                <XAxis dataKey="route" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="route_deviation" fill="var(--color-route_deviation)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="wait_overrun" fill="var(--color-wait_overrun)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Последние маршрутные инциденты</CardTitle>
                    <CardDescription>
                        События, влияющие на соблюдение трассы и нормативного ожидания
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[260px] pr-4">
                        <div className="space-y-3">
                            {filteredIncidents.slice(0, 12).map((incident) => (
                                <div
                                    key={incident.id}
                                    className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="gap-1.5">
                                                <Route className={`h-3.5 w-3.5 ${TYPE_COLORS[incident.type]}`} />
                                                {TRANSPORT_INCIDENT_LABELS[incident.type]}
                                            </Badge>
                                            <Badge variant={incident.resolved ? "secondary" : "outline"}>
                                                {incident.resolved ? "Урегулирован" : "Открыт"}
                                            </Badge>
                                        </div>
                                        <div className="text-sm font-medium">
                                            {getRouteName(incident.routeId)} · {incident.stopName}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(incident.date).toLocaleDateString("ru-RU", {
                                                day: "2-digit",
                                                month: "long",
                                            })}
                                        </div>
                                    </div>

                                    <div className="text-sm text-muted-foreground">
                                        Отклонение:{" "}
                                        <span className="font-medium text-foreground">{incident.delayMinutes} мин</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    )
}
