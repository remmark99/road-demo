"use client"

import { useMemo, useState } from "react"
import {
    Area,
    BarChart,
    Bar,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    ReferenceLine,
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

import { TimeRangeFilter, filterByDayResult, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Activity,
    AlertCircle,
    Flame,
    Gauge,
    MoveRight,
    ShieldAlert,
    ShieldCheck,
    Siren,
    Sparkles,
    TimerReset,
    Trash2,
    TriangleAlert,
    Users2,
    Snowflake,
    type LucideIcon,
} from "lucide-react"
import {
    BUS_STOPS,

    conditionReadingsData,
    conditionAlertsData,

    CONDITION_SHORT_LABELS,
    TRASH_WARNING,
    FOGGING_WARNING,
    type ConditionSeverity,
    type ConditionType,
    type StopConditionPriority,
    getConditionHourlyHealth,
    getConditionIssueMix,
    getConditionOverview,
    getConditionPriorityStops,
    type BusStopId,
} from "@/lib/mock/condition-mock-data"
import { cn } from "@/lib/utils"

// ─── Chart Configs ───────────────────────────────────

const pulseConfig = {
    healthScore: { label: "Индекс здоровья", color: "hsl(152, 57%, 40%)" },
    alertCount: { label: "Все тревоги", color: "hsl(32, 95%, 53%)" },
    criticalCount: { label: "Критические", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const issueMixConfig = {
    warningCount: { label: "Предупреждения", color: "hsl(38, 92%, 50%)" },
    criticalCount: { label: "Критические", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const compareConfig = {
    avgTrash: { label: "Средний мусор", color: "hsl(25, 95%, 53%)" },
    avgFogging: { label: "Среднее запотевание", color: "hsl(200, 80%, 55%)" },
} satisfies ChartConfig

const STATUS_META: Record<
    ConditionSeverity,
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
        label: "Под наблюдением",
        barClassName: "bg-amber-500",
        badgeClassName: "border-amber-500/20 bg-amber-500/12 text-amber-700 dark:text-amber-300",
        panelClassName: "border-amber-500/20 bg-amber-500/[0.07]",
        textClassName: "text-amber-600 dark:text-amber-400",
    },
    critical: {
        label: "Нужен выезд",
        barClassName: "bg-red-500",
        badgeClassName: "border-red-500/20 bg-red-500/12 text-red-700 dark:text-red-300",
        panelClassName: "border-red-500/20 bg-red-500/[0.07]",
        textClassName: "text-red-600 dark:text-red-400",
    },
}

const ISSUE_META: Record<
    ConditionType,
    {
        label: string
        shortLabel: string
        icon: LucideIcon
        iconClassName: string
        accentClassName: string
        panelClassName: string
    }
> = {
    trash: {
        label: "Мусор и переполнение урн",
        shortLabel: CONDITION_SHORT_LABELS.trash,
        icon: Trash2,
        iconClassName: "text-orange-500",
        accentClassName: "bg-orange-500",
        panelClassName: "border-orange-500/20 bg-orange-500/[0.06]",
    },
    fogging: {
        label: "Запотевание и обмерзание стёкол",
        shortLabel: CONDITION_SHORT_LABELS.fogging,
        icon: Snowflake,
        iconClassName: "text-sky-500",
        accentClassName: "bg-sky-500",
        panelClassName: "border-sky-500/20 bg-sky-500/[0.06]",
    },
}

function getShortStopName(stopId: BusStopId) {
    return BUS_STOPS.find((stop) => stop.id === stopId)?.name.split("/")[0].trim() ?? stopId
}

function formatHourWindow(hour: string | null) {
    if (!hour) return "Нет данных"

    const [rawHour] = hour.split(":")
    const nextHour = (Number(rawHour) + 1) % 24

    return `${hour}–${String(nextHour).padStart(2, "0")}:00`
}

function getScoreBand(score: number): ConditionSeverity {
    if (score >= 72) return "healthy"
    if (score >= 52) return "attention"
    return "critical"
}

function getActionTitle(stop: StopConditionPriority) {
    if (stop.status === "critical" && stop.avgTrash >= TRASH_WARNING && stop.avgFogging >= FOGGING_WARNING) {
        return "Комплексный выезд на остановку"
    }
    if (stop.status === "critical") {
        return stop.dominantIssue === "trash"
            ? "Срочно очистить урны и проверить график уборки"
            : "Срочно проверить обогрев и прозрачность остекления"
    }

    return stop.dominantIssue === "trash"
        ? "Поставить внеплановую уборку в окно риска"
        : "Проверить климатический контур и антизапотевание"
}

function getActionDetail(stop: StopConditionPriority) {
    return `Пик ${formatHourWindow(stop.peakHour)}. Урны до ${stop.maxTrash}%, стекло до ${stop.maxFogging}%.`
}

function filterSelectedStops<T extends { stopId: BusStopId }>(data: T[], selectedStops: BusStopId[]) {
    if (selectedStops.length === 0) return [] as T[]
    if (selectedStops.length === BUS_STOPS.length) return data
    return data.filter((row) => selectedStops.includes(row.stopId))
}

function HealthBar({
    value,
    tone,
    className,
}: {
    value: number
    tone: ConditionSeverity
    className?: string
}) {
    return (
        <div className={cn("h-2 overflow-hidden rounded-full bg-muted/70", className)}>
            <div
                className={cn("h-full rounded-full transition-all", STATUS_META[tone].barClassName)}
                style={{ width: `${value}%` }}
            />
        </div>
    )
}

function StatusBadge({ status }: { status: ConditionSeverity }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
                STATUS_META[status].badgeClassName
            )}
        >
            {STATUS_META[status].label}
        </Badge>
    )
}

// ─── Main Component ──────────────────────────────────

export function ConditionAnalytics() {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: "today" })
    const [selectedStops, setSelectedStops] = useState<BusStopId[]>(
        BUS_STOPS.map((s) => s.id)
    )

    const toggleStop = (stopId: BusStopId) => {
        setSelectedStops((prev) =>
            prev.includes(stopId) ? prev.filter((id) => id !== stopId) : [...prev, stopId]
        )
    }
    const toggleAll = () => {
        setSelectedStops((prev) =>
            prev.length === BUS_STOPS.length ? [] : BUS_STOPS.map((s) => s.id)
        )
    }

    // ─── Filtered data ─────────────────────────────────

    const readingsFiltered = useMemo(() => {
        return filterByDayResult(filterSelectedStops(conditionReadingsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    const alertsFiltered = useMemo(() => {
        return filterByDayResult(filterSelectedStops(conditionAlertsData, selectedStops), timeRange)
    }, [timeRange, selectedStops])

    const overview = useMemo(
        () => getConditionOverview(readingsFiltered, alertsFiltered),
        [readingsFiltered, alertsFiltered]
    )
    const hourlyHealth = useMemo(
        () => getConditionHourlyHealth(readingsFiltered, alertsFiltered),
        [readingsFiltered, alertsFiltered]
    )
    const priorityStops = useMemo(
        () => getConditionPriorityStops(readingsFiltered, alertsFiltered),
        [readingsFiltered, alertsFiltered]
    )
    const issueMix = useMemo(() => getConditionIssueMix(alertsFiltered), [alertsFiltered])

    const selectedLabel =
        selectedStops.length === BUS_STOPS.length
            ? "Все остановки"
            : selectedStops.length === 0
                ? "Не выбрано"
                : selectedStops.length === 1
                    ? getShortStopName(selectedStops[0])
                    : `${selectedStops.length} из ${BUS_STOPS.length}`

    const networkTone = getScoreBand(overview.networkHealth)
    const worstStop = priorityStops[0] ?? null
    const bestStop = priorityStops
        .slice()
        .sort((a, b) => b.healthScore - a.healthScore || a.criticalAlerts - b.criticalAlerts)[0] ?? null
    const issueMixChartData = issueMix.map((item) => ({
        ...item,
        shortLabel: ISSUE_META[item.type].shortLabel,
    }))
    const actionQueue = useMemo(() => {
        const candidateStops = priorityStops.filter(
            (stop) => stop.status !== "healthy" || stop.warningAlerts > 0 || stop.criticalAlerts > 0
        )

        return (candidateStops.length > 0 ? candidateStops : priorityStops)
            .slice(0, 4)
            .map((stop) => ({
                stop,
                title: getActionTitle(stop),
                detail: getActionDetail(stop),
            }))
    }, [priorityStops])

    return (
        <div className="h-full overflow-auto bg-gradient-to-b from-sky-500/[0.04] via-background to-background">
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
                                        id="all-stops-cond"
                                        checked={selectedStops.length === BUS_STOPS.length}
                                        onCheckedChange={toggleAll}
                                    />
                                    <Label htmlFor="all-stops-cond" className="font-medium">
                                        Все остановки
                                    </Label>
                                </div>
                                <ScrollArea className="max-h-64 border-t pt-2 pr-4">
                                    <div className="space-y-2">
                                        {BUS_STOPS.map((stop) => (
                                            <div key={stop.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`cond-${stop.id}`}
                                                    checked={selectedStops.includes(stop.id)}
                                                    onCheckedChange={() => toggleStop(stop.id)}
                                                />
                                                <Label htmlFor={`cond-${stop.id}`} className="text-sm">
                                                    {stop.name}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </PopoverContent>
                    </Popover>
                </TimeRangeFilter>

                {selectedStops.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <div className="rounded-full bg-muted p-4">
                                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold">Выберите хотя бы одну остановку</h3>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    Экран покажет индекс здоровья, окно пикового риска и приоритет
                                    обслуживания только для выбранных остановок.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-4 xl:grid-cols-12">
                            <Card className="xl:col-span-5 border-sky-500/20 bg-gradient-to-br from-slate-950/[0.03] via-sky-500/[0.06] to-emerald-500/[0.10] dark:from-slate-950 dark:via-sky-950/40 dark:to-emerald-950/30">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
                                                <ShieldCheck className="h-4 w-4" />
                                                Индекс здоровья сети остановок
                                            </div>
                                            <div className="flex items-end gap-3">
                                                <span className="text-5xl font-semibold tracking-tight tabular-nums">
                                                    {overview.networkHealth}
                                                </span>
                                                <span className="pb-1 text-lg text-muted-foreground">/100</span>
                                            </div>
                                            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                                                Сводный показатель по состоянию урн, прозрачности остекления
                                                и частоте тревог. Сейчас сеть находится в{" "}
                                                <span className={cn("font-medium", STATUS_META[networkTone].textClassName)}>
                                                    {STATUS_META[networkTone].label.toLowerCase()}
                                                </span>
                                                .
                                            </p>
                                        </div>
                                        <StatusBadge status={networkTone} />
                                    </div>

                                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-emerald-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Стабильно
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.healthyStops}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-amber-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Под наблюдением
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.attentionStops}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-red-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Нужен выезд
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.criticalStops}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>Распределение по статусам</span>
                                            <span>{overview.monitoredStops} остановок под мониторингом</span>
                                        </div>
                                        <div className="flex h-2 overflow-hidden rounded-full bg-background/70">
                                            {[
                                                { value: overview.healthyStops, className: "bg-emerald-500" },
                                                { value: overview.attentionStops, className: "bg-amber-500" },
                                                { value: overview.criticalStops, className: "bg-red-500" },
                                            ].map((segment, index) => (
                                                <div
                                                    key={index}
                                                    className={segment.className}
                                                    style={{
                                                        width: overview.monitoredStops
                                                            ? `${(segment.value / overview.monitoredStops) * 100}%`
                                                            : "0%",
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {worstStop && (
                                        <div className="mt-5 rounded-2xl border border-background/60 bg-background/70 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                        Главный риск сети
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className="text-base font-semibold">{worstStop.stopName}</span>
                                                        <StatusBadge status={worstStop.status} />
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-3xl font-semibold tabular-nums">
                                                        {worstStop.healthScore}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">индекс</div>
                                                </div>
                                            </div>
                                            <div className="mt-4 space-y-2">
                                                <HealthBar value={worstStop.healthScore} tone={worstStop.status} />
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <span>{ISSUE_META[worstStop.dominantIssue].label}</span>
                                                    <span>·</span>
                                                    <span>Пик {formatHourWindow(worstStop.peakHour)}</span>
                                                    <span>·</span>
                                                    <span>{worstStop.criticalAlerts + worstStop.warningAlerts} тревог</span>
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
                                        В зоне риска
                                    </div>
                                    <div className="mt-4 text-4xl font-semibold tabular-nums">
                                        {overview.atRiskStops}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {overview.attentionStops} остановки под наблюдением и{" "}
                                        {overview.criticalStops} требуют срочного внимания.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-2 border-red-500/20 bg-gradient-to-br from-red-500/[0.10] to-background">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                        <Siren className="h-4 w-4 text-red-500" />
                                        Критические эпизоды
                                    </div>
                                    <div className="mt-4 text-4xl font-semibold tabular-nums">
                                        {overview.criticalAlerts}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Всего предупреждений: {overview.warningAlerts}. Сначала стоит разбирать
                                        окна с повторяющимися критическими срабатываниями.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-3 border-slate-500/20 bg-gradient-to-br from-slate-950/[0.03] via-slate-500/[0.06] to-background dark:from-slate-950 dark:via-slate-900">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                        <TimerReset className="h-4 w-4 text-sky-500" />
                                        Пик риска
                                    </div>
                                    <div className="mt-4 text-2xl font-semibold">
                                        {formatHourWindow(overview.worstHour)}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        В это окно индекс проседает до{" "}
                                        <span className="font-semibold text-foreground">
                                            {overview.lowestHealthScore ?? 0}
                                        </span>
                                        . Главный драйвер просадки:{" "}
                                        <span className="font-medium text-foreground">
                                            {overview.dominantIssueLabel.toLowerCase()}
                                        </span>
                                        .
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-12">
                            <Card className="xl:col-span-8">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Activity className="h-5 w-5 text-emerald-500" />
                                        Пульс состояния по часам
                                    </CardTitle>
                                    <CardDescription>
                                        Индекс здоровья сети, все тревоги и критические срабатывания в одном
                                        временном окне.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ChartContainer config={pulseConfig} className="h-[320px] w-full">
                                        <ComposedChart
                                            data={hourlyHealth}
                                            margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                                        >
                                            <defs>
                                                <linearGradient id="fillConditionHealth" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-healthScore)" stopOpacity={0.55} />
                                                    <stop offset="95%" stopColor="var(--color-healthScore)" stopOpacity={0.06} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis
                                                dataKey="hour"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                interval={2}
                                            />
                                            <YAxis
                                                yAxisId="health"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                domain={[0, 100]}
                                            />
                                            <YAxis
                                                yAxisId="alerts"
                                                orientation="right"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                allowDecimals={false}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <ReferenceLine
                                                yAxisId="health"
                                                y={70}
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
                                                yAxisId="alerts"
                                                dataKey="alertCount"
                                                fill="var(--color-alertCount)"
                                                radius={[6, 6, 0, 0]}
                                                maxBarSize={18}
                                                opacity={0.7}
                                            />
                                            <Area
                                                yAxisId="health"
                                                type="monotone"
                                                dataKey="healthScore"
                                                stroke="var(--color-healthScore)"
                                                fill="url(#fillConditionHealth)"
                                                strokeWidth={2.5}
                                            />
                                            <Line
                                                yAxisId="alerts"
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
                                        <Flame className="h-5 w-5 text-orange-500" />
                                        Что тянет индекс вниз
                                    </CardTitle>
                                    <CardDescription>
                                        Разбивка тревог по типам проблем и уровню серьёзности.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ChartContainer config={issueMixConfig} className="h-[210px] w-full">
                                        <BarChart
                                            data={issueMixChartData}
                                            layout="vertical"
                                            margin={{ left: 8, right: 8, top: 12, bottom: 0 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis
                                                type="number"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                allowDecimals={false}
                                            />
                                            <YAxis
                                                dataKey="shortLabel"
                                                type="category"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                width={70}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <Bar
                                                dataKey="warningCount"
                                                stackId="issue"
                                                fill="var(--color-warningCount)"
                                                radius={[4, 0, 0, 4]}
                                                barSize={22}
                                            />
                                            <Bar
                                                dataKey="criticalCount"
                                                stackId="issue"
                                                fill="var(--color-criticalCount)"
                                                radius={[0, 4, 4, 0]}
                                                barSize={22}
                                            />
                                        </BarChart>
                                    </ChartContainer>

                                    <div className="space-y-3">
                                        {issueMix.map((item) => {
                                            const issueMeta = ISSUE_META[item.type]
                                            const IssueIcon = issueMeta.icon

                                            return (
                                                <div
                                                    key={item.type}
                                                    className={cn(
                                                        "rounded-2xl border p-4",
                                                        item.total > 0 ? issueMeta.panelClassName : "bg-muted/40"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <IssueIcon className={cn("h-4 w-4", issueMeta.iconClassName)} />
                                                            <span className="text-sm font-medium">{issueMeta.label}</span>
                                                        </div>
                                                        <Badge variant="outline" className="border-background/60 bg-background/60">
                                                            {item.share}%
                                                        </Badge>
                                                    </div>
                                                    <p className="mt-2 text-sm text-muted-foreground">
                                                        {item.total} событий, из них {item.criticalCount} критических.
                                                    </p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-12">
                            <Card className="xl:col-span-7">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <ShieldAlert className="h-5 w-5 text-amber-500" />
                                        Приоритет обслуживания
                                    </CardTitle>
                                    <CardDescription>
                                        Сортировка по реальному риску: кто сильнее всего просаживает индекс сети.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {priorityStops.map((stop) => {
                                        const issueMeta = ISSUE_META[stop.dominantIssue]
                                        const IssueIcon = issueMeta.icon

                                        return (
                                            <div key={stop.stopId} className="rounded-2xl border bg-background/70 p-4">
                                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-base font-semibold">{stop.stopName}</span>
                                                            <StatusBadge status={stop.status} />
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">
                                                            {getActionTitle(stop)}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-3xl font-semibold tabular-nums">
                                                            {stop.healthScore}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">индекс</div>
                                                    </div>
                                                </div>

                                                <div className="mt-4">
                                                    <HealthBar value={stop.healthScore} tone={stop.status} />
                                                </div>

                                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                    <div className="rounded-xl border border-orange-500/15 bg-orange-500/[0.05] p-3">
                                                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                            Урны
                                                        </div>
                                                        <div className="mt-2 text-xl font-semibold tabular-nums">
                                                            {stop.avgTrash}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.05] p-3">
                                                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                            Стекло
                                                        </div>
                                                        <div className="mt-2 text-xl font-semibold tabular-nums">
                                                            {stop.avgFogging}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl border border-slate-500/15 bg-muted/40 p-3">
                                                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                            Тревоги
                                                        </div>
                                                        <div className="mt-2 text-xl font-semibold tabular-nums">
                                                            {stop.warningAlerts + stop.criticalAlerts}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline" className="border-background/60 bg-background/60">
                                                        <IssueIcon className={cn("h-3 w-3", issueMeta.iconClassName)} />
                                                        {issueMeta.shortLabel}
                                                    </Badge>
                                                    <Badge variant="outline" className="border-background/60 bg-background/60">
                                                        Пик {formatHourWindow(stop.peakHour)}
                                                    </Badge>
                                                    <Badge variant="outline" className="border-background/60 bg-background/60">
                                                        {stop.criticalAlerts} крит. / {stop.warningAlerts} предупр.
                                                    </Badge>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-5">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Gauge className="h-5 w-5 text-violet-500" />
                                        Статусная матрица остановок
                                    </CardTitle>
                                    <CardDescription>
                                        Компактный снимок по каждой точке: индекс, главный драйвер и окно риска.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {priorityStops.map((stop) => {
                                        const issueMeta = ISSUE_META[stop.dominantIssue]
                                        const IssueIcon = issueMeta.icon

                                        return (
                                            <div
                                                key={`${stop.stopId}-matrix`}
                                                className={cn(
                                                    "rounded-2xl border p-4",
                                                    STATUS_META[stop.status].panelClassName
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <div className="text-sm font-semibold">{stop.stopName}</div>
                                                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                                            <IssueIcon className={cn("h-3.5 w-3.5", issueMeta.iconClassName)} />
                                                            {issueMeta.label}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div
                                                            className={cn(
                                                                "text-2xl font-semibold tabular-nums",
                                                                STATUS_META[stop.status].textClassName
                                                            )}
                                                        >
                                                            {stop.healthScore}
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground">индекс</div>
                                                    </div>
                                                </div>

                                                <div className="mt-3 space-y-2">
                                                    <HealthBar value={stop.healthScore} tone={stop.status} />
                                                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                                                        <div>Урны: {stop.maxTrash}% пик</div>
                                                        <div>Стекло: {stop.maxFogging}% пик</div>
                                                        <div>Риск: {stop.riskScore}%</div>
                                                        <div>Пик: {formatHourWindow(stop.peakHour)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Sparkles className="h-5 w-5 text-sky-500" />
                                    Очередь действий для диспетчера
                                </CardTitle>
                                <CardDescription>
                                    Не просто журнал тревог, а список того, что лучше сделать следующим шагом.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-4 xl:grid-cols-2">
                                    {actionQueue.map(({ stop, title, detail }) => {
                                        const issueMeta = ISSUE_META[stop.dominantIssue]
                                        const IssueIcon = issueMeta.icon

                                        return (
                                            <div
                                                key={`${stop.stopId}-action`}
                                                className={cn(
                                                    "rounded-2xl border p-4",
                                                    STATUS_META[stop.status].panelClassName
                                                )}
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <IssueIcon className={cn("h-4 w-4", issueMeta.iconClassName)} />
                                                        <span className="font-medium">{title}</span>
                                                    </div>
                                                    <StatusBadge status={stop.status} />
                                                </div>
                                                <div className="mt-3 flex items-center gap-2 text-sm">
                                                    <span className="font-semibold">{stop.stopName}</span>
                                                    <MoveRight className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-muted-foreground">{detail}</span>
                                                </div>
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <Badge variant="outline" className="border-background/60 bg-background/60">
                                                        Индекс {stop.healthScore}
                                                    </Badge>
                                                    <Badge variant="outline" className="border-background/60 bg-background/60">
                                                        {stop.warningAlerts + stop.criticalAlerts} тревог
                                                    </Badge>
                                                    <Badge variant="outline" className="border-background/60 bg-background/60">
                                                        Доминирует {issueMeta.shortLabel.toLowerCase()}
                                                    </Badge>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {bestStop && (
                                    <div className="mt-6 rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.05] p-4">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                            <span className="font-medium">Наиболее стабильная остановка сейчас:</span>
                                            <span className="font-semibold">{bestStop.stopName}</span>
                                            <span className="text-muted-foreground">
                                                индекс {bestStop.healthScore}, пик риска {formatHourWindow(bestStop.peakHour)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </div>
    )
}
