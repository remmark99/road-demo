"use client"

import { useMemo, useState } from "react"
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
} from "recharts"
import { AlertTriangle, CheckCircle2, Gauge, Hammer, MapPinned, Users, Wrench } from "lucide-react"
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
    TimeRangeFilter,
    filterByTimeRangeResult,
    type TimeRangeResult,
} from "@/components/dashboard/time-range-filter"
import {
    ROAD_CONTRACTORS,
    getRoadContractorName,
    roadRepairDailyRows,
    roadRepairProjects,
    type RoadContractorId,
} from "@/lib/mock/road-analytics-mock-data"
import { cn } from "@/lib/utils"

const progressConfig = {
    plannedKm: { label: "План, км", color: "hsl(210, 89%, 54%)" },
    completedKm: { label: "Выполнено, км", color: "hsl(160, 72%, 38%)" },
} satisfies ChartConfig

const qualityConfig = {
    defectsClosed: { label: "Закрыто дефектов", color: "hsl(35, 92%, 52%)" },
    qualityScore: { label: "Индекс качества", color: "hsl(262, 83%, 58%)" },
} satisfies ChartConfig

const stageConfig = {
    count: { label: "Объекты", color: "hsl(190, 91%, 41%)" },
} satisfies ChartConfig

const riskTone: Record<string, string> = {
    Низкий: "border-emerald-500/20 bg-emerald-500/[0.10] text-emerald-700 dark:text-emerald-300",
    Средний: "border-amber-500/20 bg-amber-500/[0.10] text-amber-700 dark:text-amber-300",
    Высокий: "border-red-500/20 bg-red-500/[0.10] text-red-700 dark:text-red-300",
}

const REPAIR_CONTRACTORS = ROAD_CONTRACTORS.slice(0, 5)

function getSelectedContractorsLabel(selectedContractors: RoadContractorId[]) {
    if (selectedContractors.length === REPAIR_CONTRACTORS.length) return "Все подрядчики"
    if (selectedContractors.length === 0) return "Не выбрано"
    if (selectedContractors.length === 1) {
        return REPAIR_CONTRACTORS.find((contractor) => contractor.id === selectedContractors[0])?.shortName ?? "1 подрядчик"
    }
    return `${selectedContractors.length} из ${REPAIR_CONTRACTORS.length}`
}

export function RoadRepairAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "month" })
    const [selectedContractors, setSelectedContractors] = useState<RoadContractorId[]>(
        REPAIR_CONTRACTORS.map((contractor) => contractor.id)
    )

    const filteredDaily = useMemo(() => {
        const contractorRows = roadRepairDailyRows.filter((row) => selectedContractors.includes(row.contractorId))

        return filterByTimeRangeResult(contractorRows, timeRange)
    }, [selectedContractors, timeRange])

    const dailyTrend = useMemo(() => {
        const grouped = new Map<
            string,
            {
                date: string
                dateLabel: string
                plannedKm: number
                completedKm: number
                defectsClosed: number
                qualityScore: number
                rows: number
            }
        >()

        for (const row of filteredDaily) {
            if (!grouped.has(row.date)) {
                grouped.set(row.date, {
                    date: row.date,
                    dateLabel: new Date(`${row.date}T00:00:00`).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                    }),
                    plannedKm: 0,
                    completedKm: 0,
                    defectsClosed: 0,
                    qualityScore: 0,
                    rows: 0,
                })
            }

            const entry = grouped.get(row.date)!
            entry.plannedKm += row.plannedKm
            entry.completedKm += row.completedKm
            entry.defectsClosed += row.defectsClosed
            entry.qualityScore += row.qualityScore
            entry.rows += 1
        }

        return Array.from(grouped.values())
            .map((row) => ({
                ...row,
                plannedKm: Number(row.plannedKm.toFixed(1)),
                completedKm: Number(row.completedKm.toFixed(1)),
                qualityScore: row.rows === 0 ? 0 : Math.round(row.qualityScore / row.rows),
            }))
            .sort((left, right) => left.date.localeCompare(right.date))
    }, [filteredDaily])

    const visibleProjects = useMemo(() => {
        return roadRepairProjects.filter((project) => selectedContractors.includes(project.contractorId)).sort((left, right) => {
            const riskWeight = { Высокий: 3, Средний: 2, Низкий: 1 }
            return riskWeight[right.riskLevel] - riskWeight[left.riskLevel] || right.openDefects - left.openDefects
        })
    }, [selectedContractors])

    const stageRows = useMemo(() => {
        const grouped = new Map<string, number>()

        for (const project of visibleProjects) {
            grouped.set(project.stage, (grouped.get(project.stage) ?? 0) + 1)
        }

        return Array.from(grouped.entries()).map(([stage, count]) => ({ stage, count }))
    }, [visibleProjects])

    const totals = useMemo(() => {
        const totalPlanned = filteredDaily.reduce((sum, row) => sum + row.plannedKm, 0)
        const totalCompleted = filteredDaily.reduce((sum, row) => sum + row.completedKm, 0)
        const totalDefectsClosed = filteredDaily.reduce((sum, row) => sum + row.defectsClosed, 0)
        const avgQuality =
            filteredDaily.length === 0
                ? 0
                : Math.round(filteredDaily.reduce((sum, row) => sum + row.qualityScore, 0) / filteredDaily.length)
        const highRiskProjects = visibleProjects.filter((project) => project.riskLevel === "Высокий").length
        const rawPlanFactPct = totalPlanned === 0 ? 0 : Math.round((totalCompleted / totalPlanned) * 100)

        return {
            activeProjects: visibleProjects.length,
            totalCompletedKm: Number(totalCompleted.toFixed(1)),
            totalPlannedKm: Number(totalPlanned.toFixed(1)),
            planFactPct: Math.min(100, rawPlanFactPct),
            planDeltaKm: Number((totalCompleted - totalPlanned).toFixed(1)),
            totalDefectsClosed,
            avgQuality,
            highRiskProjects,
        }
    }, [filteredDaily, visibleProjects])

    const toggleContractor = (contractorId: RoadContractorId) => {
        setSelectedContractors((current) =>
            current.includes(contractorId)
                ? current.filter((item) => item !== contractorId)
                : [...current, contractorId]
        )
    }

    const toggleAllContractors = () => {
        setSelectedContractors((current) =>
            current.length === REPAIR_CONTRACTORS.length
                ? []
                : REPAIR_CONTRACTORS.map((contractor) => contractor.id)
        )
    }

    const selectedContractorsLabel = getSelectedContractorsLabel(selectedContractors)
    const scheduleStatus = totals.planFactPct >= 97
        ? "Работы идут в графике: выполненный объем закрывает план периода, а перевыполнение не раздувает KPI выше 100%."
        : totals.planFactPct >= 88
            ? "Темп близок к плановому: нужен ежедневный контроль смен и поставки материалов по объектам со средним риском."
            : "Темп ниже комфортного уровня: требуется усиление смен и пересборка недельного графика по критичным объектам."
    const qualityStatus = totals.avgQuality >= 90
        ? "Качество приемки устойчивое, дефекты закрываются без заметного снижения индекса."
        : "Индекс качества требует внимания: закрытие дефектов нужно синхронизировать с повторной приемкой покрытия."
    const riskStatus = totals.highRiskProjects === 0
        ? "Высокорисковых объектов в выбранном разрезе нет; можно удерживать плановый контроль."
        : `Высокорисковых объектов: ${totals.highRiskProjects}. Их стоит разобрать первыми на штабе и назначить ответственных за следующий шаг.`

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
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
                                    id="repair-all-contractors"
                                    checked={selectedContractors.length === REPAIR_CONTRACTORS.length}
                                    onCheckedChange={toggleAllContractors}
                                />
                                <Label htmlFor="repair-all-contractors" className="font-medium">
                                    Все подрядчики
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {REPAIR_CONTRACTORS.map((contractor) => (
                                    <div key={contractor.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`repair-contractor-${contractor.id}`}
                                            checked={selectedContractors.includes(contractor.id)}
                                            onCheckedChange={() => toggleContractor(contractor.id)}
                                        />
                                        <Label htmlFor={`repair-contractor-${contractor.id}`} className="text-sm">
                                            {contractor.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </TimeRangeFilter>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <Hammer className="h-4 w-4 text-primary" />
                            Объекты
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.activeProjects}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            План/факт
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.planFactPct}%</div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {totals.totalCompletedKm} из {totals.totalPlannedKm} км
                            {totals.planDeltaKm > 0 ? `, опережение ${totals.planDeltaKm} км` : ""}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <Gauge className="h-4 w-4 text-violet-500" />
                            Качество
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.avgQuality}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <Wrench className="h-4 w-4 text-amber-500" />
                            Дефекты
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.totalDefectsClosed}</div>
                    </CardContent>
                </Card>

                <Card className="border-red-500/20 bg-red-500/[0.05]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-4 w-4" />
                            Высокий риск
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.highRiskProjects}</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-primary/15 bg-primary/[0.04]">
                <CardHeader>
                    <CardTitle>Что важно руководителю</CardTitle>
                    <CardDescription>
                        Управленческий вывод по выбранным подрядчикам и периоду без технической детализации.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border bg-background/80 p-4">
                        <div className="text-sm font-semibold">Темп работ</div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{scheduleStatus}</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-4">
                        <div className="text-sm font-semibold">Качество приемки</div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{qualityStatus}</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-4">
                        <div className="text-sm font-semibold">Риск штаба</div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{riskStatus}</p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>План и факт ремонта</CardTitle>
                        <CardDescription>
                            Суточный объем работ: {selectedContractorsLabel.toLowerCase()}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={progressConfig} className="h-[300px] w-full">
                            <AreaChart data={dailyTrend} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={18} />
                                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${value} км`} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Area
                                    type="monotone"
                                    dataKey="plannedKm"
                                    stroke="var(--color-plannedKm)"
                                    fill="var(--color-plannedKm)"
                                    fillOpacity={0.14}
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="completedKm"
                                    stroke="var(--color-completedKm)"
                                    fill="var(--color-completedKm)"
                                    fillOpacity={0.24}
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Качество и закрытие дефектов</CardTitle>
                        <CardDescription>
                            Дефекты закрываются без потери индекса качества приемки.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={qualityConfig} className="h-[300px] w-full">
                            <ComposedChart data={dailyTrend} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={18} />
                                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar yAxisId="left" dataKey="defectsClosed" fill="var(--color-defectsClosed)" radius={[6, 6, 0, 0]} />
                                <Line yAxisId="right" type="monotone" dataKey="qualityScore" stroke="var(--color-qualityScore)" strokeWidth={2} dot={{ r: 3 }} />
                            </ComposedChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-5">
                <Card className="xl:col-span-2">
                    <CardHeader>
                        <CardTitle>Стадии ремонтных объектов</CardTitle>
                        <CardDescription>
                            Где находится основной объем работ и что требует контроля.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={stageConfig} className="h-[320px] w-full">
                            <BarChart data={stageRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="stage" tickLine={false} axisLine={false} minTickGap={12} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-3">
                    <CardHeader>
                        <CardTitle>Контроль объектов ремонта</CardTitle>
                        <CardDescription>
                            Приоритеты выстроены по уровню риска и количеству открытых замечаний.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        {visibleProjects.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                Выберите хотя бы одного подрядчика, чтобы увидеть объекты ремонта и связанные риски.
                            </div>
                        ) : visibleProjects.map((project) => (
                            <div key={`${project.street}-${project.contractorId}`} className="rounded-lg border bg-muted/20 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium">{project.street}</div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <MapPinned className="h-3.5 w-3.5" />
                                                {project.district}
                                            </span>
                                            <span>{getRoadContractorName(project.contractorId)}</span>
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn("border px-2.5 py-1", riskTone[project.riskLevel])}
                                    >
                                        {project.riskLevel}
                                    </Badge>
                                </div>

                                <div className="mt-4">
                                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{project.stage}</span>
                                        <span>{project.completionPct}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-emerald-500 transition-all"
                                            style={{ width: `${Math.min(100, project.completionPct)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                                    <div>
                                        Открытых дефектов: <span className="font-medium text-foreground">{project.openDefects}</span>
                                    </div>
                                    <div>
                                        Плановая дата: <span className="font-medium text-foreground">{project.plannedFinish}</span>
                                    </div>
                                    <div>
                                        Следующий шаг: <span className="text-foreground">{project.nextAction}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
