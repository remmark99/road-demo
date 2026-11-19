"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { AlertTriangle, Clock3, ShieldAlert, Snowflake, Thermometer, ThermometerSnowflake, Wrench } from "lucide-react"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    DAY,
    HOUR,
    V_NORMS,
    V_NOW,
    V_STOPS,
    climateAt,
    fmtDateTime,
    fmtDay,
    fmtDuration,
    fmtInt,
    fmtTime,
    median,
    plural,
    stopById,
    type VStop,
} from "@/lib/mock/stop-analytics-vision-data"
import { buildBuckets, climateNow, climateSummary, fmtTemp, safetyIn } from "@/components/dashboard/stops-v2/selectors"
import {
    ChartCard,
    DataTable,
    EmptyNote,
    FrameThumb,
    Insight,
    KpiCard,
    SectionShell,
    StatusBadge,
    StopLink,
    makeDelta,
    usePeriodPhrase,
    useScope,
    useVision,
    type Column,
} from "@/components/dashboard/stops-v2/kit"

const tempConfig = {
    stop: { label: "Выбранная остановка", color: "#2563eb" },
    city: { label: "Медиана по городу", color: "#ea580c" },
} satisfies ChartConfig

const outConfig = { stops: { label: "Остановок вне нормы", color: "#8b5cf6" } } satisfies ChartConfig

interface FaultRow {
    key: string
    stop: VStop
    sensor: string
    problem: string
    since: string
    tone: "high" | "attention"
}

function faultRows(stops: VStop[]): FaultRow[] {
    const rows: FaultRow[] = []
    for (const stop of stops) {
        if (stop.sensorFault === "silent") rows.push({ key: `${stop.id}-c`, stop, sensor: "Температура и влажность", problem: "Датчик молчит", since: fmtDateTime(V_NOW - 20 * DAY), tone: "high" })
        if (stop.sensorFault === "empty") rows.push({ key: `${stop.id}-c`, stop, sensor: "Температура и влажность", problem: "Отдаёт пустое значение", since: fmtDateTime(V_NOW - 27 * DAY), tone: "high" })
        if (stop.glassFault === "stuck") rows.push({ key: `${stop.id}-g`, stop, sensor: "Стекло", problem: "Вход замкнут дольше 30 мин", since: fmtDateTime(V_NOW - (stop.id % 9 + 2) * HOUR), tone: "attention" })
        if (stop.glassFault === "noisy") rows.push({ key: `${stop.id}-g`, stop, sensor: "Стекло", problem: `Шумит: ${40 + (stop.id % 60)} срабатываний за сутки`, since: fmtDateTime(V_NOW - (stop.id % 5 + 1) * DAY), tone: "attention" })
    }
    return rows
}

export function StopsSensors() {
    const scope = useScope()
    const phrase = usePeriodPhrase()
    const { stopIds } = useVision()

    const data = useMemo(() => {
        const { ids, stops, from, to, prevFrom, prevTo } = scope
        const nowRows = climateNow(stops)
        const summary = climateSummary(stops, from, to)
        const prev = climateSummary(stops, prevFrom, prevTo)
        const outNow = nowRows
            .filter((row) => row.out)
            .sort((a, b) => (a.since ?? V_NOW) - (b.since ?? V_NOW))
            .map((row) => ({ ...row, hours: summary.outHours.get(row.stop.id) ?? 0, min: summary.minTemp.get(row.stop.id) ?? null }))

        // На графике — выбранная остановка, а без выбора та, что дольше всех была вне нормы.
        const worstId = Array.from(summary.outHours.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
        const focus = (stopIds.length ? stopById(stopIds[0]) : undefined) ?? (worstId !== undefined ? stopById(worstId) : undefined) ?? stops[0]

        const step = scope.hourly ? HOUR : to - from <= 8 * DAY ? 3 * HOUR : 12 * HOUR
        const tempRows: { label: string; stop: number | null; city: number | null }[] = []
        for (let ts = Math.ceil(from / step) * step; ts < Math.min(to, V_NOW); ts += step) {
            const all = V_STOPS.map((stop) => climateAt(stop, ts).temp).filter((value): value is number => value !== null)
            tempRows.push({
                label: scope.hourly ? fmtTime(ts) : `${fmtDay(ts)} ${fmtTime(ts)}`,
                stop: focus ? climateAt(focus, ts).temp : null,
                city: all.length ? Number(median(all).toFixed(1)) : null,
            })
        }

        const outSeries = buildBuckets(scope).map((bucket) => {
            const points = summary.perHour.filter((point) => point.ts >= bucket.from && point.ts < bucket.to)
            return { label: bucket.label, stops: points.length ? Math.max(...points.map((point) => point.stops)) : 0 }
        })

        const glass = safetyIn(ids, from, to, new Set(["glass_break"]))
        const faults = faultRows(stops)
        return { nowRows, summary, prev, outNow, focus, tempRows, outSeries, glass, faults }
    }, [scope, stopIds])

    const confirmed = data.glass.filter((event) => event.verdict === "confirmed").length
    const longest = data.outNow[0]

    const faultColumns: Column<FaultRow>[] = [
        { key: "stop", header: "Остановка", cell: (row) => <StopLink stop={row.stop} />, value: (row) => row.stop.name },
        { key: "sensor", header: "Датчик", cell: (row) => row.sensor, value: (row) => row.sensor },
        { key: "problem", header: "Что не так", cell: (row) => <StatusBadge tone={row.tone}>{row.problem}</StatusBadge>, value: (row) => row.problem },
        { key: "since", header: "С какого времени", cell: (row) => <span className="whitespace-nowrap tabular-nums">{row.since}</span>, value: (row) => row.since },
    ]

    return (
        <SectionShell title="Датчики">
            <Insight>
                {data.outNow.length > 0
                    ? `Сейчас вне нормы ${data.outNow.length} ${plural(data.outNow.length, ["остановка", "остановки", "остановок"])}${longest?.since ? `, дольше всего — «${longest.stop.name}» (${fmtDuration(V_NOW - longest.since)})` : ""}. `
                    : "Сейчас все павильоны в норме. "}
                {phrase} набралось {fmtInt(data.summary.totalHours)} {plural(data.summary.totalHours, ["час", "часа", "часов"])} вне нормы.
                {data.faults.length > 0 && ` ${data.faults.length} ${plural(data.faults.length, ["датчик требует", "датчика требуют", "датчиков требуют"])} обслуживания: их показаниям нельзя доверять.`}
            </Insight>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="Вне нормы сейчас"
                    value={fmtInt(data.outNow.length)}
                    icon={ThermometerSnowflake}
                    tone={data.outNow.length > 0 ? "high" : "success"}
                    detail={`Норма от +${V_NORMS.tempMin} до +${V_NORMS.tempMax} °C, влажность до ${V_NORMS.humidityMax} %`}
                />
                <KpiCard
                    title="Часов вне нормы за период"
                    value={fmtInt(data.summary.totalHours)}
                    icon={Clock3}
                    tone={data.summary.totalHours > 0 ? "attention" : "success"}
                    delta={makeDelta(data.summary.totalHours, data.prev.totalHours, { kind: "count", goodWhen: "down" })}
                    deltaLabel={scope.prevLabel}
                />
                <KpiCard
                    title="Срабатываний стекла"
                    value={fmtInt(data.glass.length)}
                    icon={ShieldAlert}
                    tone={confirmed > 0 ? "high" : "normal"}
                    detail={`${confirmed} подтверждено камерой`}
                />
                <KpiCard
                    title="Датчиков требуют обслуживания"
                    value={fmtInt(data.faults.length)}
                    icon={Wrench}
                    tone={data.faults.length > 0 ? "attention" : "success"}
                    detail="Молчат, залипли или шумят"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-6" title="Где сейчас вне нормы?" expandable icon={Snowflake} iconClassName="text-sky-500" hint="Сюда нужно отправить электрика или обслуживающую бригаду">
                    {data.outNow.length === 0 ? (
                        <EmptyNote>Все павильоны в норме</EmptyNote>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Остановка</TableHead>
                                    <TableHead className="text-right">Сейчас</TableHead>
                                    <TableHead className="text-right">Влажность</TableHead>
                                    <TableHead className="text-right">Вне нормы</TableHead>
                                    <TableHead className="text-right">Минимум</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.outNow.map((row) => (
                                    <TableRow key={row.stop.id}>
                                        <TableCell><StopLink stop={row.stop} sub={row.reason} /></TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">{fmtTemp(row.temp)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.humidity === null ? "—" : `${row.humidity} %`}</TableCell>
                                        <TableCell className="text-right">
                                            <StatusBadge tone={row.since !== null && V_NOW - row.since > 6 * HOUR ? "high" : "attention"}>{row.since !== null ? fmtDuration(V_NOW - row.since) : "—"}</StatusBadge>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{fmtTemp(row.min)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </ChartCard>

                <ChartCard
                    className="xl:col-span-6"
                    title="Что было с температурой?"
                    icon={Thermometer}
                    iconClassName="text-orange-500"
                    hint={data.focus ? `Остановка «${data.focus.name}» рядом с медианой по городу. Другую можно выбрать в поиске.` : undefined}
                >
                    <ChartContainer config={tempConfig} className="h-[300px] w-full">
                        <LineChart data={data.tempRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={44} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={44} domain={[(min: number) => Math.floor(Math.min(min, V_NORMS.tempMin - 2)), (max: number) => Math.ceil(max + 1)]} allowDecimals={false} unit="°" />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <ReferenceLine
                                y={V_NORMS.tempMin}
                                stroke="var(--muted-foreground)"
                                strokeDasharray="5 4"
                                label={{ value: `норма +${V_NORMS.tempMin} °C`, position: "insideBottomRight", fontSize: 11, fill: "var(--muted-foreground)" }}
                            />
                            <Line dataKey="city" stroke="var(--color-city)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                            <Line dataKey="stop" stroke="var(--color-stop)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} connectNulls={false} />
                        </LineChart>
                    </ChartContainer>
                </ChartCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard
                    className="xl:col-span-7"
                    title="Это одна остановка или весь город?"
                    icon={AlertTriangle}
                    iconClassName="text-violet-500"
                    hint="Сколько остановок одновременно было вне нормы. Всплеск означает мороз или отключение электричества."
                >
                    <ChartContainer config={outConfig} className="h-[280px] w-full">
                        <BarChart data={data.outSeries} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={28} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="stops" fill="var(--color-stops)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                        </BarChart>
                    </ChartContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-5" title="Что со стеклом?" icon={ShieldAlert} iconClassName="text-rose-500" hint="Каждое срабатывание датчика проверяется по камерам остановки">
                    {data.glass.length === 0 ? (
                        <EmptyNote>Срабатываний за период не было</EmptyNote>
                    ) : (
                        <div className="space-y-2">
                            {data.glass.slice(0, 6).map((event) => {
                                const stop = stopById(event.stopId)
                                if (!stop) return null
                                return (
                                    <div key={event.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                                        <FrameThumb />
                                        <div className="min-w-0 flex-1"><StopLink stop={stop} sub={fmtDateTime(event.at)} /></div>
                                        {event.verdict === "confirmed" && <StatusBadge tone="high">Подтверждено</StatusBadge>}
                                        {event.verdict === "rejected" && <StatusBadge tone="muted">Не подтвердилось</StatusBadge>}
                                        {event.verdict === "pending" && <StatusBadge tone="attention">Проверяется</StatusBadge>}
                                    </div>
                                )
                            })}
                            {data.glass.length > 6 && <p className="text-xs text-muted-foreground">Ещё {data.glass.length - 6} — в разделе «События безопасности»</p>}
                        </div>
                    )}
                </ChartCard>
            </div>

            <ChartCard title="Каким датчикам нельзя доверять?" icon={Wrench} iconClassName="text-amber-500" hint="Готовый список для подрядчика, который обслуживает датчики">
                <DataTable
                    columns={faultColumns}
                    rows={data.faults}
                    rowKey={(row) => row.key}
                    search={(row) => `${row.stop.name} ${row.sensor} ${row.problem}`}
                    searchPlaceholder="Остановка или неисправность"
                    exportName="neispravnye-datchiki"
                />
            </ChartCard>
        </SectionShell>
    )
}
