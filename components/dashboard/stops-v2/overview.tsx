"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { AlertTriangle, ArrowRight, BarChart3, Building2, Cctv, ChevronDown, ShieldAlert, Thermometer, Trash2, TrendingUp, Users2, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
    DAY,
    HOUR,
    V_DISTRICTS,
    V_NORMS,
    V_NOW,
    V_STOPS,
    fmtDuration,
    fmtInt,
    fmtNum,
    loadAt,
    plural,
    stopById,
} from "@/lib/mock/stop-analytics-vision-data"
import {
    CATEGORY_COLORS,
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    attentionNow,
    availabilityPct,
    binStats,
    binsIn,
    binsOpenNow,
    buildBuckets,
    climateNow,
    climateSummary,
    devicesOf,
    districtRows,
    openOutages,
    outageIncidents,
    outagesStarted,
    peopleNow,
    relativeTone,
    safetyIn,
    stopProblemParts,
    type AttentionKind,
} from "@/components/dashboard/stops-v2/selectors"
import {
    ChartCard,
    EmptyNote,
    Insight,
    KpiCard,
    RankList,
    SectionShell,
    StatusBadge,
    StopLink,
    makeDelta,
    useScope,
    useVision,
    type RankRow,
} from "@/components/dashboard/stops-v2/kit"

const KIND_ICONS: Record<AttentionKind, LucideIcon> = {
    equipment: Cctv,
    clean: Trash2,
    safety: ShieldAlert,
    climate: Thermometer,
}

const dailyConfig = Object.fromEntries(
    CATEGORY_ORDER.map((kind) => [kind, { label: CATEGORY_LABELS[kind], color: CATEGORY_COLORS[kind] }]),
) satisfies ChartConfig

const PERIOD_PHRASE: Record<string, string> = {
    today: "За сегодня",
    yesterday: "За вчера",
    week: "За неделю",
    month: "За месяц",
    custom: "За выбранный период",
}

function toneDot(tone: "success" | "attention" | "high") {
    return cn(
        "inline-block h-2 w-2 rounded-full",
        tone === "success" && "bg-emerald-500",
        tone === "attention" && "bg-amber-500",
        tone === "high" && "bg-red-500",
    )
}

export function StopsOverview() {
    const scope = useScope()
    const { setView, toggleDistrict, districtIds, timeRange } = useVision()
    const [showAllAttention, setShowAllAttention] = useState(false)

    const data = useMemo(() => {
        const { ids, stops, from, to, prevFrom, prevTo } = scope

        const devices = devicesOf(ids).length
        const offlineDevices = openOutages(ids).length
        const availability = availabilityPct(ids, from, to)
        const availabilityPrev = availabilityPct(ids, prevFrom, prevTo)

        const openBins = binsOpenNow(ids)
        const lateBins = openBins.filter((episode) => V_NOW - episode.startAt > V_NORMS.binHours * HOUR).length
        const bins = binStats(ids, from, to)

        const safety = safetyIn(ids, from, to).length
        const safetyPrev = safetyIn(ids, prevFrom, prevTo).length

        const climateRows = climateNow(stops)
        const climateOut = climateRows.filter((row) => row.out).length
        const climateKnown = climateRows.filter((row) => row.temp !== null).length

        const people = peopleNow(stops)
        const usual = Math.round([1, 2, 3, 4].reduce((sum, week) => sum + stops.reduce((inner, stop) => inner + loadAt(stop, V_NOW - week * 7 * DAY), 0), 0) / 4)

        const attention = attentionNow(stops)
        const climate = climateSummary(stops, from, to)

        const buckets = buildBuckets(scope)
        const daily = buckets.map((bucket) => {
            return {
                label: bucket.label,
                equipment: outageIncidents(outagesStarted(ids, bucket.from, bucket.to)),
                clean: binsIn(ids, bucket.from, bucket.to).length,
                safety: safetyIn(ids, bucket.from, bucket.to).length,
                climate: climate.starts.filter((ts) => ts >= bucket.from && ts < bucket.to).length,
            }
        })

        const ranking: RankRow[] = stops
            .map((stop) => ({ stop, parts: stopProblemParts(stop, from, to, climate) }))
            .map((row) => ({ ...row, total: row.parts.reduce((sum, part) => sum + part, 0) }))
            .filter((row) => row.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map((row) => ({ id: row.stop.id, stop: row.stop, parts: row.parts, valueText: fmtInt(row.total) }))

        const districts = districtRows(V_DISTRICTS, V_STOPS, from, to)

        return {
            devices, offlineDevices, availability, availabilityPrev, openBins, lateBins, bins, safety, safetyPrev,
            climateOut, climateKnown, people, usual, attention, daily, ranking, districts,
        }
    }, [scope])

    const offlineLong = data.attention.filter((item) => item.kind === "equipment" && item.severity === "high").length
    const safetyDelta = makeDelta(data.safety, data.safetyPrev, { kind: "percent", goodWhen: "down" })
    const shownAttention = showAllAttention ? data.attention : data.attention.slice(0, 6)
    const onlinePct = data.devices ? ((data.devices - data.offlineDevices) / data.devices) * 100 : 100

    return (
        <SectionShell title="Сводка">
            <Insight>
                <span className="font-medium">{PERIOD_PHRASE[timeRange.preset] ?? "За период"}:</span>{" "}
                {offlineLong > 0
                    ? `${offlineLong} ${plural(offlineLong, ["остановка", "остановки", "остановок"])} без связи дольше суток. `
                    : "Остановок без связи дольше суток нет. "}
                {data.bins.closedCount > 0
                    ? `Урны убирали в среднем за ${fmtDuration(data.bins.medianMs)} при норме ${V_NORMS.binHours} ч. `
                    : data.bins.count > 0 ? "Переполненные урны пока не убраны. " : "Переполненных урн не было. "}
                {safetyDelta.direction === "flat"
                    ? `Событий безопасности столько же, сколько в прошлом периоде: ${fmtInt(data.safety)}.`
                    : `Событий безопасности ${fmtInt(data.safety)}, на ${safetyDelta.text} ${safetyDelta.direction === "down" ? "меньше" : "больше"}, чем в прошлом периоде.`}
            </Insight>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <KpiCard
                    title="Оборудование на связи"
                    value={`${fmtNum(onlinePct, 0)} %`}
                    icon={Cctv}
                    tone={onlinePct < 90 ? "attention" : "success"}
                    delta={makeDelta(data.availability, data.availabilityPrev, { kind: "points", goodWhen: "up" })}
                    deltaLabel="доступность"
                    detail={`Не в сети: ${fmtInt(data.offlineDevices)} из ${fmtInt(data.devices)} устройств`}
                    onClick={() => setView("equipment")}
                />
                <KpiCard
                    title="Урны переполнены сейчас"
                    value={fmtInt(data.openBins.length)}
                    icon={Trash2}
                    tone={data.lateBins > 0 ? "high" : data.openBins.length > 0 ? "attention" : "success"}
                    detail={data.lateBins > 0 ? `${data.lateBins} дольше нормы ${V_NORMS.binHours} ч` : "Все в пределах нормы"}
                    onClick={() => setView("clean")}
                />
                <KpiCard
                    title="События безопасности"
                    value={fmtInt(data.safety)}
                    icon={ShieldAlert}
                    delta={safetyDelta}
                    deltaLabel={scope.prevLabel}
                    onClick={() => setView("safety")}
                />
                <KpiCard
                    title="Вне нормы по климату"
                    value={fmtInt(data.climateOut)}
                    icon={Thermometer}
                    tone={data.climateOut > 0 ? "attention" : "success"}
                    detail={`Из ${fmtInt(data.climateKnown)} остановок с показаниями`}
                    onClick={() => setView("sensors")}
                />
                <KpiCard
                    title="Людей на остановках сейчас"
                    value={fmtInt(data.people)}
                    icon={Users2}
                    detail={`Обычно в этот час около ${fmtInt(data.usual)}`}
                    onClick={() => setView("load")}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard
                    className="xl:col-span-6"
                    title="Что требует внимания сейчас?"
                    icon={AlertTriangle}
                    iconClassName="text-amber-500"
                    hint="Самое срочное сверху. Строка открывает карточку остановки."
                >
                    {data.attention.length === 0 ? (
                        <EmptyNote>Сейчас всё в порядке</EmptyNote>
                    ) : (
                        <div className="space-y-2">
                            {shownAttention.map((item) => {
                                const Icon = KIND_ICONS[item.kind]
                                const stop = stopById(item.stopId)
                                if (!stop) return null
                                return (
                                    <div key={item.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                                        <div className={cn("rounded-md border p-2", item.severity === "high" ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300" : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300")}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{item.title}</div>
                                            <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
                                        </div>
                                        <div className="hidden w-44 shrink-0 sm:block"><StopLink stop={stop} /></div>
                                        <StatusBadge tone={item.severity}>{fmtDuration(V_NOW - item.since)}</StatusBadge>
                                    </div>
                                )
                            })}
                            {data.attention.length > 6 && (
                                <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllAttention((value) => !value)}>
                                    {showAllAttention ? "Свернуть" : `Показать все (${data.attention.length})`}
                                    <ChevronDown className={cn("ml-1 h-4 w-4 transition-transform", showAllAttention && "rotate-180")} />
                                </Button>
                            )}
                        </div>
                    )}
                </ChartCard>

                <ChartCard
                    className="xl:col-span-6"
                    title="Как менялась обстановка?"
                    icon={TrendingUp}
                    iconClassName="text-blue-500"
                    hint={scope.hourly ? "Происшествия по часам" : "Происшествия по дням"}
                >
                    <ChartContainer config={dailyConfig} className="h-[340px] w-full">
                        <BarChart data={data.daily} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={32} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
                            {CATEGORY_ORDER.map((kind, index) => (
                                <Bar
                                    key={kind}
                                    dataKey={kind}
                                    stackId="all"
                                    fill={`var(--color-${kind})`}
                                    stroke="var(--card)"
                                    strokeWidth={1}
                                    radius={index === CATEGORY_ORDER.length - 1 ? [4, 4, 0, 0] : 0}
                                    maxBarSize={36}
                                    isAnimationActive={false}
                                />
                            ))}
                        </BarChart>
                    </ChartContainer>
                </ChartCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard
                    className="xl:col-span-6"
                    title="Какие остановки самые проблемные?"
                    icon={BarChart3}
                    iconClassName="text-red-500"
                    hint="Число происшествий за период. В строке видно, из чего оно складывается."
                >
                    <RankList rows={data.ranking} colors={CATEGORY_ORDER.map((kind) => CATEGORY_COLORS[kind])} legend={CATEGORY_ORDER.map((kind) => CATEGORY_LABELS[kind])} />
                </ChartCard>

                <ChartCard
                    className="xl:col-span-6"
                    title="Как выглядят микрорайоны?"
                    icon={Building2}
                    iconClassName="text-violet-500"
                    hint="Показатели на одну оснащённую остановку. Цвет — отклонение от медианы по городу."
                    expandable
                    action={
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setView("districts")}>
                            Все показатели
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    }
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Микрорайон</TableHead>
                                <TableHead className="text-right">Связь</TableHead>
                                <TableHead className="text-right">Урны</TableHead>
                                <TableHead className="text-right">События</TableHead>
                                <TableHead className="text-right">Климат</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.districts.map((row) => {
                                const all = data.districts
                                const cells: [string, "success" | "attention" | "high"][] = [
                                    [`${fmtNum(row.availability)} %`, relativeTone(row.availability, all.map((item) => item.availability), "lower")],
                                    [`${fmtNum(row.binHoursPerStop)} ч`, relativeTone(row.binHoursPerStop, all.map((item) => item.binHoursPerStop), "higher")],
                                    [fmtNum(row.safetyPerStop), relativeTone(row.safetyPerStop, all.map((item) => item.safetyPerStop), "higher")],
                                    [`${fmtNum(row.climateHoursPerStop)} ч`, relativeTone(row.climateHoursPerStop, all.map((item) => item.climateHoursPerStop), "higher")],
                                ]
                                return (
                                    <TableRow key={row.id} className={cn(districtIds.includes(row.id) && "bg-muted/50")}>
                                        <TableCell>
                                            <button type="button" className="text-left font-medium underline-offset-4 hover:underline" onClick={() => toggleDistrict(row.id)} title={districtIds.includes(row.id) ? "Убрать микрорайон из фильтра" : "Добавить микрорайон в фильтр"}>
                                                {row.name}
                                            </button>
                                        </TableCell>
                                        {cells.map(([text, tone], index) => (
                                            <TableCell key={index} className="text-right tabular-nums">
                                                <span className="inline-flex items-center justify-end gap-2">
                                                    {text}
                                                    <span className={toneDot(tone)} aria-hidden />
                                                </span>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </ChartCard>
            </div>
        </SectionShell>
    )
}
