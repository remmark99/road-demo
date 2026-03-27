"use client"

import { useMemo, useState } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
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
import { TimeRangeFilter, filterByTimeRangeResult, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Activity,
    AlertCircle,
    Clock,
    Flame,
    MapPin,
    MoveRight,
    PackageSearch,
    PersonStanding,
    ShieldAlert,
    ShieldCheck,
    Siren,
    Swords,
    TriangleAlert,
    Users2,
    type LucideIcon,
} from "lucide-react"
import {
    PARKS,
    PARK_SECURITY_LABELS,
    filterByLocations,
    getParkNameById,
    getParkSecurityDailyRisk,
    getParkSecurityIssueMix,
    getParkSecurityOverview,
    getParkSecurityPriorityParks,
    getParkSecurityZoneHotspots,
    parkSecurityDailyData,
    parkSecurityIncidentsData,
    type ParkId,
    type ParkOperationalTone,
    type ParkSecurityParkPriority,
    type ParkSecurityType,
} from "@/lib/mock/park-mock-data"
import { cn } from "@/lib/utils"

const riskTrendConfig = {
    riskScore: { label: "Индекс безопасности", color: "hsl(201, 92%, 47%)" },
    incidentCount: { label: "Все инциденты", color: "hsl(32, 95%, 53%)" },
    criticalCount: { label: "Критические", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const issueMixConfig = {
    totalCount: { label: "Все события", color: "hsl(201, 92%, 47%)" },
    unresolvedCount: { label: "Не закрыты", color: "hsl(35, 92%, 58%)" },
    criticalCount: { label: "Критические", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const TONE_META: Record<
    ParkOperationalTone,
    {
        label: string
        barClassName: string
        badgeClassName: string
        panelClassName: string
        textClassName: string
    }
> = {
    healthy: {
        label: "Стабильно",
        barClassName: "bg-emerald-500",
        badgeClassName: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        panelClassName: "border-emerald-500/20 bg-emerald-500/[0.07]",
        textClassName: "text-emerald-600 dark:text-emerald-400",
    },
    attention: {
        label: "Под давлением",
        barClassName: "bg-amber-500",
        badgeClassName: "border-amber-500/20 bg-amber-500/12 text-amber-700 dark:text-amber-300",
        panelClassName: "border-amber-500/20 bg-amber-500/[0.07]",
        textClassName: "text-amber-600 dark:text-amber-400",
    },
    critical: {
        label: "Нужна эскалация",
        barClassName: "bg-red-500",
        badgeClassName: "border-red-500/20 bg-red-500/12 text-red-700 dark:text-red-300",
        panelClassName: "border-red-500/20 bg-red-500/[0.07]",
        textClassName: "text-red-600 dark:text-red-400",
    },
}

const TYPE_META: Record<
    ParkSecurityType,
    {
        label: string
        shortLabel: string
        icon: LucideIcon
        iconClassName: string
        panelClassName: string
    }
> = {
    left_item: {
        label: PARK_SECURITY_LABELS.left_item,
        shortLabel: "Предметы",
        icon: PackageSearch,
        iconClassName: "text-violet-500",
        panelClassName: "border-violet-500/20 bg-violet-500/[0.06]",
    },
    person_down: {
        label: PARK_SECURITY_LABELS.person_down,
        shortLabel: "Человек",
        icon: PersonStanding,
        iconClassName: "text-orange-500",
        panelClassName: "border-orange-500/20 bg-orange-500/[0.06]",
    },
    fight: {
        label: PARK_SECURITY_LABELS.fight,
        shortLabel: "Драка",
        icon: Swords,
        iconClassName: "text-red-500",
        panelClassName: "border-red-500/20 bg-red-500/[0.06]",
    },
    fire: {
        label: PARK_SECURITY_LABELS.fire,
        shortLabel: "Пожар",
        icon: Flame,
        iconClassName: "text-rose-500",
        panelClassName: "border-rose-500/20 bg-rose-500/[0.06]",
    },
}

function filterSelectedParks<T extends { locationId: ParkId }>(data: T[], selectedParks: ParkId[]) {
    if (selectedParks.length === 0) return [] as T[]
    if (selectedParks.length === PARKS.length) return data
    return filterByLocations(data, selectedParks)
}

function ScoreBar({
    value,
    tone,
    className,
}: {
    value: number
    tone: ParkOperationalTone
    className?: string
}) {
    return (
        <div className={cn("h-2 overflow-hidden rounded-full bg-muted/70", className)}>
            <div
                className={cn("h-full rounded-full transition-all", TONE_META[tone].barClassName)}
                style={{ width: `${value}%` }}
            />
        </div>
    )
}

function ToneBadge({ tone }: { tone: ParkOperationalTone }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
                TONE_META[tone].badgeClassName
            )}
        >
            {TONE_META[tone].label}
        </Badge>
    )
}

function getActionTitle(park: ParkSecurityParkPriority) {
    if (park.incidentCount === 0) {
        return `Сохранить профилактический обход в ${park.parkName}`
    }

    const area = park.hotspotZone ?? park.parkName

    if (park.criticalOpenCount > 0) {
        return `Закрыть критические инциденты в зоне ${area}`
    }
    if (park.dominantType === "fight") {
        return `Усилить патрулирование и контроль конфликтов в зоне ${area}`
    }
    if (park.dominantType === "person_down") {
        return `Проверить маршруты обхода и скорость реагирования в зоне ${area}`
    }
    if (park.dominantType === "fire") {
        return `Перепроверить противопожарный контур и тревожные сценарии в зоне ${area}`
    }

    return `Снизить фоновую тревожность и убрать оставленные предметы в зоне ${area}`
}

function getActionDetail(park: ParkSecurityParkPriority) {
    if (park.incidentCount === 0) {
        return `${park.parkName}: выраженных инцидентов не зафиксировано, достаточно планового обхода и сохранения текущего режима.`
    }

    const hotspot = park.hotspotZone ? `${park.hotspotZone}, ` : ""
    const reactionPart = park.avgResponse > 0 ? `средняя реакция ${park.avgResponse} мин` : "реакции не требовалось"
    return `${park.parkName}: ${hotspot}${park.unresolvedCount} открытых кейсов, ${park.criticalOpenCount} критических в работе, ${reactionPart}.`
}

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
            filterSelectedParks(parkSecurityDailyData, selectedParks),
            timeRange
        ).sort((left, right) => left.date.localeCompare(right.date))
    }, [selectedParks, timeRange])

    const filteredIncidents = useMemo(() => {
        return filterByTimeRangeResult(
            filterSelectedParks(parkSecurityIncidentsData, selectedParks),
            timeRange
        )
    }, [selectedParks, timeRange])

    const overview = useMemo(
        () => getParkSecurityOverview(filteredDaily, filteredIncidents),
        [filteredDaily, filteredIncidents]
    )
    const dailyRisk = useMemo(
        () => getParkSecurityDailyRisk(filteredDaily, filteredIncidents),
        [filteredDaily, filteredIncidents]
    )
    const issueMix = useMemo(
        () => getParkSecurityIssueMix(filteredIncidents),
        [filteredIncidents]
    )
    const priorityParks = useMemo(
        () => getParkSecurityPriorityParks(filteredDaily, filteredIncidents),
        [filteredDaily, filteredIncidents]
    )
    const zoneHotspots = useMemo(
        () => getParkSecurityZoneHotspots(filteredIncidents),
        [filteredIncidents]
    )

    const selectedLabel =
        selectedParks.length === PARKS.length
            ? "Все парки"
            : selectedParks.length === 0
                ? "Не выбрано"
                : selectedParks.length === 1
                    ? getParkNameById(selectedParks[0])
                    : `${selectedParks.length} из ${PARKS.length}`

    const issueMixChartData = issueMix.map((item) => ({
        ...item,
        shortLabel: TYPE_META[item.type].shortLabel,
    }))
    const worstPark = priorityParks[0] ?? null
    const hasData = filteredDaily.length > 0 || filteredIncidents.length > 0
    const actionQueue = useMemo(() => {
        const candidateParks = priorityParks.filter(
            (park) => park.tone !== "healthy" || park.unresolvedCount > 0 || park.criticalOpenCount > 0
        )

        return (candidateParks.length > 0 ? candidateParks : priorityParks)
            .slice(0, 4)
            .map((park) => ({
                park,
                title: getActionTitle(park),
                detail: getActionDetail(park),
            }))
    }, [priorityParks])

    return (
        <div className="h-full overflow-auto bg-gradient-to-b from-rose-500/[0.04] via-background to-background">
            <div className="p-6 space-y-6">
                <TimeRangeFilter value={timeRange} onChange={setTimeRange}>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="gap-2">
                                <Users2 className="h-4 w-4" />
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

                {selectedParks.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <div className="rounded-full bg-muted p-4">
                                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold">Выберите хотя бы один парк</h3>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    Экран покажет оперативную обстановку, приоритетные парки и
                                    проблемные зоны только для выбранной территории.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : !hasData ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <div className="rounded-full bg-muted p-4">
                                <ShieldCheck className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold">За выбранный период нет событий</h3>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    Смените период или набор парков, чтобы оценить динамику риска и
                                    повторяющиеся проблемные зоны.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-4 xl:grid-cols-12">
                            <Card className="xl:col-span-5 border-rose-500/20 bg-gradient-to-br from-slate-950/[0.03] via-rose-500/[0.07] to-orange-500/[0.12] dark:from-slate-950 dark:via-rose-950/40 dark:to-orange-950/30">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-medium text-rose-700 dark:text-rose-300">
                                                <ShieldAlert className="h-4 w-4" />
                                                Оперативная обстановка в парках
                                            </div>
                                            <div className="flex items-end gap-3">
                                                <span className="text-5xl font-semibold tracking-tight tabular-nums">
                                                    {overview.safetyScore}
                                                </span>
                                                <span className="pb-1 text-lg text-muted-foreground">/100</span>
                                            </div>
                                            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                                                Сводный индекс учитывает частоту инцидентов, долю незакрытых кейсов,
                                                критические события и скорость реакции. Сейчас наибольшее давление
                                                испытывает{" "}
                                                <span className="font-medium text-foreground">
                                                    {overview.worstParkName ?? "выбранная территория"}
                                                </span>
                                                , а доминирующий риск связан с типом{" "}
                                                <span className="font-medium text-foreground">
                                                    {overview.dominantTypeLabel.toLowerCase()}
                                                </span>
                                                .
                                            </p>
                                        </div>
                                        <ToneBadge tone={worstPark?.tone ?? "healthy"} />
                                    </div>

                                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-emerald-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Стабильно
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.healthyParks}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-amber-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Под давлением
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.attentionParks}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-red-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Эскалация
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.criticalParks}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>Распределение по паркам</span>
                                            <span>{overview.monitoredParks} под мониторингом</span>
                                        </div>
                                        <div className="flex h-2 overflow-hidden rounded-full bg-background/70">
                                            {[
                                                { value: overview.healthyParks, className: "bg-emerald-500" },
                                                { value: overview.attentionParks, className: "bg-amber-500" },
                                                { value: overview.criticalParks, className: "bg-red-500" },
                                            ].map((segment, index) => (
                                                <div
                                                    key={index}
                                                    className={segment.className}
                                                    style={{
                                                        width: overview.monitoredParks
                                                            ? `${(segment.value / overview.monitoredParks) * 100}%`
                                                            : "0%",
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {worstPark && (
                                        <div className="mt-5 rounded-2xl border border-background/60 bg-background/70 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                        Главный парк риска
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className="text-base font-semibold">{worstPark.parkName}</span>
                                                        <ToneBadge tone={worstPark.tone} />
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-3xl font-semibold tabular-nums">
                                                        {worstPark.safetyScore}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">индекс</div>
                                                </div>
                                            </div>
                                            <div className="mt-4 space-y-2">
                                                <ScoreBar value={worstPark.safetyScore} tone={worstPark.tone} />
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <span>{worstPark.dominantTypeLabel}</span>
                                                    <span>·</span>
                                                    <span>{worstPark.unresolvedCount} незакрытых</span>
                                                    <span>·</span>
                                                    <span>{worstPark.avgResponse} мин средняя реакция</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-2 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.10] to-background">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                        <TriangleAlert className="h-4 w-4 text-amber-500" />
                                        Под давлением
                                    </div>
                                    <div className="mt-4 text-4xl font-semibold tabular-nums">
                                        {overview.atRiskParks}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Столько парков уже требуют повышенного внимания в текущем периоде.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-2 border-red-500/20 bg-gradient-to-br from-red-500/[0.10] to-background">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                        <Siren className="h-4 w-4 text-red-500" />
                                        Критические в работе
                                    </div>
                                    <div className="mt-4 text-4xl font-semibold tabular-nums">
                                        {overview.criticalOpenIncidents}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Незакрытые критические кейсы, которые нельзя оставлять на следующий обход.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-3 border-slate-500/20 bg-gradient-to-br from-slate-950/[0.03] via-slate-500/[0.06] to-background dark:from-slate-950 dark:via-slate-900">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                        <MapPin className="h-4 w-4 text-sky-500" />
                                        Точка эскалации
                                    </div>
                                    <div className="mt-4 text-2xl font-semibold">
                                        {overview.worstZoneLabel}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {overview.worstZoneParkName ?? "По выбранным паркам"}.
                                        {" "}Здесь чаще всего повторяются события, которые формируют общий риск.
                                    </p>
                                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5" />
                                        Средняя реакция по модулю:{" "}
                                        <span className="font-medium text-foreground">{overview.avgResponse} мин</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-12">
                            <Card className="xl:col-span-8">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Activity className="h-5 w-5 text-sky-500" />
                                        Динамика оперативного риска
                                    </CardTitle>
                                    <CardDescription>
                                        По каким дням безопасность проседала сильнее и где критические сигналы
                                        уже тянут индекс вниз.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ChartContainer config={riskTrendConfig} className="h-[320px] w-full">
                                        <ComposedChart
                                            data={dailyRisk}
                                            margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                            <YAxis
                                                yAxisId="score"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                domain={[0, 100]}
                                            />
                                            <YAxis
                                                yAxisId="incidents"
                                                orientation="right"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                allowDecimals={false}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <ReferenceLine
                                                yAxisId="score"
                                                y={75}
                                                stroke="hsl(152, 57%, 40%)"
                                                strokeDasharray="4 4"
                                                strokeWidth={1.5}
                                                label={{
                                                    value: "Целевая зона",
                                                    position: "insideTopRight",
                                                    fill: "hsl(152, 57%, 40%)",
                                                    fontSize: 10,
                                                }}
                                            />
                                            <Bar
                                                yAxisId="incidents"
                                                dataKey="incidentCount"
                                                fill="var(--color-incidentCount)"
                                                radius={[6, 6, 0, 0]}
                                                maxBarSize={18}
                                                opacity={0.75}
                                            />
                                            <Line
                                                yAxisId="score"
                                                type="monotone"
                                                dataKey="riskScore"
                                                stroke="var(--color-riskScore)"
                                                strokeWidth={2.5}
                                                dot={{ r: 3 }}
                                            />
                                            <Line
                                                yAxisId="incidents"
                                                type="monotone"
                                                dataKey="criticalCount"
                                                stroke="var(--color-criticalCount)"
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                        </ComposedChart>
                                    </ChartContainer>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-4">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <TriangleAlert className="h-5 w-5 text-amber-500" />
                                        Структура угроз
                                    </CardTitle>
                                    <CardDescription>
                                        Какие типы событий чаще других остаются незакрытыми и формируют эскалацию.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ChartContainer config={issueMixConfig} className="h-[320px] w-full">
                                        <BarChart
                                            data={issueMixChartData}
                                            layout="vertical"
                                            margin={{ left: 4, right: 12, top: 8, bottom: 0 }}
                                        >
                                            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                                            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                                            <YAxis
                                                dataKey="shortLabel"
                                                type="category"
                                                tickLine={false}
                                                axisLine={false}
                                                width={78}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <Bar dataKey="totalCount" fill="var(--color-totalCount)" radius={[4, 4, 4, 4]} />
                                            <Bar dataKey="unresolvedCount" fill="var(--color-unresolvedCount)" radius={[4, 4, 4, 4]} />
                                            <Bar dataKey="criticalCount" fill="var(--color-criticalCount)" radius={[4, 4, 4, 4]} />
                                        </BarChart>
                                    </ChartContainer>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-12">
                            <Card className="xl:col-span-7">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <ShieldAlert className="h-5 w-5 text-rose-500" />
                                        Парки приоритетного внимания
                                    </CardTitle>
                                    <CardDescription>
                                        Где сейчас накапливается риск и какая причина ухудшает ситуацию сильнее всего.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {priorityParks.map((park) => {
                                        const TypeIcon = park.dominantType ? TYPE_META[park.dominantType].icon : ShieldCheck

                                        return (
                                            <div
                                                key={park.parkId}
                                                className={cn(
                                                    "rounded-2xl border p-4",
                                                    TONE_META[park.tone].panelClassName
                                                )}
                                            >
                                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-base font-semibold">{park.parkName}</h3>
                                                            <ToneBadge tone={park.tone} />
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">
                                                            {park.hotspotZone
                                                                ? `${park.hotspotZone} формирует основной фон риска.`
                                                                : "Выраженной проблемной зоны пока нет."}
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <Badge variant="outline" className="gap-1.5">
                                                                <TypeIcon
                                                                    className={cn(
                                                                        "h-3.5 w-3.5",
                                                                        park.dominantType
                                                                            ? TYPE_META[park.dominantType].iconClassName
                                                                            : "text-emerald-500"
                                                                    )}
                                                                />
                                                                {park.dominantTypeLabel}
                                                            </Badge>
                                                            <span>{park.incidentCount} событий</span>
                                                            <span>·</span>
                                                            <span>{park.unresolvedCount} незакрытых</span>
                                                            <span>·</span>
                                                            <span>{park.avgResponse} мин реакция</span>
                                                        </div>
                                                    </div>

                                                    <div className="min-w-36 text-left lg:text-right">
                                                        <div className="text-3xl font-semibold tabular-nums">
                                                            {park.safetyScore}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">индекс</div>
                                                    </div>
                                                </div>
                                                <div className="mt-4 space-y-2">
                                                    <ScoreBar value={park.safetyScore} tone={park.tone} />
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{park.criticalOpenCount} критических в работе</span>
                                                        <span>·</span>
                                                        <span>
                                                            hotspot {park.hotspotZone ?? "не выделен"} ({park.hotspotCount})
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-5">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <MapPin className="h-5 w-5 text-sky-500" />
                                        Повторяющиеся hotspot-зоны
                                    </CardTitle>
                                    <CardDescription>
                                        Территории, где проблемы возвращаются и требуют изменения маршрутов обхода.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ScrollArea className="h-[360px] pr-4">
                                        <div className="space-y-3">
                                            {zoneHotspots.slice(0, 6).map((zone) => {
                                                const TypeIcon = zone.dominantType ? TYPE_META[zone.dominantType].icon : ShieldCheck

                                                return (
                                                    <div
                                                        key={zone.id}
                                                        className={cn(
                                                            "rounded-2xl border p-4",
                                                            TONE_META[zone.tone].panelClassName
                                                        )}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="space-y-1">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-semibold">{zone.zone}</span>
                                                                    <ToneBadge tone={zone.tone} />
                                                                </div>
                                                                <div className="text-sm text-muted-foreground">
                                                                    {zone.parkName}
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-2xl font-semibold tabular-nums">
                                                                    {zone.riskScore}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground">индекс</div>
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <Badge variant="outline" className="gap-1.5">
                                                                <TypeIcon
                                                                    className={cn(
                                                                        "h-3.5 w-3.5",
                                                                        zone.dominantType
                                                                            ? TYPE_META[zone.dominantType].iconClassName
                                                                            : "text-emerald-500"
                                                                    )}
                                                                />
                                                                {zone.dominantTypeLabel}
                                                            </Badge>
                                                            <span>{zone.incidentCount} событий</span>
                                                            <span>·</span>
                                                            <span>{zone.unresolvedCount} незакрытых</span>
                                                            <span>·</span>
                                                            <span>{zone.avgResponse} мин</span>
                                                        </div>
                                                        <div className="mt-3">
                                                            <ScoreBar value={zone.riskScore} tone={zone.tone} />
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MoveRight className="h-5 w-5 text-rose-500" />
                                    Очередь управленческих действий
                                </CardTitle>
                                <CardDescription>
                                    С чего начать, чтобы быстрее всего снизить риск по выбранным паркам.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {actionQueue.map(({ park, title, detail }, index) => (
                                    <div
                                        key={`${park.parkId}-${index}`}
                                        className={cn(
                                            "rounded-2xl border p-4",
                                            TONE_META[park.tone].panelClassName
                                        )}
                                    >
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline">Приоритет {index + 1}</Badge>
                                                    <ToneBadge tone={park.tone} />
                                                </div>
                                                <div className="text-base font-semibold">{title}</div>
                                                <p className="text-sm text-muted-foreground">{detail}</p>
                                            </div>
                                            <div className="min-w-40 text-left lg:text-right">
                                                <div className="text-sm font-medium">{park.parkName}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {park.hotspotZone ?? "Без выделенной зоны"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </div>
    )
}
