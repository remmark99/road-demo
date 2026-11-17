"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, GitCompareArrows, Grid3X3, Plus, Trophy, UserPlus, Users2, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import {
    HOUR,
    V_NOW,
    cityDow,
    cityHour,
    districtName,
    fmtInt,
    fmtNum,
    loadAt,
    peakAt,
    plural,
    hasLoadData,
    stopOfflineAt,
    type VStop,
} from "@/lib/mock/stop-analytics-vision-data"
import { peopleNow } from "@/components/dashboard/stops-v2/selectors"
import {
    ChartCard,
    DataTable,
    HourHeatmap,
    Insight,
    KpiCard,
    RankList,
    SectionShell,
    Segmented,
    StopLink,
    WeekHourHeatmap,
    useScope,
    type Column,
    type RankRow,
} from "@/components/dashboard/stops-v2/kit"

// Цвет закреплён за местом остановки в списке сравнения и не меняется при переключении.
const COMPARE_COLORS = ["#2563eb", "#ea580c", "#0d9488", "#8b5cf6", "#db2777"]

interface StopLoad {
    stop: VStop
    avg: number
    peak: number
    overloadHours: number
    byHour: number[]
}

function hourRange(hour: number) {
    return `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`
}

export function StopsLoad() {
    const scope = useScope()
    const [side, setSide] = useState<"top" | "bottom">("top")
    // Сравнение: до пяти любых остановок, по умолчанию три самые загруженные.
    const [picked, setPicked] = useState<number[] | null>(null)
    // Тепловая карта по страницам: 15 остановок за раз, а не все в одном полотне.
    const [heatPage, setHeatPage] = useState(0)
    const [addOpen, setAddOpen] = useState(false)
    const [addQuery, setAddQuery] = useState("")

    const data = useMemo(() => {
        const { stops, from, to } = scope
        const end = Math.min(to, V_NOW)
        const matrixSum = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
        const matrixCount = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
        const counted = new Set<number>()

        // Только остановки, где камера считает людей: без подсчёта они давали бы нули в рейтингах.
        const perStop: StopLoad[] = stops.filter(hasLoadData).map((stop) => {
            let sum = 0
            let hours = 0
            let peak = 0
            let overloadHours = 0
            const hourSum = Array.from({ length: 24 }, () => 0)
            const hourCount = Array.from({ length: 24 }, () => 0)
            for (let ts = Math.ceil(from / HOUR) * HOUR; ts < end; ts += HOUR) {
                // Пока остановка без связи, людей на ней никто не считает.
                if (stopOfflineAt(stop.id, ts)) continue
                const value = loadAt(stop, ts)
                const top = peakAt(stop, ts)
                const hour = cityHour(ts)
                const dow = cityDow(ts)
                sum += value
                hours += 1
                if (top > peak) peak = top
                if (stop.capacity !== null && top > stop.capacity) overloadHours += 1
                hourSum[hour] += value
                hourCount[hour] += 1
                matrixSum[dow][hour] += value
                if (!counted.has(ts)) {
                    counted.add(ts)
                    matrixCount[dow][hour] += 1
                }
            }
            return {
                stop,
                avg: hours ? sum / hours : 0,
                peak,
                overloadHours,
                byHour: hourSum.map((value, hour) => (hourCount[hour] ? value / hourCount[hour] : 0)),
            }
        })

        const matrix = matrixSum.map((row, dow) => row.map((value, hour) => (matrixCount[dow][hour] ? value / matrixCount[dow][hour] : 0)))
        const network = Array.from({ length: 24 }, (_, hour) => perStop.reduce((sum, row) => sum + row.byHour[hour], 0))
        const morning = network.slice(0, 13).indexOf(Math.max(...network.slice(0, 13)))
        const evening = 13 + network.slice(13).indexOf(Math.max(...network.slice(13)))
        const [firstPeak, secondPeak] = network[morning] >= network[evening] ? [morning, evening] : [evening, morning]

        const sorted = perStop.slice().sort((a, b) => b.avg - a.avg)
        const overloaded = perStop.filter((row) => row.overloadHours > 0).sort((a, b) => b.overloadHours - a.overloadHours)
        const online = stops.filter((stop) => !stopOfflineAt(stop.id, V_NOW)).length
        return { perStop, sorted, matrix, firstPeak, secondPeak, overloaded, online, people: peopleNow(stops) }
    }, [scope])

    const candidates = data.sorted.slice(0, 5)
    const hasCapacity = data.perStop.some((row) => row.stop.capacity !== null)
    const busiestHour = (row: StopLoad) => row.byHour.indexOf(Math.max(...row.byHour))
    const allColumns: Column<StopLoad>[] = [
        { key: "stop", header: "Остановка", cell: (row) => <StopLink stop={row.stop} />, value: (row) => row.stop.name },
        { key: "district", header: "Микрорайон", cell: (row) => districtName(row.stop.districtId), value: (row) => districtName(row.stop.districtId) },
        { key: "avg", header: "В среднем, чел.", align: "right", cell: (row) => fmtNum(row.avg), value: (row) => Math.round(row.avg * 10) / 10 },
        { key: "peak", header: "Пик, чел.", align: "right", cell: (row) => fmtInt(row.peak), value: (row) => row.peak },
        { key: "hour", header: "Самый загруженный час", align: "right", cell: (row) => row.avg > 0 ? `${String(busiestHour(row)).padStart(2, "0")}:00` : "—", value: (row) => busiestHour(row) },
    ]
    const byId = new Map(data.perStop.map((row) => [row.stop.id, row]))
    const chosenIds = (picked ?? candidates.slice(0, 3).map((row) => row.stop.id)).filter((id) => byId.has(id))
    const chosenRows = chosenIds.map((id) => byId.get(id)!)
    const compareRows = Array.from({ length: 24 }, (_, hour) => {
        const row: Record<string, number | string> = { hour: String(hour).padStart(2, "0") }
        chosenRows.forEach((item) => { row[`s${item.stop.id}`] = Number(item.byHour[hour].toFixed(1)) })
        return row
    })
    const compareConfig = Object.fromEntries(
        chosenRows.map((item, index) => [`s${item.stop.id}`, { label: item.stop.name, color: COMPARE_COLORS[index] }]),
    ) satisfies ChartConfig
    const addMatches = data.sorted
        .filter((row) => !chosenIds.includes(row.stop.id))
        .filter((row) => !addQuery.trim() || `${row.stop.name} ${row.stop.code} ${districtName(row.stop.districtId)}`.toLowerCase().includes(addQuery.trim().toLowerCase()))

    const rankSource = side === "top" ? data.sorted.slice(0, 10) : data.sorted.slice(-10).reverse()
    const ranking: RankRow[] = rankSource.map((row) => ({
        id: row.stop.id,
        stop: row.stop,
        parts: [row.avg, Math.max(0, row.peak - row.avg)],
        valueText: `${fmtNum(row.avg)} · пик ${fmtInt(row.peak)}`,
    }))
    const overloadRanking: RankRow[] = data.overloaded.slice(0, 8).map((row) => ({
        id: row.stop.id,
        stop: row.stop,
        sub: `пик ${fmtInt(row.peak)} чел.${row.stop.capacity !== null ? ` · вместимость ${row.stop.capacity}` : ""}`,
        parts: [row.overloadHours],
        valueText: `${fmtInt(row.overloadHours)} ч`,
    }))

    const busiest = data.sorted[0]
    const HEAT_PAGE = 15
    const heatPages = Math.max(1, Math.ceil(data.sorted.length / HEAT_PAGE))
    const heatPageSafe = Math.min(heatPage, heatPages - 1)
    const heatRows = data.sorted.slice(heatPageSafe * HEAT_PAGE, (heatPageSafe + 1) * HEAT_PAGE).map((row) => ({
        key: row.stop.name,
        label: <StopLink stop={row.stop} sub={`в среднем ${fmtNum(row.avg)} чел.`} />,
        values: row.byHour,
    }))

    const removePick = (stopId: number) => setPicked(chosenIds.filter((id) => id !== stopId))
    const addPick = (stopId: number) => { setPicked([...chosenIds, stopId].slice(-COMPARE_COLORS.length)); setAddOpen(false); setAddQuery("") }

    return (
        <SectionShell title="Загруженность">
            <Insight>
                Час пик — {hourRange(data.firstPeak)}, второй — {hourRange(data.secondPeak)}.
                {busiest && ` Самая загруженная остановка — «${busiest.stop.name}»: в среднем ${fmtNum(busiest.avg)} чел., до ${fmtInt(busiest.peak)} в пике.`}
                {data.overloaded.length > 0 && ` На ${data.overloaded.length} ${plural(data.overloaded.length, ["остановке", "остановках", "остановках"])} людей бывает больше, чем вмещает павильон.`}
                {" "}Счёт ведётся по людям, которые одновременно находятся на остановке, это не пассажиропоток.
            </Insight>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard title="Людей на остановках сейчас" value={fmtInt(data.people)} icon={Users2} detail={`На ${data.online} ${plural(data.online, ["остановке", "остановках", "остановках"])} с видео на связи`} />
                <KpiCard title="Час пик" value={hourRange(data.firstPeak)} compactValue icon={Clock3} detail={`Второй пик ${hourRange(data.secondPeak)}`} />
                <KpiCard
                    title="Самая загруженная остановка"
                    value={busiest ? busiest.stop.name : "—"}
                    compactValue
                    icon={Trophy}
                    detail={busiest ? `В среднем ${fmtNum(busiest.avg)} чел., пик ${fmtInt(busiest.peak)}` : undefined}
                />
                <KpiCard
                    title="Остановок с перегрузом"
                    value={fmtInt(data.overloaded.length)}
                    icon={UserPlus}
                    tone={data.overloaded.length > 0 ? "attention" : "success"}
                    detail="Людей больше вместимости павильона"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard
                    className="xl:col-span-5"
                    title="Какие остановки загружены сильнее всего?"
                    icon={Trophy}
                    iconClassName="text-amber-500"
                    hint="Людей на остановке одновременно: в среднем и в пике"
                    action={
                        <Segmented<"top" | "bottom">
                            value={side}
                            onChange={setSide}
                            options={[
                                { value: "top", label: "Самые загруженные" },
                                { value: "bottom", label: "Самые пустые" },
                            ]}
                        />
                    }
                >
                    <RankList rows={ranking} colors={["#2563eb", "#93c5fd"]} legend={["Среднее", "До пика"]} />
                </ChartCard>

                <ChartCard className="xl:col-span-7" title="Чем будни отличаются от выходных?" icon={CalendarClock} iconClassName="text-blue-500" hint="Сколько людей в среднем находится на выбранных остановках в каждый час">
                    <WeekHourHeatmap matrix={data.matrix} unit="чел." />
                </ChartCard>
            </div>

            <ChartCard
                title="Когда загружена каждая остановка?"
                icon={Grid3X3}
                iconClassName="text-sky-500"
                action={
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{heatPageSafe * HEAT_PAGE + 1}–{Math.min((heatPageSafe + 1) * HEAT_PAGE, data.sorted.length)} из {data.sorted.length}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" disabled={heatPageSafe === 0} onClick={() => setHeatPage(heatPageSafe - 1)} aria-label="Предыдущие остановки"><ChevronLeft className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" className="h-7 w-7" disabled={heatPageSafe >= heatPages - 1} onClick={() => setHeatPage(heatPageSafe + 1)} aria-label="Следующие остановки"><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                }
            >
                <HourHeatmap rows={heatRows} unit="чел. в среднем" digits={0} labelWidth="12rem" />
            </ChartCard>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard
                    className="xl:col-span-7"
                    title="Чем отличаются остановки?"
                    icon={GitCompareArrows}
                    iconClassName="text-violet-500"
                    hint="Людей на остановке по часам суток. Включайте и выключайте остановки кнопками."
                    action={
                        <div className="flex flex-wrap gap-1.5">
                            {chosenRows.map((item, index) => (
                                <Button
                                    key={item.stop.id}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1.5 border-primary/40 bg-primary/10 px-2 text-xs font-normal"
                                    onClick={() => removePick(item.stop.id)}
                                    title="Убрать из сравнения"
                                >
                                    <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: COMPARE_COLORS[index] }} />
                                    {item.stop.name}
                                    <X className="h-3 w-3 opacity-60" />
                                </Button>
                            ))}
                            {chosenRows.length < COMPARE_COLORS.length && (
                                <Popover open={addOpen} onOpenChange={setAddOpen}>
                                    <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs"><Plus className="h-3 w-3" />Остановка</Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-2" align="end">
                                        <Input autoFocus value={addQuery} onChange={(event) => setAddQuery(event.target.value)} placeholder="Название, номер или микрорайон" aria-label="Добавить остановку в сравнение" />
                                        <div className="mt-2 max-h-72 space-y-0.5 overflow-auto">
                                            {addMatches.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Ничего не найдено</p>}
                                            {addMatches.map((row) => (
                                                <button key={row.stop.id} type="button" className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => addPick(row.stop.id)}>
                                                    <span className="font-medium">{row.stop.name}</span>
                                                    <span className="text-xs text-muted-foreground">№ {row.stop.code} · {districtName(row.stop.districtId)} · в среднем {fmtNum(row.avg)} чел.</span>
                                                </button>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                    }
                >
                    <ChartContainer config={compareConfig} className="h-[300px] w-full">
                        <LineChart data={compareRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={1} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={28} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            {chosenRows.map((item) => (
                                <Line key={item.stop.id} dataKey={`s${item.stop.id}`} stroke={`var(--color-s${item.stop.id})`} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                            ))}
                        </LineChart>
                    </ChartContainer>
                </ChartCard>

                {hasCapacity && (
                    <ChartCard className="xl:col-span-5" title="Где людей больше, чем мест?" icon={UserPlus} iconClassName="text-red-500">
                        <RankList rows={overloadRanking} colors={["#ea580c"]} emptyText="Перегруза за период не было" labelWidth="12.5rem" />
                    </ChartCard>
                )}
            </div>

            {/* Весь город: каждая остановка, где камера считает людей. */}
            <ChartCard title={`Все остановки с подсчётом людей · ${fmtInt(data.perStop.length)}`} icon={Users2} iconClassName="text-sky-500">
                <DataTable
                    columns={allColumns}
                    rows={data.sorted}
                    rowKey={(row) => String(row.stop.id)}
                    search={(row) => `${row.stop.name} ${row.stop.code} ${districtName(row.stop.districtId)}`}
                    pageSize={25}
                    exportName="Загруженность остановок"
                    initialSort={{ key: "avg", dir: "desc" }}
                />
            </ChartCard>
        </SectionShell>
    )
}
