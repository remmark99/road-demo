"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { CalendarClock, Clock3, GitCompareArrows, Grid3X3, Trophy, UserPlus, Users2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import {
    HOUR,
    V_NOW,
    cityDow,
    cityHour,
    fmtInt,
    fmtNum,
    loadAt,
    peakAt,
    plural,
    stopOfflineAt,
    type VStop,
} from "@/lib/mock/stop-analytics-vision-data"
import { peopleNow } from "@/components/dashboard/stops-v2/selectors"
import {
    ChartCard,
    HourHeatmap,
    Insight,
    KpiCard,
    RankList,
    SectionShell,
    Segmented,
    StopLink,
    WeekHourHeatmap,
    useScope,
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
    const [picked, setPicked] = useState<Set<number> | null>(null)

    const data = useMemo(() => {
        const { stops, from, to } = scope
        const end = Math.min(to, V_NOW)
        const matrixSum = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
        const matrixCount = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
        const counted = new Set<number>()

        const perStop: StopLoad[] = stops.map((stop) => {
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
                if (top > stop.capacity) overloadHours += 1
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
    const chosen = picked ?? new Set(candidates.slice(0, 3).map((row) => row.stop.id))
    const compareRows = Array.from({ length: 24 }, (_, hour) => {
        const row: Record<string, number | string> = { hour: String(hour).padStart(2, "0") }
        candidates.forEach((item) => { if (chosen.has(item.stop.id)) row[`s${item.stop.id}`] = Number(item.byHour[hour].toFixed(1)) })
        return row
    })
    const compareConfig = Object.fromEntries(
        candidates.map((item, index) => [`s${item.stop.id}`, { label: item.stop.name, color: COMPARE_COLORS[index] }]),
    ) satisfies ChartConfig

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
        sub: `пик ${fmtInt(row.peak)} чел. · вместимость ${row.stop.capacity}`,
        parts: [row.overloadHours],
        valueText: `${fmtInt(row.overloadHours)} ч`,
    }))

    const busiest = data.sorted[0]
    const heatRows = data.sorted.slice(0, 12).map((row) => ({
        key: row.stop.name,
        label: <StopLink stop={row.stop} sub={`в среднем ${fmtNum(row.avg)} чел.`} />,
        values: row.byHour,
    }))

    const togglePick = (stopId: number) => {
        const next = new Set(chosen)
        if (next.has(stopId)) next.delete(stopId)
        else next.add(stopId)
        setPicked(next)
    }

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

            <ChartCard title="Когда загружена каждая остановка?" icon={Grid3X3} iconClassName="text-sky-500" hint="Двенадцать самых загруженных остановок. Строка открывает карточку остановки.">
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
                            {candidates.map((item, index) => {
                                const on = chosen.has(item.stop.id)
                                return (
                                    <Button
                                        key={item.stop.id}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        aria-pressed={on}
                                        className={cn("h-7 gap-1.5 px-2 text-xs font-normal", on ? "border-primary/40 bg-primary/10" : "text-muted-foreground opacity-70")}
                                        onClick={() => togglePick(item.stop.id)}
                                    >
                                        <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: COMPARE_COLORS[index] }} />
                                        {item.stop.name}
                                    </Button>
                                )
                            })}
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
                            {candidates.filter((item) => chosen.has(item.stop.id)).map((item) => (
                                <Line key={item.stop.id} dataKey={`s${item.stop.id}`} stroke={`var(--color-s${item.stop.id})`} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                            ))}
                        </LineChart>
                    </ChartContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-5" title="Где людей больше, чем мест?" icon={UserPlus} iconClassName="text-red-500" hint="Часы за период, когда людей было больше вместимости павильона">
                    <RankList rows={overloadRanking} colors={["#ea580c"]} emptyText="Перегруза за период не было" labelWidth="12.5rem" />
                </ChartCard>
            </div>
        </SectionShell>
    )
}
