"use client"

import { useMemo, useState } from "react"
import {
    CartesianGrid,
    Cell,
    ReferenceLine,
    Scatter,
    ScatterChart,
    XAxis,
    YAxis,
    ZAxis,
} from "recharts"
import { Gauge, Grid3X3, Route, TimerReset, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
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
    TimeRangeFilter,
    filterByTimeRangeResult,
    type TimeRangeResult,
} from "@/components/dashboard/time-range-filter"
import {
    ROAD_CONTRACTORS,
    ROAD_SEASONS,
    filterRoadRowsBySeason,
    getRoadSeasonLabel,
    roadDailyContractorRows,
    type RoadContractorId,
    type RoadSeasonFilter,
} from "@/lib/mock/road-analytics-mock-data"

const matrixConfig = {
    efficiencyPct: { label: "Эффективность исполнения", color: "hsl(160, 72%, 38%)" },
} satisfies ChartConfig

type MatrixRow = {
    contractorId: RoadContractorId
    contractorName: string
    shortName: string
    managedKm: number
    efficiencyPct: number
    overdueIncidents: number
    completedOrders: number
    reactionHours: number
    color: string
}

function MatrixTooltip({
    active,
    payload,
}: {
    active?: boolean
    payload?: Array<{ payload?: MatrixRow }>
}) {
    const row = payload?.[0]?.payload

    if (!active || !row) return null

    return (
        <div className="min-w-56 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
            <div className="font-semibold">{row.contractorName}</div>
            <div className="mt-2 grid gap-1 text-muted-foreground">
                <div className="flex justify-between gap-4">
                    <span>Дороги под управлением</span>
                    <span className="font-mono text-foreground">{row.managedKm} км</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Эффективность</span>
                    <span className="font-mono text-foreground">{row.efficiencyPct}%</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Просрочки</span>
                    <span className="font-mono text-foreground">{row.overdueIncidents}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Средняя реакция</span>
                    <span className="font-mono text-foreground">{row.reactionHours} ч</span>
                </div>
            </div>
        </div>
    )
}

function getSelectedContractorsLabel(selectedContractors: RoadContractorId[]) {
    if (selectedContractors.length === ROAD_CONTRACTORS.length) return "Все подрядчики"
    if (selectedContractors.length === 0) return "Не выбрано"
    if (selectedContractors.length === 1) {
        return ROAD_CONTRACTORS.find((contractor) => contractor.id === selectedContractors[0])?.shortName ?? "1 подрядчик"
    }
    return `${selectedContractors.length} из ${ROAD_CONTRACTORS.length}`
}

export function RoadEfficiencyMatrixAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "month" })
    const [season, setSeason] = useState<RoadSeasonFilter>("all")
    const [selectedContractors, setSelectedContractors] = useState<RoadContractorId[]>(
        ROAD_CONTRACTORS.map((contractor) => contractor.id)
    )

    const matrixRows = useMemo<MatrixRow[]>(() => {
        const filteredRows = filterRoadRowsBySeason(
            filterByTimeRangeResult(roadDailyContractorRows, timeRange),
            season
        )
        const grouped = new Map<
            RoadContractorId,
            {
                contractorId: RoadContractorId
                efficiencyPct: number
                overdueIncidents: number
                completedOrders: number
                reactionHours: number
                rows: number
            }
        >()

        for (const row of filteredRows) {
            if (!grouped.has(row.contractorId)) {
                grouped.set(row.contractorId, {
                    contractorId: row.contractorId,
                    efficiencyPct: 0,
                    overdueIncidents: 0,
                    completedOrders: 0,
                    reactionHours: 0,
                    rows: 0,
                })
            }

            const entry = grouped.get(row.contractorId)!
            entry.efficiencyPct += row.efficiencyPct
            entry.overdueIncidents += row.overdueIncidents
            entry.completedOrders += row.completedOrders
            entry.reactionHours += row.reactionHours
            entry.rows += 1
        }

        return ROAD_CONTRACTORS.filter((contractor) => selectedContractors.includes(contractor.id)).map((contractor) => {
            const entry = grouped.get(contractor.id)

            return {
                contractorId: contractor.id,
                contractorName: contractor.name,
                shortName: contractor.shortName,
                managedKm: contractor.managedKm,
                efficiencyPct: entry?.rows ? Math.round(entry.efficiencyPct / entry.rows) : contractor.baseEfficiencyPct,
                overdueIncidents: entry?.overdueIncidents ?? 0,
                completedOrders: entry?.completedOrders ?? 0,
                reactionHours: entry?.rows ? Number((entry.reactionHours / entry.rows).toFixed(1)) : 0,
                color: contractor.color,
            }
        }).sort((left, right) => right.managedKm - left.managedKm)
    }, [timeRange, season, selectedContractors])

    const totals = useMemo(() => {
        const avgEfficiency = Math.round(
            matrixRows.reduce((sum, row) => sum + row.efficiencyPct, 0) / Math.max(1, matrixRows.length)
        )
        const totalKm = matrixRows.reduce((sum, row) => sum + row.managedKm, 0)
        const totalOverdue = matrixRows.reduce((sum, row) => sum + row.overdueIncidents, 0)
        const fastest = matrixRows.slice().sort((left, right) => left.reactionHours - right.reactionHours)[0]

        return {
            avgEfficiency,
            totalKm,
            totalOverdue,
            fastest,
        }
    }, [matrixRows])

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

    const selectedContractorsLabel = getSelectedContractorsLabel(selectedContractors)

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
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
                                    id="matrix-all-contractors"
                                    checked={selectedContractors.length === ROAD_CONTRACTORS.length}
                                    onCheckedChange={toggleAllContractors}
                                />
                                <Label htmlFor="matrix-all-contractors" className="font-medium">
                                    Все подрядчики
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {ROAD_CONTRACTORS.map((contractor) => (
                                    <div key={contractor.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`matrix-contractor-${contractor.id}`}
                                            checked={selectedContractors.includes(contractor.id)}
                                            onCheckedChange={() => toggleContractor(contractor.id)}
                                        />
                                        <Label htmlFor={`matrix-contractor-${contractor.id}`} className="text-sm">
                                            {contractor.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </TimeRangeFilter>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Gauge className="h-4 w-4 text-primary" />
                            Средняя эффективность
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.avgEfficiency}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Route className="h-4 w-4 text-sky-500" />
                            Дорог под управлением
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.totalKm} км</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <TimerReset className="h-4 w-4 text-amber-500" />
                            Просрочек за период
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.totalOverdue}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Grid3X3 className="h-5 w-5 text-primary" />
                                Матрица эффективности подрядчиков
                            </CardTitle>
                            <CardDescription>
                                X - километры дорог под управлением, Y - эффективность исполнения. Фильтр скрывает подрядчиков из сравнения.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-background">
                            {getRoadSeasonLabel(season)} · {selectedContractorsLabel}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={matrixConfig} className="h-[480px] w-full">
                        <ScatterChart margin={{ top: 20, right: 24, bottom: 34, left: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                type="number"
                                dataKey="managedKm"
                                name="Км дорог под управлением"
                                tickLine={false}
                                axisLine={false}
                                domain={[15, 60]}
                                tickFormatter={(value) => `${value} км`}
                                label={{ value: "Км дорог под управлением", position: "insideBottom", offset: -16 }}
                            />
                            <YAxis
                                type="number"
                                dataKey="efficiencyPct"
                                name="Эффективность исполнения"
                                tickLine={false}
                                axisLine={false}
                                domain={[0, 100]}
                                ticks={[0, 25, 50, 75, 100]}
                                tickFormatter={(value) => `${value}%`}
                                label={{ value: "Эффективность исполнения, %", angle: -90, position: "insideLeft" }}
                            />
                            <ZAxis type="number" dataKey="overdueIncidents" range={[90, 520]} />
                            <ReferenceLine y={90} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                            <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<MatrixTooltip />} />
                            <Scatter name="Подрядчики" data={matrixRows}>
                                {matrixRows.map((row) => (
                                    <Cell key={row.contractorId} fill={row.color} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ChartContainer>

                    <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {matrixRows.map((row) => (
                            <div key={row.contractorId} className="rounded-lg border bg-muted/20 px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                                    <span className="text-sm font-medium">{row.shortName}</span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    {row.managedKm} км, {row.efficiencyPct}% исполнения
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {totals.fastest && (
                <Card className="border-emerald-500/20 bg-emerald-500/[0.06]">
                    <CardContent className="p-5 text-sm">
                        Лучшее среднее время реакции в выбранном периоде:{" "}
                        <span className="font-semibold">{totals.fastest.contractorName}</span>,{" "}
                        <span className="font-mono">{totals.fastest.reactionHours} ч</span>.
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
