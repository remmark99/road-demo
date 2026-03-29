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
    CameraOff,
    Car,
    Gauge,
    LightbulbOff,
    MapPin,
    MoveRight,
    ShieldCheck,
    Trash2,
    TriangleAlert,
    Users2,
    type LucideIcon,
} from "lucide-react"
import {
    PARKS,
    PARK_RATING_MAX,
    PARK_RATING_TARGET,
    PARK_OPERATIONS_LABELS,
    filterByLocations,
    formatParkRating,
    getParkRatingBandLabel,
    getParkNameById,
    getParkTone,
    getParkOperationsDailyReadiness,
    getParkOperationsIssueMix,
    getParkOperationsOverview,
    getParkOperationsPriorityParks,
    getParkOperationsZoneHotspots,
    parkOperationsDailyData,
    parkOperationsIncidentsData,
    type ParkId,
    type ParkOperationalTone,
    type ParkOperationsParkPriority,
    type ParkOperationsType,
} from "@/lib/mock/park-mock-data"
import { cn } from "@/lib/utils"

const readinessTrendConfig = {
    readinessScore: { label: "Рейтинг эксплуатации", color: "hsl(152, 57%, 40%)" },
    issueCount: { label: "Все проблемы", color: "hsl(38, 92%, 50%)" },
    unresolvedCount: { label: "Открытые", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const issueMixConfig = {
    totalCount: { label: "Все проблемы", color: "hsl(201, 92%, 47%)" },
    unresolvedCount: { label: "Открытые", color: "hsl(38, 92%, 50%)" },
    highCount: { label: "Высокий приоритет", color: "hsl(0, 84%, 60%)" },
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
        label: "Нормально",
        barClassName: "bg-emerald-500",
        badgeClassName: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        panelClassName: "border-emerald-500/20 bg-emerald-500/[0.07]",
        textClassName: "text-emerald-600 dark:text-emerald-400",
    },
    attention: {
        label: "Нужно внимание",
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

const TYPE_META: Record<
    ParkOperationsType,
    {
        label: string
        shortLabel: string
        icon: LucideIcon
        iconClassName: string
        panelClassName: string
    }
> = {
    trash_overflow: {
        label: PARK_OPERATIONS_LABELS.trash_overflow,
        shortLabel: "Урны",
        icon: Trash2,
        iconClassName: "text-amber-500",
        panelClassName: "border-amber-500/20 bg-amber-500/[0.06]",
    },
    camera_obstruction: {
        label: PARK_OPERATIONS_LABELS.camera_obstruction,
        shortLabel: "Камеры",
        icon: CameraOff,
        iconClassName: "text-red-500",
        panelClassName: "border-red-500/20 bg-red-500/[0.06]",
    },
    light_off: {
        label: PARK_OPERATIONS_LABELS.light_off,
        shortLabel: "Свет",
        icon: LightbulbOff,
        iconClassName: "text-slate-500",
        panelClassName: "border-slate-500/20 bg-slate-500/[0.06]",
    },
    vehicle_detect: {
        label: PARK_OPERATIONS_LABELS.vehicle_detect,
        shortLabel: "Авто",
        icon: Car,
        iconClassName: "text-sky-500",
        panelClassName: "border-sky-500/20 bg-sky-500/[0.06]",
    },
}

const OVERVIEW_CARD_META: Record<
    ParkOperationalTone,
    {
        cardClassName: string
        titleClassName: string
        valueClassName: string
    }
> = {
    healthy: {
        cardClassName:
            "border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.18] via-background to-emerald-500/[0.05] dark:from-emerald-950/45 dark:via-background dark:to-emerald-900/20",
        titleClassName: "text-emerald-700 dark:text-emerald-300",
        valueClassName: "text-emerald-950 dark:text-emerald-50",
    },
    attention: {
        cardClassName:
            "border-amber-500/25 bg-gradient-to-br from-amber-500/[0.18] via-background to-amber-500/[0.05] dark:from-amber-950/45 dark:via-background dark:to-amber-900/20",
        titleClassName: "text-amber-700 dark:text-amber-300",
        valueClassName: "text-amber-950 dark:text-amber-50",
    },
    critical: {
        cardClassName:
            "border-red-500/25 bg-gradient-to-br from-red-500/[0.18] via-background to-red-500/[0.05] dark:from-red-950/45 dark:via-background dark:to-red-900/20",
        titleClassName: "text-red-700 dark:text-red-300",
        valueClassName: "text-red-950 dark:text-red-50",
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
                style={{ width: `${(value / PARK_RATING_MAX) * 100}%` }}
            />
        </div>
    )
}

function formatRatingTick(value: number) {
    return formatParkRating(value)
}

function getCountLabel(count: number, one: string, few: string, many: string) {
    const abs = Math.abs(count) % 100
    const lastDigit = abs % 10

    if (abs > 10 && abs < 20) return many
    if (lastDigit === 1) return one
    if (lastDigit >= 2 && lastDigit <= 4) return few
    return many
}

function formatOpenTasksLabel(count: number) {
    return `${count} ${getCountLabel(count, "открытая задача", "открытые задачи", "открытых задач")}`
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

function getActionTitle(park: ParkOperationsParkPriority) {
    if (park.issueCount === 0) {
        return `Сохранить плановый режим обслуживания в ${park.parkName}`
    }

    const area = park.hotspotZone ?? park.parkName

    if (park.unresolvedHighCount > 0 && park.dominantType === "camera_obstruction") {
        return `Восстановить обзор камер и закрыть высокий приоритет в зоне ${area}`
    }
    if (park.unresolvedHighCount > 0 && park.dominantType === "light_off") {
        return `Вернуть освещение и проверить электроконтур в зоне ${area}`
    }
    if (park.dominantType === "trash_overflow") {
        return `Снять санитарный долг и пересмотреть график уборки в зоне ${area}`
    }
    if (park.dominantType === "vehicle_detect") {
        return `Ограничить проезд и проверить периметр в зоне ${area}`
    }

    return `Закрыть сервисный долг и удержать готовность территории в зоне ${area}`
}

function getActionDetail(park: ParkOperationsParkPriority) {
    if (park.issueCount === 0) {
        return `${park.parkName}: новых эксплуатационных проблем не зафиксировано, достаточно штатного обслуживания и профилактического обхода.`
    }

    const hotspot = park.hotspotZone ? `${park.hotspotZone}, ` : ""
    return `${park.parkName}: ${hotspot}${formatOpenTasksLabel(park.unresolvedCount)}, сервисный долг ${park.serviceDebt}, доминирует ${park.dominantTypeLabel.toLowerCase()}.`
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
            filterSelectedParks(parkOperationsDailyData, selectedParks),
            timeRange
        ).sort((left, right) => left.date.localeCompare(right.date))
    }, [selectedParks, timeRange])

    const filteredIncidents = useMemo(() => {
        return filterByTimeRangeResult(
            filterSelectedParks(parkOperationsIncidentsData, selectedParks),
            timeRange
        )
    }, [selectedParks, timeRange])

    const overview = useMemo(
        () => getParkOperationsOverview(filteredDaily, filteredIncidents),
        [filteredDaily, filteredIncidents]
    )
    const readinessTrend = useMemo(
        () => getParkOperationsDailyReadiness(filteredDaily, filteredIncidents),
        [filteredDaily, filteredIncidents]
    )
    const issueMix = useMemo(
        () => getParkOperationsIssueMix(filteredIncidents),
        [filteredIncidents]
    )
    const priorityParks = useMemo(
        () => getParkOperationsPriorityParks(filteredDaily, filteredIncidents),
        [filteredDaily, filteredIncidents]
    )
    const zoneHotspots = useMemo(
        () => getParkOperationsZoneHotspots(filteredIncidents),
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
    const overviewTone = getParkTone(overview.readinessScore)
    const overviewLabel = getParkRatingBandLabel(overview.readinessScore)
    const hasData = filteredDaily.length > 0 || filteredIncidents.length > 0
    const actionQueue = useMemo(() => {
        const candidateParks = priorityParks.filter(
            (park) => park.tone !== "healthy" || park.unresolvedCount > 0 || park.serviceDebt > 0
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
        <div className="h-full overflow-auto bg-gradient-to-b from-emerald-500/[0.05] via-background to-background">
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
                                        id="all-parks-operations"
                                        checked={selectedParks.length === PARKS.length}
                                        onCheckedChange={toggleAll}
                                    />
                                    <Label htmlFor="all-parks-operations" className="font-medium">
                                        Все парки
                                    </Label>
                                </div>
                                <div className="border-t pt-2 space-y-2">
                                    {PARKS.map((park) => (
                                        <div key={park.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`park-operations-${park.id}`}
                                                checked={selectedParks.includes(park.id)}
                                                onCheckedChange={() => togglePark(park.id)}
                                            />
                                            <Label htmlFor={`park-operations-${park.id}`} className="text-sm">
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
                                    Экран покажет готовность территории, накопленный сервисный долг и
                                    приоритетные зоны только для выбранных парков.
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
                                    Смените период или состав парков, чтобы увидеть сервисный долг,
                                    проблемные зоны и динамику деградации.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-4 xl:grid-cols-12">
                            <Card className={cn("xl:col-span-5", OVERVIEW_CARD_META[overviewTone].cardClassName)}>
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-3">
                                            <div className={cn("flex items-center gap-2 text-sm font-medium", OVERVIEW_CARD_META[overviewTone].titleClassName)}>
                                                <Gauge className="h-4 w-4" />
                                                Рейтинг эксплуатации парков
                                            </div>
                                            <div className="flex items-end gap-3">
                                                <span className={cn("text-5xl font-semibold tracking-tight tabular-nums", OVERVIEW_CARD_META[overviewTone].valueClassName)}>
                                                    {formatParkRating(overview.readinessScore)}
                                                </span>
                                                <span className="pb-1 text-lg text-muted-foreground">/10</span>
                                            </div>
                                            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                                                Текущий рейтинг показывает, насколько территория готова к штатной эксплуатации.
                                                Чем ниже рейтинг, тем больше открытых задач, повторяющихся проблем и
                                                накопленного сервисного долга требует выездов. Сейчас больше всего
                                                внимания требует{" "}
                                                <span className="font-medium text-foreground">
                                                    {overview.worstParkName ?? "выбранная территория"}
                                                </span>
                                                , а сильнее всего тянет рейтинг вниз{" "}
                                                <span className="font-medium text-foreground">
                                                    {overview.dominantTypeLabel.toLowerCase()}
                                                </span>
                                                . Общий статус периода: <span className="font-medium text-foreground">{overviewLabel.toLowerCase()}</span>.
                                            </p>
                                        </div>
                                        <ToneBadge tone={overviewTone} />
                                    </div>

                                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-emerald-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Устойчиво
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.healthyParks}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-amber-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Под нагрузкой
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.attentionParks}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-red-500/20 bg-background/70 p-4">
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                Нужен выезд
                                            </div>
                                            <div className="mt-2 text-3xl font-semibold tabular-nums">
                                                {overview.criticalParks}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>Распределение по паркам</span>
                                            <span>{overview.monitoredParks} под контролем</span>
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
                                                        Парк с самым низким рейтингом
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className="text-base font-semibold">{worstPark.parkName}</span>
                                                        <ToneBadge tone={worstPark.tone} />
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-3xl font-semibold tabular-nums">
                                                        {formatParkRating(worstPark.readinessScore)}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">рейтинг / 10</div>
                                                </div>
                                            </div>
                                                <div className="mt-4 space-y-2">
                                                    <ScoreBar value={worstPark.readinessScore} tone={worstPark.tone} />
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{worstPark.dominantTypeLabel}</span>
                                                        <span>·</span>
                                                        <span>{formatOpenTasksLabel(worstPark.unresolvedCount)}</span>
                                                        <span>·</span>
                                                        <span>долг {worstPark.serviceDebt}</span>
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
                                        Требуют внимания
                                    </div>
                                    <div className="mt-4 text-4xl font-semibold tabular-nums">
                                        {overview.atRiskParks}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Столько парков уже нельзя вести только плановым обслуживанием.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-2 border-red-500/20 bg-gradient-to-br from-red-500/[0.10] to-background">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                        Сервисный долг
                                    </div>
                                    <div className="mt-4 text-4xl font-semibold tabular-nums">
                                        {overview.serviceDebt}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Открытые и высокоприоритетные задачи, которые уже тянут рейтинг вниз.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-3 border-slate-500/20 bg-gradient-to-br from-slate-950/[0.03] via-slate-500/[0.06] to-background dark:from-slate-950 dark:via-slate-900">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                        <MapPin className="h-4 w-4 text-sky-500" />
                                        Главная проблемная зона
                                    </div>
                                    <div className="mt-4 text-2xl font-semibold">
                                        {overview.worstZoneLabel}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {overview.worstZoneParkName ?? "По выбранным паркам"}.
                                        {" "}Здесь быстрее всего накапливается долг по обслуживанию.
                                    </p>
                                    <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                                        <div>
                                            Высокий приоритет в работе:{" "}
                                            <span className="font-medium text-foreground">
                                                {overview.unresolvedHighPriority}
                                            </span>
                                        </div>
                                        <div>
                                            Худший день периода:{" "}
                                            <span className="font-medium text-foreground">
                                                {overview.worstDateLabel ?? "нет данных"}
                                            </span>
                                            {overview.lowestDailyScore !== null && (
                                                <>
                                                    {" "}· рейтинг{" "}
                                                    <span className="font-medium text-foreground">
                                                        {formatParkRating(overview.lowestDailyScore)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-12">
                            <Card className="xl:col-span-8">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Activity className="h-5 w-5 text-emerald-500" />
                                        Рейтинг эксплуатации по дням
                                    </CardTitle>
                                    <CardDescription>
                                        10-балльная шкала помогает быстро увидеть, в какие дни территория
                                        выпадала из штатного режима и рос сервисный долг.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ChartContainer config={readinessTrendConfig} className="h-[320px] w-full">
                                        <ComposedChart
                                            data={readinessTrend}
                                            margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tickMargin={8} />
                                            <YAxis
                                                yAxisId="score"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                domain={[0, PARK_RATING_MAX]}
                                                tickFormatter={formatRatingTick}
                                            />
                                            <YAxis
                                                yAxisId="issues"
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
                                                y={PARK_RATING_TARGET}
                                                stroke="hsl(152, 57%, 40%)"
                                                strokeDasharray="4 4"
                                                strokeWidth={1.5}
                                                label={{
                                                    value: "Нормальный уровень",
                                                    position: "insideTopRight",
                                                    fill: "hsl(152, 57%, 40%)",
                                                    fontSize: 10,
                                                }}
                                            />
                                            <Bar
                                                yAxisId="issues"
                                                dataKey="issueCount"
                                                fill="var(--color-issueCount)"
                                                radius={[6, 6, 0, 0]}
                                                maxBarSize={18}
                                                opacity={0.75}
                                            />
                                            <Line
                                                yAxisId="score"
                                                type="monotone"
                                                dataKey="readinessScore"
                                                stroke="var(--color-readinessScore)"
                                                strokeWidth={2.5}
                                                dot={{ r: 3 }}
                                            />
                                            <Line
                                                yAxisId="issues"
                                                type="monotone"
                                                dataKey="unresolvedCount"
                                                stroke="var(--color-unresolvedCount)"
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
                                        Что тянет рейтинг вниз
                                    </CardTitle>
                                    <CardDescription>
                                        Какие типы проблем чаще других остаются открытыми и требуют выезда.
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
                                            <Bar dataKey="highCount" fill="var(--color-highCount)" radius={[4, 4, 4, 4]} />
                                        </BarChart>
                                    </ChartContainer>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-12">
                            <Card className="xl:col-span-7">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Gauge className="h-5 w-5 text-emerald-500" />
                                        Где вмешаться в первую очередь
                                    </CardTitle>
                                    <CardDescription>
                                        Рейтинг, основная причина просадки и краткое пояснение по каждому парку.
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
                                                                ? `${park.hotspotZone} даёт наибольший объём повторяющихся проблем.`
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
                                                            <span>{park.issueCount} проблем</span>
                                                            <span>·</span>
                                                            <span>{formatOpenTasksLabel(park.unresolvedCount)}</span>
                                                            <span>·</span>
                                                            <span>долг {park.serviceDebt}</span>
                                                        </div>
                                                    </div>

                                                    <div className="min-w-36 text-left lg:text-right">
                                                        <div className="text-3xl font-semibold tabular-nums">
                                                            {formatParkRating(park.readinessScore)}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">рейтинг / 10</div>
                                                    </div>
                                                </div>
                                                <div className="mt-4 space-y-2">
                                                    <ScoreBar value={park.readinessScore} tone={park.tone} />
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{park.unresolvedHighCount} высокого приоритета</span>
                                                        <span>·</span>
                                                        <span>
                                                            проблемная зона: {park.hotspotZone ?? "не выделена"} ({park.hotspotCount})
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
                                        Повторяющиеся проблемные зоны
                                    </CardTitle>
                                    <CardDescription>
                                        Места, где проблемы возвращаются и требуют отдельного маршрута обслуживания.
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
                                                                    {formatParkRating(zone.readinessScore)}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground">рейтинг / 10</div>
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
                                                            <span>{zone.issueCount} проблем</span>
                                                            <span>·</span>
                                                            <span>{formatOpenTasksLabel(zone.unresolvedCount)}</span>
                                                            <span>·</span>
                                                            <span>{zone.highCount} высокий приоритет</span>
                                                        </div>
                                                        <div className="mt-3">
                                                            <ScoreBar value={zone.readinessScore} tone={zone.tone} />
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
                                    <MoveRight className="h-5 w-5 text-emerald-500" />
                                    Очередь действий для эксплуатации
                                </CardTitle>
                                <CardDescription>
                                    Последовательность действий, которая быстрее всего поднимет рейтинг эксплуатации.
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
