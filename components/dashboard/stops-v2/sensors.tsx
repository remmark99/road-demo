"use client"

import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { CalendarRange, Clock3, ShieldAlert, Snowflake, Thermometer, ThermometerSnowflake, Wrench } from "lucide-react"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    DAY,
    HOUR,
    V_NORMS,
    V_NOW,
    V_OUTAGES,
    V_STOPS,
    climateAt,
    climateOutOfNorm,
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
    HeatScale,
    Insight,
    KpiCard,
    SectionShell,
    StatusBadge,
    StopLink,
    heatClass,
    makeDelta,
    usePeriodPhrase,
    useScope,
    useVision,
    type Column,
} from "@/components/dashboard/stops-v2/kit"
import { cn } from "@/lib/utils"

const tempConfig = {
    stop: { label: "Выбранная остановка", color: "#2563eb" },
    city: { label: "Медиана по городу", color: "#ea580c" },
} satisfies ChartConfig

interface FaultRow {
    key: string
    stop: VStop
    sensor: string
    problem: string
    /** Последние данные от датчика; null — за весь месяц истории ни одного показания. */
    lastAt: number | null
    tone: "high" | "attention"
}

const NO_LINK = "Нет связи с контроллером"
const SILENT = "Контроллер на связи, датчик не присылает показания"

function faultRows(stops: VStop[]): FaultRow[] {
    const rows: FaultRow[] = []
    for (const stop of stops) {
        if (stop.sensorFault === "silent") {
            // Если пропал весь контроллер, чинить надо связь или питание, а не сам датчик.
            const noLink = V_OUTAGES.some((outage) => outage.stopId === stop.id && outage.device === "controller" && outage.endAt === null)
            const lastAt = stop.sensorLastAt === undefined ? V_NOW - 20 * DAY : stop.sensorLastAt
            rows.push({ key: `${stop.id}-c`, stop, sensor: "Температура и влажность", problem: noLink ? NO_LINK : SILENT, lastAt, tone: "high" })
        }
        if (stop.sensorFault === "empty") rows.push({ key: `${stop.id}-c`, stop, sensor: "Температура и влажность", problem: "Отдаёт пустое значение", lastAt: V_NOW - 27 * DAY, tone: "high" })
        if (stop.glassFault === "stuck") rows.push({ key: `${stop.id}-g`, stop, sensor: "Стекло", problem: "Вход замкнут дольше 30 мин", lastAt: V_NOW - (stop.id % 9 + 2) * HOUR, tone: "attention" })
        if (stop.glassFault === "noisy") rows.push({ key: `${stop.id}-g`, stop, sensor: "Стекло", problem: `Шумит: ${40 + (stop.id % 60)} срабатываний за сутки`, lastAt: V_NOW - (stop.id % 5 + 1) * DAY, tone: "attention" })
    }
    return rows
}

/** «10 — нет связи с контроллером, 4 — датчик молчит»: из чего сложилось число на плитке. */
function faultBreakdown(rows: FaultRow[]) {
    const short: Record<string, string> = { [NO_LINK]: "нет связи с контроллером", [SILENT]: "датчик молчит" }
    const counts = new Map<string, number>()
    for (const row of rows) {
        const label = short[row.problem] ?? (row.sensor === "Стекло" ? "датчик стекла сбоит" : "пустые показания")
        counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => `${count} — ${label}`).join(", ")
}

function lastText(lastAt: number | null) {
    return lastAt === null ? "Больше месяца назад" : fmtDateTime(lastAt)
}

/** Остановки, которые хоть раз выходили за норму, по дням (или часам) периода. */
interface OutMatrixRow {
    stop: VStop
    hours: number
    values: number[]
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

        // Строка — остановка, столбец — день: сплошная строка значит беда конкретного павильона,
        // сплошной столбец — мороз или отключение сразу по городу.
        const buckets = buildBuckets(scope)
        const outRows: OutMatrixRow[] = Array.from(summary.outHours.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([stopId, hours]) => {
                const stop = stopById(stopId)
                if (!stop) return null
                const values = buckets.map((bucket) => {
                    let count = 0
                    for (let ts = Math.ceil(bucket.from / HOUR) * HOUR; ts < Math.min(bucket.to, V_NOW); ts += HOUR) {
                        if (climateOutOfNorm(climateAt(stop, ts))) count += 1
                    }
                    return count
                })
                return { stop, hours, values }
            })
            .filter((row): row is OutMatrixRow => row !== null)
        const outMatrix = { labels: buckets.map((bucket) => bucket.label), rows: outRows }

        const glass = safetyIn(ids, from, to, new Set(["glass_break"]))
        const faults = faultRows(stops)
        return { nowRows, summary, prev, outNow, focus, tempRows, outMatrix, glass, faults }
    }, [scope, stopIds])

    const confirmed = data.glass.filter((event) => event.verdict === "confirmed").length
    // В живых данных сигнал стекла приходит от контроллера и камерой не проверяется.
    const glassChecked = data.glass.some((event) => event.verdict !== null)
    const longest = data.outNow[0]

    const faultColumns: Column<FaultRow>[] = [
        { key: "stop", header: "Остановка", cell: (row) => <StopLink stop={row.stop} />, value: (row) => row.stop.name },
        { key: "sensor", header: "Датчик", cell: (row) => row.sensor, value: (row) => row.sensor },
        { key: "problem", header: "Что не так", cell: (row) => <StatusBadge tone={row.tone}>{row.problem}</StatusBadge>, value: (row) => row.problem },
        {
            key: "last",
            header: "Последние данные",
            cell: (row) => (
                <div className="whitespace-nowrap tabular-nums">
                    <div>{lastText(row.lastAt)}</div>
                    {row.lastAt !== null && <div className="text-xs text-muted-foreground">{fmtDuration(V_NOW - row.lastAt)} назад</div>}
                </div>
            ),
            value: (row) => row.lastAt ?? 0,
            exportValue: (row) => lastText(row.lastAt),
        },
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
                    title="Сигналов датчика стекла"
                    value={fmtInt(data.glass.length)}
                    icon={ShieldAlert}
                    tone={confirmed > 0 ? "high" : "normal"}
                    detail={glassChecked ? `${confirmed} подтверждено камерой` : "От датчика разбития стекла в павильоне"}
                />
                <KpiCard
                    title="Датчиков не работает"
                    value={fmtInt(data.faults.length)}
                    icon={Wrench}
                    tone={data.faults.length > 0 ? "attention" : "success"}
                    detail={data.faults.length === 0
                        ? "Все датчики присылают показания"
                        : data.faults.every((row) => row.problem === NO_LINK || row.problem === SILENT)
                            ? `Нет показаний больше суток: ${faultBreakdown(data.faults)}`
                            : faultBreakdown(data.faults)}
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
                    title="Где и в какие дни было холодно или сыро?"
                    icon={CalendarRange}
                    iconClassName="text-violet-500"
                    hint={`Часов вне нормы на каждой остановке${scope.hourly ? " по часам" : " по дням"}. Сплошная строка — проблема конкретного павильона, сплошной столбец — мороз или отключение сразу по городу.`}
                    expandable
                >
                    <OutMatrix labels={data.outMatrix.labels} rows={data.outMatrix.rows} hourly={scope.hourly} />
                </ChartCard>

                <ChartCard
                    className="xl:col-span-5"
                    title="Срабатывания датчика стекла"
                    icon={ShieldAlert}
                    iconClassName="text-rose-500"
                    hint={glassChecked
                        ? "Сигнал датчика разбития стекла в павильоне. Каждое срабатывание проверяется по камерам остановки."
                        : "Сигнал датчика разбития стекла в павильоне. Сигнал ещё не значит, что стекло разбито: откройте остановку и посмотрите камеру."}
                >
                    {data.glass.length === 0 ? (
                        <EmptyNote>Срабатываний за период не было</EmptyNote>
                    ) : (
                        <div className="space-y-2">
                            {data.glass.slice(0, 6).map((event) => {
                                const stop = stopById(event.stopId)
                                if (!stop) return null
                                return (
                                    <div key={event.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                                        <div className="min-w-0 flex-1"><StopLink stop={stop} sub={`${fmtDateTime(event.at)} · сигнал датчика`} /></div>
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

            <ChartCard
                title="Неисправные датчики"
                icon={Wrench}
                iconClassName="text-amber-500"
                hint="Датчик попадает в список, если больше суток не присылает показаний. Пока он не работает, климат на остановке не контролируется. Список можно выгрузить в Excel и отдать подрядчику."
            >
                <DataTable
                    columns={faultColumns}
                    rows={data.faults}
                    rowKey={(row) => row.key}
                    search={(row) => `${row.stop.name} ${row.sensor} ${row.problem}`}
                    searchPlaceholder="Остановка или неисправность"
                    exportName="Неисправные датчики"
                />
            </ChartCard>
        </SectionShell>
    )
}

function OutMatrix({ labels, rows, hourly }: { labels: string[]; rows: OutMatrixRow[]; hourly: boolean }) {
    if (rows.length === 0) return <EmptyNote>За период все павильоны были в норме</EmptyNote>
    const max = Math.max(...rows.flatMap((row) => row.values), 1)
    // Подписи столбцов не налезают друг на друга: при длинном периоде — через одну-две.
    const every = labels.length <= 10 ? 1 : labels.length <= 20 ? 2 : labels.length <= 35 ? 3 : 6
    const showValues = labels.length <= 14
    return (
        <div className="space-y-3">
            <div className="overflow-x-auto">
                <div className="grid gap-[3px] text-[11px]" style={{ minWidth: `calc(11rem + ${labels.length * 16}px)`, gridTemplateColumns: `11rem repeat(${labels.length}, minmax(14px, 1fr))` }}>
                    <div />
                    {labels.map((label, index) => (
                        <div key={label} className="truncate pb-0.5 text-center tabular-nums text-muted-foreground">{index % every === 0 ? label : ""}</div>
                    ))}
                    {rows.map((row) => (
                        <div key={row.stop.id} className="contents">
                            <div className="flex min-w-0 items-center pr-2 text-xs"><StopLink stop={row.stop} sub={`${fmtInt(row.hours)} ${plural(row.hours, ["час", "часа", "часов"])} вне нормы`} /></div>
                            {row.values.map((value, index) => (
                                <div
                                    key={labels[index]}
                                    className={cn("flex h-7 items-center justify-center rounded-[4px] tabular-nums", value > 0 ? heatClass(value, max) : "bg-muted/40")}
                                    title={`${row.stop.name}, ${labels[index]} · ${value > 0 ? `${value} ${plural(value, ["час", "часа", "часов"])} вне нормы` : "в норме"}`}
                                >
                                    {showValues && value > 0 && !hourly ? value : ""}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <HeatScale label="часов вне нормы" />
        </div>
    )
}
