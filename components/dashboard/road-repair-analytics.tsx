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
    TimeRangeFilter,
    filterByTimeRangeResult,
    type TimeRangeResult,
} from "@/components/dashboard/time-range-filter"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Building2, CheckCircle2, Hammer, MapPinned, Wrench } from "lucide-react"

type ContractorId = "sever" | "gors" | "yugra" | "surgut"

type RepairDailyRow = {
    date: string
    contractorId: ContractorId
    plannedKm: number
    completedKm: number
    defectsClosed: number
}

type RepairProject = {
    street: string
    district: string
    contractorId: ContractorId
    stage: string
    completionPct: number
    openDefects: number
    nextAction: string
}

type DistrictRepairStat = {
    district: string
    contractorId: ContractorId
    completedSites: number
    activeSites: number
    confirmedDefects: number
}

const CONTRACTORS: { id: ContractorId; name: string }[] = [
    { id: "sever", name: "СеверДорСтрой" },
    { id: "gors", name: "Горсервис" },
    { id: "yugra", name: "ЮграДор" },
    { id: "surgut", name: "СургутРемДор" },
]

const PROJECTS: RepairProject[] = [
    {
        street: "пр. Ленина",
        district: "Центральный",
        contractorId: "sever",
        stage: "Укладка покрытия",
        completionPct: 82,
        openDefects: 3,
        nextAction: "Ночной слой и контрольная приёмка",
    },
    {
        street: "ул. 30 лет Победы",
        district: "Северный",
        contractorId: "gors",
        stage: "Фрезеровка",
        completionPct: 58,
        openDefects: 5,
        nextAction: "Подготовка основания под следующий этап",
    },
    {
        street: "ул. Мелик-Карамова",
        district: "Восточный",
        contractorId: "yugra",
        stage: "Подготовка участка",
        completionPct: 41,
        openDefects: 6,
        nextAction: "Вывод бригады и ограждение контура",
    },
    {
        street: "Нефтеюганское шоссе",
        district: "Промышленный",
        contractorId: "surgut",
        stage: "Приёмка",
        completionPct: 93,
        openDefects: 2,
        nextAction: "Закрытие замечаний и сдача участка",
    },
    {
        street: "ул. Университетская",
        district: "Северный",
        contractorId: "sever",
        stage: "Локальный ремонт",
        completionPct: 74,
        openDefects: 4,
        nextAction: "Закрытие карт ямочного ремонта",
    },
]

const DISTRICT_STATS: DistrictRepairStat[] = [
    { district: "Центральный", contractorId: "sever", completedSites: 4, activeSites: 2, confirmedDefects: 11 },
    { district: "Северный", contractorId: "gors", completedSites: 3, activeSites: 2, confirmedDefects: 13 },
    { district: "Восточный", contractorId: "yugra", completedSites: 2, activeSites: 1, confirmedDefects: 9 },
    { district: "Промышленный", contractorId: "surgut", completedSites: 3, activeSites: 1, confirmedDefects: 7 },
    { district: "Северный", contractorId: "sever", completedSites: 2, activeSites: 1, confirmedDefects: 8 },
]

const progressConfig = {
    plannedKm: { label: "План, км", color: "hsl(214, 90%, 56%)" },
    completedKm: { label: "Выполнено, км", color: "hsl(142, 71%, 45%)" },
} satisfies ChartConfig

const defectsConfig = {
    defectsClosed: { label: "Закрыто дефектов", color: "hsl(171, 73%, 35%)" },
} satisfies ChartConfig

const districtConfig = {
    completedSites: { label: "Завершено объектов", color: "hsl(142, 71%, 45%)" },
    activeSites: { label: "Активные участки", color: "hsl(35, 92%, 58%)" },
} satisfies ChartConfig

function toLocalDateString(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function buildDailyRows(): RepairDailyRow[] {
    const rows: RepairDailyRow[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
        const currentDate = new Date(today)
        currentDate.setDate(today.getDate() - dayOffset)
        const date = toLocalDateString(currentDate)

        CONTRACTORS.forEach((contractor, contractorIndex) => {
            const planBase = 0.8 + ((dayOffset + contractorIndex * 2) % 5) * 0.18
            const plannedKm = Number((planBase + contractorIndex * 0.08).toFixed(1))
            const varianceIndex = (dayOffset + contractorIndex) % 6
            const completedKm = Number(
                Math.max(
                    0.5,
                    plannedKm - (varianceIndex === 0 ? 0.2 : varianceIndex === 1 ? 0.1 : -0.1)
                ).toFixed(1)
            )

            rows.push({
                date,
                contractorId: contractor.id,
                plannedKm,
                completedKm,
                defectsClosed: 4 + ((dayOffset + contractorIndex * 3) % 6),
            })
        })
    }

    return rows
}

function getContractorLabel(contractorId: ContractorId) {
    return CONTRACTORS.find((contractor) => contractor.id === contractorId)?.name ?? contractorId
}

export function RoadRepairAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "month" })
    const [selectedContractor, setSelectedContractor] = useState<"all" | ContractorId>("all")

    const dailySource = useMemo(() => buildDailyRows(), [])

    const filteredDaily = useMemo(() => {
        const scoped =
            selectedContractor === "all"
                ? dailySource
                : dailySource.filter((row) => row.contractorId === selectedContractor)

        return filterByTimeRangeResult(scoped, timeRange)
    }, [dailySource, selectedContractor, timeRange])

    const dailyTrend = useMemo(() => {
        const grouped = new Map<
            string,
            { date: string; dateLabel: string; plannedKm: number; completedKm: number; defectsClosed: number }
        >()

        for (const row of filteredDaily) {
            const dateLabel = new Date(`${row.date}T00:00:00`).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
            })

            if (!grouped.has(row.date)) {
                grouped.set(row.date, {
                    date: row.date,
                    dateLabel,
                    plannedKm: 0,
                    completedKm: 0,
                    defectsClosed: 0,
                })
            }

            const entry = grouped.get(row.date)!
            entry.plannedKm += row.plannedKm
            entry.completedKm += row.completedKm
            entry.defectsClosed += row.defectsClosed
        }

        return Array.from(grouped.values()).sort((left, right) => left.date.localeCompare(right.date))
    }, [filteredDaily])

    const districtSummary = useMemo(() => {
        const scoped =
            selectedContractor === "all"
                ? DISTRICT_STATS
                : DISTRICT_STATS.filter((row) => row.contractorId === selectedContractor)

        const grouped = new Map<
            string,
            { district: string; completedSites: number; activeSites: number; confirmedDefects: number }
        >()

        for (const row of scoped) {
            if (!grouped.has(row.district)) {
                grouped.set(row.district, {
                    district: row.district,
                    completedSites: 0,
                    activeSites: 0,
                    confirmedDefects: 0,
                })
            }

            const entry = grouped.get(row.district)!
            entry.completedSites += row.completedSites
            entry.activeSites += row.activeSites
            entry.confirmedDefects += row.confirmedDefects
        }

        return Array.from(grouped.values()).sort((left, right) => right.completedSites - left.completedSites)
    }, [selectedContractor])

    const visibleProjects = useMemo(() => {
        return (selectedContractor === "all"
            ? PROJECTS
            : PROJECTS.filter((project) => project.contractorId === selectedContractor)
        ).sort((left, right) => right.completionPct - left.completionPct)
    }, [selectedContractor])

    const totals = useMemo(() => {
        const totalPlanned = filteredDaily.reduce((sum, row) => sum + row.plannedKm, 0)
        const totalCompleted = filteredDaily.reduce((sum, row) => sum + row.completedKm, 0)
        const totalDefectsClosed = filteredDaily.reduce((sum, row) => sum + row.defectsClosed, 0)
        const onScheduleRows = filteredDaily.filter((row) => row.completedKm >= row.plannedKm * 0.9).length

        return {
            activeProjects: visibleProjects.length,
            totalCompletedKm: Number(totalCompleted.toFixed(1)),
            onSchedulePct: filteredDaily.length === 0 ? 0 : Math.round((onScheduleRows / filteredDaily.length) * 100),
            totalDefectsClosed,
            totalPlannedKm: Number(totalPlanned.toFixed(1)),
        }
    }, [filteredDaily, visibleProjects])

    const selectedContractorLabel =
        selectedContractor === "all" ? "Все подрядчики" : getContractorLabel(selectedContractor)

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
                <Select
                    value={selectedContractor}
                    onValueChange={(value) => setSelectedContractor(value as "all" | ContractorId)}
                >
                    <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Подрядчик" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Все подрядчики</SelectItem>
                        {CONTRACTORS.map((contractor) => (
                            <SelectItem key={contractor.id} value={contractor.id}>
                                {contractor.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TimeRangeFilter>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <Hammer className="h-4 w-4 text-primary" />
                            Участки в ремонте
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.activeProjects}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Активные объекты по контуру «Состояние дорог» для выбранного подрядчика.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            Выполнено за период
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.totalCompletedKm} км</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            План периода: {totals.totalPlannedKm} км. Темп по работам остаётся ровным без провалов по сменам.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <Building2 className="h-4 w-4 text-sky-500" />
                            Работы в графике
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.onSchedulePct}%</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Большинство смен укладывается в план, но часть объектов всё ещё требует плотного контроля.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <Wrench className="h-4 w-4 text-amber-500" />
                            Закрытые дефекты
                        </div>
                        <div className="mt-3 text-3xl font-semibold tabular-nums">{totals.totalDefectsClosed}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Подтверждённые замечания по покрытию, закрытые в рамках текущего ремонтного контура.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>План и выполнение ремонта</CardTitle>
                        <CardDescription>
                            Суточный объём работ по подрядчику: {selectedContractorLabel.toLowerCase()}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={progressConfig} className="h-[300px] w-full">
                            <AreaChart data={dailyTrend} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={18} />
                                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${value} км`} />
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            formatter={(value, name) => [`${value} км`, progressConfig[name as keyof typeof progressConfig]?.label ?? name]}
                                        />
                                    }
                                />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Area
                                    type="monotone"
                                    dataKey="plannedKm"
                                    stroke="var(--color-plannedKm)"
                                    fill="var(--color-plannedKm)"
                                    fillOpacity={0.16}
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="completedKm"
                                    stroke="var(--color-completedKm)"
                                    fill="var(--color-completedKm)"
                                    fillOpacity={0.28}
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Закрытие дефектов покрытия</CardTitle>
                        <CardDescription>
                            Суточная динамика по устранённым замечаниям без провала в качество дорожного контура.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={defectsConfig} className="h-[300px] w-full">
                            <BarChart data={dailyTrend} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={18} />
                                <YAxis tickLine={false} axisLine={false} />
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            formatter={(value) => [`${value}`, "Закрыто дефектов"]}
                                        />
                                    }
                                />
                                <Bar
                                    dataKey="defectsClosed"
                                    fill="var(--color-defectsClosed)"
                                    radius={[6, 6, 0, 0]}
                                />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-5">
                <Card className="xl:col-span-3">
                    <CardHeader>
                        <CardTitle>Районы по ремонтной нагрузке</CardTitle>
                        <CardDescription>
                            Завершённые и активные объекты по районам. Ремонт вынесен в общий дорожный контур, без отдельного рейтинга.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={districtConfig} className="h-[320px] w-full">
                            <BarChart data={districtSummary} layout="vertical" margin={{ left: 24, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} />
                                <YAxis
                                    type="category"
                                    dataKey="district"
                                    tickLine={false}
                                    axisLine={false}
                                    width={120}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="completedSites" fill="var(--color-completedSites)" radius={[0, 6, 6, 0]} />
                                <Bar dataKey="activeSites" fill="var(--color-activeSites)" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                    <CardHeader>
                        <CardTitle>Текущие дорожные объекты</CardTitle>
                        <CardDescription>
                            Рабочий список по модулю «Состояние дорог» с ближайшим действием по каждому участку.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {visibleProjects.map((project) => (
                            <div key={`${project.street}-${project.contractorId}`} className="rounded-xl border bg-muted/20 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium">{project.street}</div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <MapPinned className="h-3.5 w-3.5" />
                                                {project.district}
                                            </span>
                                            <span>•</span>
                                            <span>{getContractorLabel(project.contractorId)}</span>
                                        </div>
                                    </div>
                                    <Badge variant="outline">{project.stage}</Badge>
                                </div>

                                <div className="mt-4">
                                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Готовность участка</span>
                                        <span>{project.completionPct}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-emerald-500 transition-all"
                                            style={{ width: `${project.completionPct}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-3 text-sm text-muted-foreground">
                                    Открытых дефектов: <span className="font-medium text-foreground">{project.openDefects}</span>
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    Следующий шаг: <span className="text-foreground">{project.nextAction}</span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
