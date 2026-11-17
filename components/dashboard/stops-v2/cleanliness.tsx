"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { AlertCircle, Bell, CalendarClock, CheckCircle2, Clock3, ExternalLink, Repeat, Trash2, TrendingDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import {
    DAY,
    HOUR,
    V_NORMS,
    V_NOW,
    cityDayStart,
    cityDow,
    cityHour,
    districtName,
    fmtDateTime,
    fmtDay,
    fmtDuration,
    fmtInt,
    fmtNum,
    median,
    plural,
    stopById,
    type VBinEpisode,
} from "@/lib/mock/stop-analytics-vision-data"
import { CATEGORY_COLORS, binDurationMs, binStats, binsIn, binsOpenNow } from "@/components/dashboard/stops-v2/selectors"
import {
    ChartCard,
    DataTable,
    EmptyNote,
    FrameThumb,
    Insight,
    KpiCard,
    RankList,
    SectionShell,
    Segmented,
    StatusBadge,
    StopLink,
    WeekHourHeatmap,
    makeDelta,
    usePeriodPhrase,
    useScope,
    type Column,
    type RankRow,
} from "@/components/dashboard/stops-v2/kit"

const trendConfig = { hours: { label: "Время до уборки, ч", color: CATEGORY_COLORS.clean } } satisfies ChartConfig

type EpisodeFilter = "all" | "late" | "open"

function episodeState(episode: VBinEpisode): { tone: "success" | "attention" | "high"; label: string } {
    const late = binDurationMs(episode) > V_NORMS.binHours * HOUR
    if (episode.endAt === null) return { tone: late ? "high" : "attention", label: "не убрано" }
    return late ? { tone: "high", label: "с опозданием" } : { tone: "success", label: "в срок" }
}

export function StopsCleanliness() {
    const scope = useScope()
    const phrase = usePeriodPhrase()
    const [filter, setFilter] = useState<EpisodeFilter>("all")

    const data = useMemo(() => {
        const { ids, from, to, prevFrom, prevTo } = scope
        const openNow = binsOpenNow(ids)
        const lateNow = openNow.filter((episode) => V_NOW - episode.startAt > V_NORMS.binHours * HOUR)
        const stats = binStats(ids, from, to)
        const prev = binStats(ids, prevFrom, prevTo)

        // Короткий период показывается на фоне последних двух недель, иначе линия из одной точки.
        const trendFrom = Math.min(cityDayStart(from), cityDayStart(to) - 13 * DAY)
        const trend: { label: string; hours: number | null }[] = []
        for (let ts = trendFrom; ts < to; ts += DAY) {
            const closed = binsIn(ids, ts, ts + DAY).filter((episode) => episode.endAt !== null)
            trend.push({ label: fmtDay(ts), hours: closed.length ? Number((median(closed.map(binDurationMs)) / HOUR).toFixed(1)) : null })
        }

        const perStop = new Map<number, { count: number; ms: number }>()
        for (const episode of stats.episodes) {
            const row = perStop.get(episode.stopId) ?? { count: 0, ms: 0 }
            row.count += 1
            row.ms += binDurationMs(episode)
            perStop.set(episode.stopId, row)
        }
        const ranking: RankRow[] = Array.from(perStop.entries())
            .map(([stopId, row]) => ({ stop: stopById(stopId), ...row }))
            .filter((row) => row.stop)
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 10)
            .map((row) => ({
                id: row.stop!.id,
                stop: row.stop!,
                parts: [row.ms / HOUR],
                valueText: `${row.count} ${plural(row.count, ["раз", "раза", "раз"])} · ${fmtNum(row.ms / HOUR)} ч`,
            }))

        const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
        for (const episode of stats.episodes) {
            const end = episode.endAt ?? V_NOW
            for (let ts = Math.floor(episode.startAt / HOUR) * HOUR; ts < end; ts += HOUR) matrix[cityDow(ts)][cityHour(ts)] += 1
        }

        return { openNow, lateNow, stats, prev, trend, ranking, matrix, repeatStop: ranking[0] }
    }, [scope])

    const rows = useMemo(() => {
        const list = data.stats.episodes
        if (filter === "late") return list.filter((episode) => binDurationMs(episode) > V_NORMS.binHours * HOUR)
        if (filter === "open") return list.filter((episode) => episode.endAt === null)
        return list
    }, [data.stats.episodes, filter])

    const medianLate = data.stats.medianMs > V_NORMS.binHours * HOUR

    const columns: Column<VBinEpisode>[] = [
        { key: "stop", header: "Остановка", cell: (episode) => { const stop = stopById(episode.stopId); return stop ? <StopLink stop={stop} /> : null }, value: (episode) => stopById(episode.stopId)?.name ?? "" },
        { key: "start", header: "Начало", cell: (episode) => <span className="whitespace-nowrap tabular-nums">{fmtDateTime(episode.startAt)}</span>, value: (episode) => episode.startAt },
        { key: "end", header: "Убрано", cell: (episode) => <span className="whitespace-nowrap tabular-nums">{episode.endAt ? fmtDateTime(episode.endAt) : "—"}</span>, value: (episode) => episode.endAt ?? V_NOW },
        { key: "duration", header: "Длительность", align: "right", cell: (episode) => <span className="font-medium">{fmtDuration(binDurationMs(episode))}</span>, value: (episode) => Math.round(binDurationMs(episode) / 60_000) },
        { key: "state", header: "Норматив", cell: (episode) => { const state = episodeState(episode); return <StatusBadge tone={state.tone}>{state.label}</StatusBadge> }, value: (episode) => episodeState(episode).label },
        { key: "confirmations", header: "Подтверждения", align: "right", cell: (episode) => fmtInt(episode.confirmations), value: (episode) => episode.confirmations },
        { key: "frames", header: "Кадры", cell: (episode) => <span className="flex gap-1.5"><FrameThumb label="до" />{episode.endAt && <FrameThumb label="после" />}</span> },
    ]

    return (
        <SectionShell title="Чистота">
            <Insight>
                {data.openNow.length > 0
                    ? `Сейчас ${plural(data.openNow.length, ["переполнена", "переполнены", "переполнено"])} ${data.openNow.length} ${plural(data.openNow.length, ["урна", "урны", "урн"])}, из них ${data.lateNow.length} дольше нормы. `
                    : "Сейчас переполненных урн нет. "}
                {data.stats.closedCount > 0
                    ? `${phrase} урны убирали за ${fmtDuration(data.stats.medianMs)} при норме ${V_NORMS.binHours} ч, в срок убрано ${fmtNum(data.stats.inNormPct, 0)} %. `
                    : data.stats.count > 0 ? `${phrase} ни одну переполненную урну ещё не убрали. ` : `${phrase} переполнений не было. `}
                {data.repeatStop?.stop && `Дольше всего урна стояла полной на остановке «${data.repeatStop.stop.name}»: ${data.repeatStop.valueText}.`}
            </Insight>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="Переполнено сейчас"
                    value={fmtInt(data.openNow.length)}
                    icon={Trash2}
                    tone={data.lateNow.length > 0 ? "high" : data.openNow.length > 0 ? "attention" : "success"}
                    detail={data.lateNow.length > 0 ? `${data.lateNow.length} дольше нормы ${V_NORMS.binHours} ч` : "Дольше нормы нет"}
                />
                <KpiCard
                    title="Время до уборки, медиана"
                    value={data.stats.closedCount ? fmtDuration(data.stats.medianMs) : "—"}
                    icon={Clock3}
                    tone={data.stats.closedCount === 0 ? "normal" : medianLate ? "high" : "success"}
                    delta={data.stats.closedCount && data.prev.closedCount ? makeDelta(data.stats.medianMs, data.prev.medianMs, { kind: "duration", goodWhen: "down" }) : undefined}
                    deltaLabel={scope.prevLabel}
                    detail={`Норматив ${V_NORMS.binHours} ч`}
                />
                <KpiCard
                    title="Убрано в срок"
                    value={data.stats.closedCount ? `${fmtNum(data.stats.inNormPct, 0)} %` : "—"}
                    icon={CheckCircle2}
                    tone={data.stats.closedCount === 0 ? "normal" : data.stats.inNormPct < 70 ? "attention" : "success"}
                    delta={data.stats.closedCount && data.prev.closedCount ? makeDelta(data.stats.inNormPct, data.prev.inNormPct, { kind: "points", goodWhen: "up" }) : undefined}
                    deltaLabel={scope.prevLabel}
                />
                <KpiCard
                    title="Переполнений за период"
                    value={fmtInt(data.stats.count)}
                    icon={AlertCircle}
                    delta={makeDelta(data.stats.count, data.prev.count, { kind: "count", goodWhen: "down" })}
                    deltaLabel={scope.prevLabel}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-5" title="Где переполнено сейчас?" icon={Trash2} iconClassName="text-red-500" hint="Самые долгие сверху">
                    {data.openNow.length === 0 ? (
                        <EmptyNote>Сейчас все урны в порядке</EmptyNote>
                    ) : (
                        <div className="space-y-2">
                            {data.openNow.map((episode) => {
                                const stop = stopById(episode.stopId)
                                if (!stop) return null
                                const late = V_NOW - episode.startAt > V_NORMS.binHours * HOUR
                                return (
                                    <div key={episode.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                                        <FrameThumb />
                                        <div className="min-w-0 flex-1">
                                            <StopLink stop={stop} />
                                        </div>
                                        <div className="hidden text-right text-xs text-muted-foreground sm:block">
                                            с {fmtDateTime(episode.startAt)}
                                        </div>
                                        <StatusBadge tone={late ? "high" : "attention"}>{fmtDuration(V_NOW - episode.startAt)}</StatusBadge>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </ChartCard>

                <ChartCard
                    className="xl:col-span-7"
                    title="Убирают быстрее или медленнее?"
                    icon={TrendingDown}
                    iconClassName="text-emerald-500"
                    hint="Медианное время от фиксации переполнения до пустой урны, по дням"
                >
                    <ChartContainer config={trendConfig} className="h-[300px] w-full">
                        <LineChart data={data.trend} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={44} unit=" ч" allowDecimals={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ReferenceLine
                                y={V_NORMS.binHours}
                                stroke="var(--muted-foreground)"
                                strokeDasharray="5 4"
                                label={{ value: `норматив ${V_NORMS.binHours} ч`, position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
                            />
                            <Line dataKey="hours" stroke="var(--color-hours)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-hours)" }} type="monotone" connectNulls isAnimationActive={false} />
                        </LineChart>
                    </ChartContainer>
                </ChartCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-5" title="Где это повторяется?" icon={Repeat} iconClassName="text-amber-500" hint="Часы, которые урна простояла переполненной. Кандидаты на вторую урну или частый вывоз.">
                    <RankList rows={data.ranking} colors={[CATEGORY_COLORS.clean]} />
                </ChartCard>

                <ChartCard className="xl:col-span-7" title="Когда урны переполнены?" icon={CalendarClock} iconClassName="text-blue-500" hint="Сверяется с графиком вывоза: тёмные клетки — время, когда урны стоят полными.">
                    <WeekHourHeatmap matrix={data.matrix} unit="урн" />
                </ChartCard>
            </div>

            <ChartCard
                title="Эпизоды переполнения"
                icon={Clock3}
                iconClassName="text-sky-500"
                action={
                    <Button variant="outline" size="sm" className="gap-2">
                        <Bell className="h-4 w-4" />
                        Уведомления
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                }
            >
                <DataTable
                    columns={columns}
                    rows={rows}
                    rowKey={(episode) => episode.id}
                    search={(episode) => `${stopById(episode.stopId)?.name ?? ""} ${districtName(stopById(episode.stopId)?.districtId ?? "")}`}
                    searchPlaceholder="Остановка или микрорайон"
                    exportName="epizody-perepolneniya"
                    toolbar={
                        <Segmented<EpisodeFilter>
                            value={filter}
                            onChange={setFilter}
                            options={[
                                { value: "all", label: "Все" },
                                { value: "late", label: "Дольше нормы" },
                                { value: "open", label: "Не убрано" },
                            ]}
                        />
                    }
                />
            </ChartCard>
        </SectionShell>
    )
}
