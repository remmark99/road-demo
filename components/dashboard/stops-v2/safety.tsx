"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { BarChart3, Bell, CalendarClock, ExternalLink, MapPin, ShieldAlert, Timer, type LucideIcon } from "lucide-react"
import { Cigarette, Dog, Package, PersonStanding, SprayCan, Wine } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import {
    DOW_LABELS,
    HOUR,
    SAFETY_TYPES,
    V_NOW,
    V_STOPS,
    cityDow,
    cityHour,
    districtName,
    fmtDateTime,
    fmtDuration,
    fmtInt,
    median,
    plural,
    stopById,
    type SafetyType,
    type VSafetyEvent,
} from "@/lib/mock/stop-analytics-vision-data"
import { safetyNotificationsHref } from "@/lib/analytics/safety-periods"
import { buildBuckets, safetyIn } from "@/components/dashboard/stops-v2/selectors"
import {
    ChartCard,
    DataTable,
    EmptyNote,
    Insight,
    KpiCard,
    RankList,
    SectionShell,
    StatusBadge,
    StopLink,
    WeekHourHeatmap,
    makeDelta,
    usePeriodPhrase,
    useScope,
    type Column,
    type RankRow,
} from "@/components/dashboard/stops-v2/kit"

const TYPE_ICONS: Record<SafetyType, LucideIcon> = {
    lying_person: PersonStanding,
    smoking: Cigarette,
    abandoned_object: Package,
    dogs_without_people: Dog,
    glass_break: Wine,
    vandalism: SprayCan,
}

const TYPE_LABEL = Object.fromEntries(SAFETY_TYPES.map((type) => [type.id, type.label])) as Record<SafetyType, string>
const TYPE_COLOR = Object.fromEntries(SAFETY_TYPES.map((type) => [type.id, type.color])) as Record<SafetyType, string>

const typeConfig = Object.fromEntries(SAFETY_TYPES.map((type) => [type.id, { label: type.label, color: type.color }])) satisfies ChartConfig

/** Виды событий, у которых есть начало и конец: остальные — разовые срабатывания. */
const TIMED_TYPES: SafetyType[] = ["lying_person", "abandoned_object", "vandalism"]
const isTimed = (event: VSafetyEvent) => TIMED_TYPES.includes(event.type) && event.durationMin !== 0

const DURATION_BUCKETS: { label: string; max: number }[] = [
    { label: "до 5 мин", max: 5 },
    { label: "5–15 мин", max: 15 },
    { label: "15–30 мин", max: 30 },
    { label: "30–60 мин", max: 60 },
    { label: "1–3 ч", max: 180 },
    { label: "больше 3 ч", max: Infinity },
]

const DOW_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
const hourSpan = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`

function TypeMark({ type }: { type: SafetyType }) {
    return (
        <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: TYPE_COLOR[type] }} />
            {TYPE_LABEL[type]}
        </span>
    )
}

/** Событие в ленте уведомлений: вид, камера и час вокруг события; у обычного уведомления — сразу раскрытая карточка. */
function eventNotificationsHref(event: VSafetyEvent) {
    const end = event.durationMin ? event.at + event.durationMin * 60_000 : event.at
    const href = safetyNotificationsHref(
        { from: new Date(event.at - HOUR), to: new Date(Math.min(V_NOW, end + HOUR)) },
        [event.type],
        event.camera !== null ? [event.camera] : [],
    )
    // У эпизодов лежачих (lp-…) и срабатываний датчика стекла (gl-…) своего уведомления нет — только фильтр.
    return /^(lp|gl)-/.test(event.id) ? href : `${href}&alertId=${encodeURIComponent(event.id)}`
}

export function StopsSafety() {
    const scope = useScope()
    const phrase = usePeriodPhrase()
    const [active, setActive] = useState<Set<SafetyType>>(() => new Set(SAFETY_TYPES.map((type) => type.id)))
    /** Клетка тепловой карты, события которой открыты списком. */
    const [cell, setCell] = useState<{ dow: number; hour: number } | null>(null)

    const toggle = (type: SafetyType) => {
        setActive((current) => {
            const next = new Set(current)
            if (next.has(type)) next.delete(type)
            else next.add(type)
            return next.size === 0 ? new Set(SAFETY_TYPES.map((item) => item.id)) : next
        })
    }
    const only = (type: SafetyType) => {
        setActive((current) => (current.size === 1 && current.has(type) ? new Set(SAFETY_TYPES.map((item) => item.id)) : new Set([type])))
    }

    const data = useMemo(() => {
        const { ids, from, to, prevFrom, prevTo } = scope
        const all = safetyIn(ids, from, to)
        const allPrev = safetyIn(ids, prevFrom, prevTo)
        const events = all.filter((event) => active.has(event.type))
        const types = SAFETY_TYPES.filter((type) => active.has(type.id))

        const byType = SAFETY_TYPES.map((type) => ({
            ...type,
            count: all.filter((event) => event.type === type.id).length,
            prev: allPrev.filter((event) => event.type === type.id).length,
        }))

        const series = buildBuckets(scope).map((bucket) => {
            const row: Record<string, number | string> = { label: bucket.label }
            for (const type of types) row[type.id] = 0
            for (const event of events) {
                if (event.at >= bucket.from && event.at < bucket.to) row[event.type] = (row[event.type] as number) + 1
            }
            return row
        })

        const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
        for (const event of events) matrix[cityDow(event.at)][cityHour(event.at)] += 1
        let peak = { dow: 0, hour: 0, value: 0 }
        matrix.forEach((row, dow) => row.forEach((value, hour) => { if (value > peak.value) peak = { dow, hour, value } }))

        const perStop = new Map<number, number[]>()
        for (const event of events) {
            const parts = perStop.get(event.stopId) ?? types.map(() => 0)
            parts[types.findIndex((type) => type.id === event.type)] += 1
            perStop.set(event.stopId, parts)
        }
        const ranking: RankRow[] = Array.from(perStop.entries())
            .map(([stopId, parts]) => ({ stop: stopById(stopId), parts, total: parts.reduce((sum, part) => sum + part, 0) }))
            .filter((row) => row.stop)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map((row) => ({ id: row.stop!.id, stop: row.stop!, parts: row.parts, valueText: fmtInt(row.total) }))

        // Длительность — только у закрытых эпизодов: у открытого она ещё растёт.
        const timedTypes = types.filter((type) => TIMED_TYPES.includes(type.id))
        const closed = events.filter((event) => isTimed(event) && event.durationMin !== null)
        const durations = DURATION_BUCKETS.map((bucket, index) => {
            const row: Record<string, number | string> = { label: bucket.label }
            for (const type of timedTypes) {
                row[type.id] = closed.filter((event) => event.type === type.id && (event.durationMin as number) <= bucket.max && (event.durationMin as number) > (DURATION_BUCKETS[index - 1]?.max ?? -1)).length
            }
            return row
        })
        const durationMedians = timedTypes
            .map((type) => ({ type, values: closed.filter((event) => event.type === type.id).map((event) => event.durationMin as number) }))
            .filter((item) => item.values.length > 0)
            .map((item) => ({ label: item.type.label.toLowerCase(), median: median(item.values) }))
        const openEpisodes = events.filter((event) => isTimed(event) && event.durationMin === null).length

        const night = events.filter((event) => cityHour(event.at) >= 22 || cityHour(event.at) < 6).length
        return { events, types, byType, series, matrix, peak, ranking, durations, timedTypes, durationMedians, closedCount: closed.length, openEpisodes, night }
    }, [scope, active])

    const top = data.byType.slice().sort((a, b) => b.count - a.count)[0]
    const total = data.byType.reduce((sum, type) => sum + type.count, 0)

    // Лента уведомлений за тот же период и с теми же видами событий; при выбранных районах или остановках — по их камерам.
    const filtered = scope.stops.length < V_STOPS.length
    const periodNotificationsHref = safetyNotificationsHref(
        { from: new Date(scope.from), to: new Date(scope.to) },
        Array.from(active),
        filtered ? scope.stops.flatMap((stop) => stop.cameras) : [],
    )

    // Длительность как в карточке уведомления: у открытого эпизода — сколько он уже идёт, у разового срабатывания её нет.
    const elapsedMin = (event: VSafetyEvent) => Math.max(1, Math.round((V_NOW - (event.startedAt ?? event.at)) / 60_000))
    const stopColumn = (link: boolean): Column<VSafetyEvent> => ({
        key: "stop",
        header: "Остановка",
        cell: (event) => {
            const stop = stopById(event.stopId)
            if (!stop) return null
            // В окне событий клетки остановка — текстом: второе окно поверх первого не открываем.
            return link ? <StopLink stop={stop} /> : <span className="font-medium">{stop.name}</span>
        },
        value: (event) => stopById(event.stopId)?.name ?? "",
    })
    const columnsWith = (stop: Column<VSafetyEvent>): Column<VSafetyEvent>[] => [
        { key: "at", header: "Время", cell: (event) => <span className="whitespace-nowrap tabular-nums">{fmtDateTime(event.at)}</span>, value: (event) => event.at, exportValue: (event) => fmtDateTime(event.at) },
        { key: "type", header: "Вид", cell: (event) => <TypeMark type={event.type} />, value: (event) => TYPE_LABEL[event.type] },
        stop,
        {
            key: "duration",
            header: "Длительность",
            align: "right",
            cell: (event) => !isTimed(event)
                ? <span className="text-muted-foreground" title="Разовое срабатывание: длительности нет">—</span>
                : event.durationMin === null
                    ? <StatusBadge tone="high">идёт {fmtDuration(elapsedMin(event) * 60_000)}</StatusBadge>
                    : <span className="whitespace-nowrap">{fmtDuration(event.durationMin * 60_000)}</span>,
            value: (event) => !isTimed(event) ? -1 : event.durationMin ?? elapsedMin(event),
            exportValue: (event) => !isTimed(event) ? "" : event.durationMin === null ? `идёт ${fmtDuration(elapsedMin(event) * 60_000)}` : fmtDuration(event.durationMin * 60_000),
        },
        { key: "camera", header: "Камера", align: "right", cell: (event) => event.camera ?? "—", value: (event) => event.camera ?? -1, exportValue: (event) => event.camera ?? "" },
        {
            key: "open",
            header: "Уведомления",
            align: "right",
            cell: (event) => (
                <Button asChild variant="ghost" size="sm" className="h-8">
                    <a href={eventNotificationsHref(event)} target="_blank" rel="noopener noreferrer">
                        Открыть
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </Button>
            ),
        },
    ]
    const columns = columnsWith(stopColumn(true))
    const cellColumns = columnsWith(stopColumn(false))
    const cellEvents = cell ? data.events.filter((event) => cityDow(event.at) === cell.dow && cityHour(event.at) === cell.hour) : []
    const medianText = data.durationMedians.map((item) => `${item.label} — ${fmtDuration(item.median * 60_000)}`).join(", ")

    return (
        <SectionShell
            title="События безопасности"
            filters={
                <div className="flex flex-wrap gap-1.5">
                    {SAFETY_TYPES.map((type) => {
                        const on = active.has(type.id)
                        return (
                            <Button
                                key={type.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-pressed={on}
                                className={cn("gap-2 font-normal", on ? "border-primary/40 bg-primary/10" : "text-muted-foreground opacity-70")}
                                onClick={() => toggle(type.id)}
                            >
                                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: on ? type.color : "transparent", boxShadow: on ? undefined : `inset 0 0 0 1.5px ${type.color}` }} />
                                {type.label}
                            </Button>
                        )
                    })}
                </div>
            }
        >
            <Insight>
                <span className="font-medium">{phrase}:</span>{" "}
                {total === 0
                    ? "событий безопасности не было."
                    : <>чаще всего встречается «{top.label.toLowerCase()}» — {fmtInt(top.count)} из {fmtInt(total)}. {data.ranking[0]?.stop ? `Больше всего событий на остановке «${data.ranking[0].stop.name}» (${data.ranking[0].valueText}). ` : ""}{data.peak.value > 0 ? `Самое неспокойное время — ${DOW_LABELS[data.peak.dow].toLowerCase()}, ${String(data.peak.hour).padStart(2, "0")}:00. ` : ""}Ночью, с 22 до 6, произошло {fmtInt(data.night)} из {fmtInt(data.events.length)} событий.</>}
            </Insight>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {data.byType.map((type) => (
                    <KpiCard
                        key={type.id}
                        title={type.label}
                        value={fmtInt(type.count)}
                        icon={TYPE_ICONS[type.id]}
                        delta={makeDelta(type.count, type.prev, { kind: "count", goodWhen: "down" })}
                        deltaLabel={scope.prevLabel}
                        detail={active.size === 1 && active.has(type.id) ? "Показан только этот вид" : undefined}
                        onClick={() => only(type.id)}
                    />
                ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-6" title="Что и сколько происходит?" icon={BarChart3} iconClassName="text-blue-500" hint={scope.hourly ? "События по часам с разбивкой по видам" : "События по дням с разбивкой по видам"}>
                    <ChartContainer config={typeConfig} className="h-[320px] w-full">
                        <BarChart data={data.series} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={28} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
                            {data.types.map((type, index) => (
                                <Bar key={type.id} dataKey={type.id} stackId="all" fill={`var(--color-${type.id})`} stroke="var(--card)" strokeWidth={1} radius={index === data.types.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} isAnimationActive={false} />
                            ))}
                        </BarChart>
                    </ChartContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-6" title="В какие дни и часы это случается?" icon={CalendarClock} iconClassName="text-amber-500" hint="Чем темнее клетка, тем больше событий. Нажмите на клетку, чтобы увидеть события этого часа.">
                    <WeekHourHeatmap matrix={data.matrix} unit="событий" onCellClick={(dow, hour) => setCell({ dow, hour })} />
                </ChartCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-7" title="На каких остановках больше всего событий?" icon={MapPin} iconClassName="text-violet-500" hint="Десять остановок с наибольшим числом событий">
                    <RankList rows={data.ranking} colors={data.types.map((type) => type.color)} legend={data.types.map((type) => type.label)} />
                </ChartCard>

                <ChartCard
                    className="xl:col-span-5"
                    title="Сколько длятся эпизоды?"
                    icon={Timer}
                    iconClassName="text-red-500"
                    hint={data.closedCount > 0
                        ? `От начала до закрытия эпизода, по видам событий. Медиана: ${medianText}.${data.openEpisodes > 0 ? ` Ещё не закрыто: ${fmtInt(data.openEpisodes)}.` : ""}`
                        : "От начала до закрытия эпизода, по видам событий"}
                >
                    {data.timedTypes.length === 0 ? (
                        <EmptyNote>У выбранных видов событий нет длительности: это разовые срабатывания</EmptyNote>
                    ) : data.closedCount === 0 ? (
                        <EmptyNote>За период закрытых эпизодов не было</EmptyNote>
                    ) : (
                        <ChartContainer config={typeConfig} className="h-[300px] w-full">
                            <BarChart data={data.durations} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={28} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
                                {data.timedTypes.map((type) => (
                                    <Bar key={type.id} dataKey={type.id} fill={`var(--color-${type.id})`} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                                ))}
                            </BarChart>
                        </ChartContainer>
                    )}
                </ChartCard>
            </div>

            <ChartCard
                title="Все события за период"
                icon={ShieldAlert}
                iconClassName="text-red-500"
                action={
                    <Button asChild variant="outline" size="sm" className="gap-2">
                        <a href={periodNotificationsHref} target="_blank" rel="noopener noreferrer">
                            <Bell className="h-4 w-4" />
                            Уведомления
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </Button>
                }
            >
                <DataTable
                    columns={columns}
                    rows={data.events}
                    rowKey={(event) => event.id}
                    search={(event) => `${stopById(event.stopId)?.name ?? ""} ${TYPE_LABEL[event.type]} ${districtName(stopById(event.stopId)?.districtId ?? "")} ${event.camera}`}
                    searchPlaceholder="Остановка, вид события или камера"
                    exportName="События безопасности"
                />
            </ChartCard>

            <Dialog open={cell !== null} onOpenChange={(open) => { if (!open) setCell(null) }}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                    {cell && (
                        <>
                            <DialogHeader>
                                <DialogTitle>{DOW_FULL[cell.dow]}, {hourSpan(cell.hour)}</DialogTitle>
                                <DialogDescription>
                                    {phrase}: {fmtInt(cellEvents.length)} {plural(cellEvents.length, ["событие", "события", "событий"])} в этот день недели и час. Кнопка «Открыть» ведёт в уведомление с кадрами.
                                </DialogDescription>
                            </DialogHeader>
                            <DataTable
                                columns={cellColumns}
                                rows={cellEvents}
                                rowKey={(event) => event.id}
                                initialSort={{ key: "at", dir: "desc" }}
                                pageSize={8}
                            />
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </SectionShell>
    )
}
