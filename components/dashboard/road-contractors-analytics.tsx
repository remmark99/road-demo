"use client"

import { useMemo, useState } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    XAxis,
    YAxis,
} from "recharts"
import { Clock, ListFilter, TimerReset, Users } from "lucide-react"
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
    ROAD_CONTRACTORS,
    ROAD_INCIDENT_TYPES,
    ROAD_SEASONS,
    filterRoadRowsBySeason,
    getRoadIncidentTypesForSeason,
    getRoadSeasonLabel,
    roadMonthlyContractorRows,
    type RoadContractorId,
    type RoadIncidentType,
    type RoadSeasonFilter,
} from "@/lib/mock/road-analytics-mock-data"

const contractorConfig = ROAD_CONTRACTORS.reduce((acc, contractor) => {
    acc[contractor.id] = { label: contractor.shortName, color: contractor.color }
    return acc
}, {} as ChartConfig)

type MetricKey = "overdueCount" | "avgResolutionHours" | "avgReactionHours" | "slaPct"
type MetricMode = "sum" | "avg"
type MonthChartRow = {
    monthLabel: string
    monthIndex: number
} & Partial<Record<RoadContractorId, number>>

function buildMetricRows(
    metric: MetricKey,
    mode: MetricMode,
    rows: typeof roadMonthlyContractorRows
): MonthChartRow[] {
    const grouped = new Map<
        number,
        {
            monthLabel: string
            monthIndex: number
            sums: Partial<Record<RoadContractorId, number>>
            counts: Partial<Record<RoadContractorId, number>>
        }
    >()

    for (const row of rows) {
        if (!grouped.has(row.monthIndex)) {
            grouped.set(row.monthIndex, {
                monthLabel: row.monthLabel,
                monthIndex: row.monthIndex,
                sums: {},
                counts: {},
            })
        }

        const entry = grouped.get(row.monthIndex)!
        entry.sums[row.contractorId] = (entry.sums[row.contractorId] ?? 0) + row[metric]
        entry.counts[row.contractorId] = (entry.counts[row.contractorId] ?? 0) + 1
    }

    return Array.from(grouped.values())
        .map((row) => {
            const result: MonthChartRow = {
                monthLabel: row.monthLabel,
                monthIndex: row.monthIndex,
            }

            for (const contractor of ROAD_CONTRACTORS) {
                const sum = row.sums[contractor.id] ?? 0
                const count = row.counts[contractor.id] ?? 0
                result[contractor.id] = mode === "avg"
                    ? Number((sum / Math.max(1, count)).toFixed(metric === "slaPct" ? 0 : 1))
                    : sum
            }

            return result
        })
        .sort((left, right) => left.monthIndex - right.monthIndex)
}

function getSelectedContractorsLabel(selectedContractors: RoadContractorId[]) {
    if (selectedContractors.length === ROAD_CONTRACTORS.length) return "Все подрядчики"
    if (selectedContractors.length === 0) return "Не выбрано"
    if (selectedContractors.length === 1) {
        return ROAD_CONTRACTORS.find((contractor) => contractor.id === selectedContractors[0])?.shortName ?? "1 подрядчик"
    }
    return `${selectedContractors.length} из ${ROAD_CONTRACTORS.length}`
}

export function RoadContractorsAnalytics() {
    const [season, setSeason] = useState<RoadSeasonFilter>("all")
    const [selectedContractors, setSelectedContractors] = useState<RoadContractorId[]>(
        ROAD_CONTRACTORS.map((contractor) => contractor.id)
    )
    const availableIncidentTypes = useMemo(() => getRoadIncidentTypesForSeason(season), [season])
    const [selectedTypes, setSelectedTypes] = useState<RoadIncidentType[]>(
        ROAD_INCIDENT_TYPES.map((type) => type.id)
    )

    const availableTypeIds = useMemo(() => availableIncidentTypes.map((type) => type.id), [availableIncidentTypes])
    const activeSelectedTypes = useMemo(
        () => selectedTypes.filter((type) => availableTypeIds.includes(type)),
        [availableTypeIds, selectedTypes]
    )

    const toggleType = (type: RoadIncidentType) => {
        setSelectedTypes((current) =>
            current.includes(type)
                ? current.filter((item) => item !== type)
                : [...current, type]
        )
    }

    const toggleAllTypes = () => {
        setSelectedTypes((current) =>
            availableTypeIds.every((type) => current.includes(type))
                ? current.filter((type) => !availableTypeIds.includes(type))
                : Array.from(new Set([...current, ...availableTypeIds]))
        )
    }

    const toggleContractor = (contractorId: RoadContractorId) => {
        setSelectedContractors((current) =>
            current.includes(contractorId)
                ? current.filter((item) => item !== contractorId)
                : [...current, contractorId]
        )
    }

    const toggleAllContractors = () => {
        setSelectedContractors((current) =>
            current.length === ROAD_CONTRACTORS.length
                ? []
                : ROAD_CONTRACTORS.map((contractor) => contractor.id)
        )
    }

    const visibleContractors = useMemo(() => {
        return ROAD_CONTRACTORS.filter((contractor) => selectedContractors.includes(contractor.id))
    }, [selectedContractors])

    const filteredRows = useMemo(() => {
        return filterRoadRowsBySeason(roadMonthlyContractorRows, season)
            .filter((row) => selectedContractors.includes(row.contractorId))
            .filter((row) => activeSelectedTypes.includes(row.incidentType))
    }, [activeSelectedTypes, season, selectedContractors])

    const overdueRows = useMemo(() => buildMetricRows("overdueCount", "sum", filteredRows), [filteredRows])
    const resolutionRows = useMemo(() => buildMetricRows("avgResolutionHours", "avg", filteredRows), [filteredRows])
    const reactionRows = useMemo(() => buildMetricRows("avgReactionHours", "avg", filteredRows), [filteredRows])
    const slaRows = useMemo(() => buildMetricRows("slaPct", "avg", filteredRows), [filteredRows])

    const totals = useMemo(() => {
        const overdue = filteredRows.reduce((sum, row) => sum + row.overdueCount, 0)
        const avgResolution =
            filteredRows.length === 0
                ? 0
                : Math.round(filteredRows.reduce((sum, row) => sum + row.avgResolutionHours, 0) / filteredRows.length)
        const avgReaction =
            filteredRows.length === 0
                ? 0
                : Number((filteredRows.reduce((sum, row) => sum + row.avgReactionHours, 0) / filteredRows.length).toFixed(1))
        const avgSla =
            filteredRows.length === 0
                ? 0
                : Math.round(filteredRows.reduce((sum, row) => sum + row.slaPct, 0) / filteredRows.length)

        return {
            overdue,
            avgResolution,
            avgReaction,
            avgSla,
        }
    }, [filteredRows])

    const selectedTypesLabel =
        activeSelectedTypes.length === availableIncidentTypes.length
            ? "Все типы"
            : activeSelectedTypes.length === 0
                ? "Не выбрано"
                : `${activeSelectedTypes.length} из ${availableIncidentTypes.length}`
    const selectedContractorsLabel = getSelectedContractorsLabel(selectedContractors)

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <ListFilter className="h-4 w-4 text-muted-foreground" />
                <Select value={season} onValueChange={(value) => setSeason(value as RoadSeasonFilter)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Сезон" />
                    </SelectTrigger>
                    <SelectContent>
                        {ROAD_SEASONS.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Users className="h-4 w-4" />
                            {selectedContractorsLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="road-all-contractors"
                                    checked={selectedContractors.length === ROAD_CONTRACTORS.length}
                                    onCheckedChange={toggleAllContractors}
                                />
                                <Label htmlFor="road-all-contractors" className="font-medium">
                                    Все подрядчики
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {ROAD_CONTRACTORS.map((contractor) => (
                                    <div key={contractor.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`road-contractor-${contractor.id}`}
                                            checked={selectedContractors.includes(contractor.id)}
                                            onCheckedChange={() => toggleContractor(contractor.id)}
                                        />
                                        <Label htmlFor={`road-contractor-${contractor.id}`} className="text-sm">
                                            {contractor.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <ListFilter className="h-4 w-4" />
                            {selectedTypesLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="road-all-incident-types"
                                    checked={activeSelectedTypes.length === availableIncidentTypes.length}
                                    onCheckedChange={toggleAllTypes}
                                />
                                <Label htmlFor="road-all-incident-types" className="font-medium">
                                    Все типы инцидентов
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {availableIncidentTypes.map((type) => (
                                    <div key={type.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`road-incident-${type.id}`}
                                            checked={selectedTypes.includes(type.id)}
                                            onCheckedChange={() => toggleType(type.id)}
                                        />
                                        <Label htmlFor={`road-incident-${type.id}`} className="text-sm">
                                            {type.label}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="text-sm text-muted-foreground">Просрочки</div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.overdue}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="text-sm text-muted-foreground">Устранение</div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.avgResolution} ч</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="text-sm text-muted-foreground">Реакция</div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.avgReaction} ч</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="text-sm text-muted-foreground">SLA в срок</div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.avgSla}%</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Количество просрочек</CardTitle>
                        <CardDescription>
                            Месячная динамика по выбранным подрядчикам и типам инцидентов.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={contractorConfig} className="h-[300px] w-full">
                            <BarChart data={overdueRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                {visibleContractors.map((contractor) => (
                                    <Bar
                                        key={contractor.id}
                                        dataKey={contractor.id}
                                        stackId="overdue"
                                        fill={`var(--color-${contractor.id})`}
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={42}
                                    />
                                ))}
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Среднее время устранения</CardTitle>
                        <CardDescription>
                            Часы от подтверждения до закрытия инцидента.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={contractorConfig} className="h-[300px] w-full">
                            <LineChart data={resolutionRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${value} ч`} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                {visibleContractors.map((contractor) => (
                                    <Line
                                        key={contractor.id}
                                        type="monotone"
                                        dataKey={contractor.id}
                                        stroke={`var(--color-${contractor.id})`}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                ))}
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            Среднее время реакции
                        </CardTitle>
                        <CardDescription>
                            Часы от фиксации события до назначения подрядчика.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={contractorConfig} className="h-[300px] w-full">
                            <LineChart data={reactionRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tickFormatter={(value) => `${value} ч`} />
                                <ReferenceLine y={12} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                {visibleContractors.map((contractor) => (
                                    <Line
                                        key={contractor.id}
                                        type="monotone"
                                        dataKey={contractor.id}
                                        stroke={`var(--color-${contractor.id})`}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                    />
                                ))}
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TimerReset className="h-5 w-5 text-emerald-500" />
                            Выполнение SLA
                        </CardTitle>
                        <CardDescription>
                            Доля инцидентов, закрытых без нарушения регламента.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={contractorConfig} className="h-[300px] w-full">
                            <LineChart data={slaRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                {visibleContractors.map((contractor) => (
                                    <Line
                                        key={contractor.id}
                                        type="monotone"
                                        dataKey={contractor.id}
                                        stroke={`var(--color-${contractor.id})`}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                    />
                                ))}
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-primary/15 bg-primary/[0.04]">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <div className="text-sm text-muted-foreground">
                        Активный разрез: {selectedContractorsLabel.toLowerCase()}, {getRoadSeasonLabel(season).toLowerCase()}.
                    </div>
                    <Badge variant="outline" className="bg-background">
                        {selectedTypesLabel}
                    </Badge>
                </CardContent>
            </Card>
        </div>
    )
}
