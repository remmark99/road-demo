"use client"

import { useMemo, useState } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import { Building2, Camera, Map as MapIcon, ShieldAlert, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    TimeRangeFilter,
    filterByTimeRangeResult,
    type TimeRangeResult,
} from "@/components/dashboard/time-range-filter"
import {
    ROAD_INCIDENT_TYPES,
    roadCityDistrictRows,
    roadCityIncidentRows,
    type RoadIncidentType,
} from "@/lib/mock/road-analytics-mock-data"

type SortMode = "incidents" | "overdue" | "coverage"
type DistrictIncidentChartRow = {
    districtName: string
    servicedKm: number
    intersections: number
    cameras: number
    onlinePct: number
    avgReactionHours: number
    openIncidents: number
    overdueIncidents: number
} & Partial<Record<RoadIncidentType, number>>

const districtLoadConfig = {
    openIncidents: { label: "Открыто", color: "hsl(35, 92%, 52%)" },
    overdueIncidents: { label: "Просрочено", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const incidentTypeColors = [
    "hsl(210, 89%, 54%)",
    "hsl(262, 83%, 58%)",
    "hsl(190, 91%, 41%)",
    "hsl(160, 72%, 38%)",
    "hsl(35, 92%, 52%)",
    "hsl(345, 82%, 56%)",
]

const incidentTypeConfig = ROAD_INCIDENT_TYPES.reduce((acc, incidentType, index) => {
    acc[incidentType.id] = {
        label: incidentType.shortLabel,
        color: incidentTypeColors[index % incidentTypeColors.length],
    }
    return acc
}, {} as ChartConfig)

function getSortLabel(sortMode: SortMode) {
    if (sortMode === "coverage") return "По онлайн-покрытию"
    if (sortMode === "overdue") return "По просроченным"
    return "По открытым инцидентам"
}

function getDominantIncidentLabel(row: DistrictIncidentChartRow) {
    const dominant = ROAD_INCIDENT_TYPES
        .map((incidentType) => ({
            label: incidentType.label,
            value: Number(row[incidentType.id] ?? 0),
        }))
        .sort((left, right) => right.value - left.value)[0]

    return dominant && dominant.value > 0 ? dominant.label : "Нет активных"
}

function formatDistrictTick(value: string) {
    return value.length > 18 ? `${value.slice(0, 17)}...` : value
}

export function RoadCityAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "week" })
    const [sortMode, setSortMode] = useState<SortMode>("incidents")
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>(
        roadCityDistrictRows.map((row) => row.districtName)
    )

    const toggleDistrict = (districtName: string) => {
        setSelectedDistricts((current) =>
            current.includes(districtName)
                ? current.filter((item) => item !== districtName)
                : [...current, districtName]
        )
    }

    const toggleAll = () => {
        setSelectedDistricts((current) =>
            current.length === roadCityDistrictRows.length
                ? []
                : roadCityDistrictRows.map((row) => row.districtName)
        )
    }

    const periodIncidentRows = useMemo(() => {
        return filterByTimeRangeResult(roadCityIncidentRows, timeRange)
            .filter((row) => selectedDistricts.includes(row.districtName))
    }, [selectedDistricts, timeRange])

    const filteredRows = useMemo(() => {
        const rowsByDistrict = new Map<string, DistrictIncidentChartRow>()

        for (const district of roadCityDistrictRows) {
            if (!selectedDistricts.includes(district.districtName)) continue

            const row: DistrictIncidentChartRow = {
                ...district,
                openIncidents: 0,
                overdueIncidents: 0,
            }

            for (const incidentType of ROAD_INCIDENT_TYPES) {
                row[incidentType.id] = 0
            }

            rowsByDistrict.set(district.districtName, row)
        }

        for (const incident of periodIncidentRows) {
            const row = rowsByDistrict.get(incident.districtName)

            if (!row) continue

            row.openIncidents += incident.openIncidents
            row.overdueIncidents += incident.overdueIncidents
            row[incident.incidentType] = Number(row[incident.incidentType] ?? 0) + incident.openIncidents
        }

        return Array.from(rowsByDistrict.values()).sort((left, right) => {
            if (sortMode === "coverage") {
                return right.onlinePct - left.onlinePct || right.cameras - left.cameras
            }
            if (sortMode === "overdue") {
                return right.overdueIncidents - left.overdueIncidents || right.openIncidents - left.openIncidents
            }
            return right.openIncidents - left.openIncidents || right.overdueIncidents - left.overdueIncidents
        })
    }, [periodIncidentRows, selectedDistricts, sortMode])

    const chartRows = filteredRows.slice(0, 10)
    const activeIncidentTypes = useMemo(() => {
        return ROAD_INCIDENT_TYPES.filter((incidentType) =>
            filteredRows.some((row) => Number(row[incidentType.id] ?? 0) > 0)
        )
    }, [filteredRows])
    const totals = useMemo(() => {
        const intersections = filteredRows.reduce((sum, row) => sum + row.intersections, 0)
        const cameras = filteredRows.reduce((sum, row) => sum + row.cameras, 0)
        const openIncidents = filteredRows.reduce((sum, row) => sum + row.openIncidents, 0)
        const overdueIncidents = filteredRows.reduce((sum, row) => sum + row.overdueIncidents, 0)
        const avgOnline =
            filteredRows.length === 0
                ? 0
                : Math.round(filteredRows.reduce((sum, row) => sum + row.onlinePct, 0) / filteredRows.length)
        const incidentTypeTotals = ROAD_INCIDENT_TYPES.map((incidentType) => ({
            label: incidentType.label,
            value: filteredRows.reduce((sum, row) => sum + Number(row[incidentType.id] ?? 0), 0),
        })).sort((left, right) => right.value - left.value)
        const worstDistrict = filteredRows
            .slice()
            .sort((left, right) => right.overdueIncidents - left.overdueIncidents || right.openIncidents - left.openIncidents)[0]

        return {
            intersections,
            cameras,
            openIncidents,
            overdueIncidents,
            avgOnline,
            topIncidentType: incidentTypeTotals[0],
            worstDistrict,
        }
    }, [filteredRows])

    const selectedLabel =
        selectedDistricts.length === roadCityDistrictRows.length
            ? "Все микрорайоны"
            : selectedDistricts.length === 0
                ? "Не выбрано"
                : `${selectedDistricts.length} из ${roadCityDistrictRows.length}`

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
                <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                    <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Сортировка" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="incidents">По открытым инцидентам</SelectItem>
                        <SelectItem value="overdue">По просроченным</SelectItem>
                        <SelectItem value="coverage">По онлайн-покрытию</SelectItem>
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <MapIcon className="h-4 w-4" />
                            {selectedLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="road-city-all-districts"
                                    checked={selectedDistricts.length === roadCityDistrictRows.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="road-city-all-districts" className="font-medium">
                                    Все микрорайоны
                                </Label>
                            </div>
                            <div className="max-h-72 space-y-2 overflow-auto border-t pt-2">
                                {roadCityDistrictRows.map((row) => (
                                    <div key={row.districtName} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`road-city-${row.districtName}`}
                                            checked={selectedDistricts.includes(row.districtName)}
                                            onCheckedChange={() => toggleDistrict(row.districtName)}
                                        />
                                        <Label htmlFor={`road-city-${row.districtName}`} className="text-sm">
                                            {row.districtName}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                <Badge variant="outline" className="bg-background">
                    {getSortLabel(sortMode)}
                </Badge>
            </TimeRangeFilter>

            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="h-4 w-4 text-primary" />
                            Микрорайоны
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{filteredRows.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Camera className="h-4 w-4 text-sky-500" />
                            Камеры
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.cameras}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                            Открыто за период
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.openIncidents}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <TriangleAlert className="h-4 w-4 text-red-500" />
                            Просрочено
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.overdueIncidents}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Разделение микрорайонов по инцидентам</CardTitle>
                        <CardDescription>
                            Открытые и просроченные дорожные события за выбранный период.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={districtLoadConfig} className="h-[360px] w-full">
                            <BarChart data={chartRows} layout="vertical" margin={{ left: 18, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} />
                                <YAxis
                                    type="category"
                                    dataKey="districtName"
                                    tickLine={false}
                                    axisLine={false}
                                    width={150}
                                    tickFormatter={formatDistrictTick}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="openIncidents" fill="var(--color-openIncidents)" radius={[0, 6, 6, 0]} />
                                <Bar dataKey="overdueIncidents" fill="var(--color-overdueIncidents)" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Активные типы инцидентов</CardTitle>
                        <CardDescription>
                            Что именно сейчас создает нагрузку в каждом микрорайоне.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={incidentTypeConfig} className="h-[360px] w-full">
                            <BarChart data={chartRows} layout="vertical" margin={{ left: 18, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} />
                                <YAxis
                                    type="category"
                                    dataKey="districtName"
                                    tickLine={false}
                                    axisLine={false}
                                    width={150}
                                    tickFormatter={formatDistrictTick}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                {activeIncidentTypes.map((incidentType) => (
                                    <Bar
                                        key={incidentType.id}
                                        dataKey={incidentType.id}
                                        stackId="active-incidents"
                                        fill={`var(--color-${incidentType.id})`}
                                        radius={[0, 6, 6, 0]}
                                    />
                                ))}
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-primary/15 bg-primary/[0.04]">
                <CardContent className="grid gap-3 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="space-y-1">
                        <div className="text-sm font-medium">Управленческий вывод по выбранному периоду</div>
                        <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                            Основной тип нагрузки: {totals.topIncidentType?.value ? totals.topIncidentType.label.toLowerCase() : "активных инцидентов нет"}.
                            Самый проблемный микрорайон по просрочкам: {totals.worstDistrict?.districtName ?? "нет данных"}.
                            Средняя доступность камер по выбранным микрорайонам: {totals.avgOnline}%.
                        </p>
                    </div>
                    <Badge variant="outline" className="w-fit bg-background">
                        Перекрестков: {totals.intersections}
                    </Badge>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Микрорайоны: операционная таблица</CardTitle>
                    <CardDescription>
                        Табличный дубль графиков для быстрого разбора ответственных зон.
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Микрорайон</TableHead>
                                <TableHead className="text-right">Км дорог</TableHead>
                                <TableHead className="text-right">Камеры</TableHead>
                                <TableHead className="text-right">Онлайн</TableHead>
                                <TableHead className="text-right">Открыто</TableHead>
                                <TableHead className="text-right">Просрочено</TableHead>
                                <TableHead>Основной тип</TableHead>
                                <TableHead className="text-right">Реакция</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRows.map((row) => (
                                <TableRow key={row.districtName}>
                                    <TableCell className="font-medium">{row.districtName}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.servicedKm}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.cameras}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.onlinePct}%</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.openIncidents}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.overdueIncidents}</TableCell>
                                    <TableCell>{getDominantIncidentLabel(row)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.avgReactionHours} ч</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
