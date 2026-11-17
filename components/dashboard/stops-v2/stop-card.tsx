"use client"

import { useMemo } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { Bell, Camera, Cctv, ExternalLink, Map as MapIcon, Thermometer, Trash2, Users2, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
    DAY,
    HOUR,
    SAFETY_TYPES,
    V_NORMS,
    V_NOW,
    V_STOPS,
    cityHour,
    climateAt,
    climateOutOfNorm,
    districtName,
    fmtDateTime,
    fmtDay,
    fmtDuration,
    fmtInt,
    fmtNum,
    fmtTime,
    loadAt,
    stopById,
    stopOfflineAt,
    type VStop,
} from "@/lib/mock/stop-analytics-vision-data"
import {
    CATEGORY_COLORS,
    availabilityPct,
    binsOpenNow,
    fmtTemp,
    openOutages,
    outageEnd,
    outagesTouching,
    safetyIn,
    type Scope,
} from "@/components/dashboard/stops-v2/selectors"
import { Legend, useScope, useVision, type Tone } from "@/components/dashboard/stops-v2/kit"
import { V_BINS } from "@/lib/mock/stop-analytics-vision-data"

const loadConfig = {
    stop: { label: "Эта остановка", color: "#2563eb" },
    city: { label: "В среднем по городу", color: "#ea580c" },
} satisfies ChartConfig

const tempConfig = {
    temp: { label: "В павильоне, °C", color: "#2563eb" },
} satisfies ChartConfig

function StatusTile({ icon: Icon, title, value, detail, tone }: { icon: LucideIcon; title: string; value: string; detail: string; tone: Tone }) {
    return (
        <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-4 w-4" />
                {title}
            </div>
            <div
                className={cn(
                    "mt-1.5 text-lg font-semibold tabular-nums",
                    tone === "high" && "text-red-600 dark:text-red-400",
                    tone === "attention" && "text-amber-600 dark:text-amber-400",
                    tone === "success" && "text-emerald-600 dark:text-emerald-400",
                )}
            >
                {value}
            </div>
            <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
    )
}

interface Segment {
    from: number
    to: number
    title: string
}

function Track({ label, color, segments, scope, dots = false }: { label: string; color: string; segments: Segment[]; scope: Scope; dots?: boolean }) {
    const span = scope.to - scope.from
    return (
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
                {label}
            </div>
            <div className="relative h-5 rounded-[4px] bg-muted/50">
                {segments.map((segment, index) => {
                    const left = ((Math.max(segment.from, scope.from) - scope.from) / span) * 100
                    const width = ((Math.min(segment.to, scope.to) - Math.max(segment.from, scope.from)) / span) * 100
                    return dots ? (
                        <span
                            key={index}
                            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
                            style={{ left: `${left}%`, backgroundColor: color }}
                            title={segment.title}
                        />
                    ) : (
                        <span
                            key={index}
                            className="absolute inset-y-0 rounded-[3px]"
                            style={{ left: `${left}%`, width: `max(3px, ${width}%)`, backgroundColor: color }}
                            title={segment.title}
                        />
                    )
                })}
            </div>
        </div>
    )
}

function StopCardBody({ stop }: { stop: VStop }) {
    const scope = useScope()
    const data = useMemo(() => {
        const ids = new Set([stop.id])
        const { from, to } = scope

        const open = openOutages(ids)
        const offline = stopOfflineAt(stop.id, V_NOW)
        const bin = binsOpenNow(ids)[0]
        const climate = climateAt(stop, V_NOW)
        const people = offline ? null : Math.round(loadAt(stop, V_NOW))
        const usual = Math.round([1, 2, 3, 4].reduce((sum, week) => sum + loadAt(stop, V_NOW - week * 7 * DAY), 0) / 4)

        const outageSegments: Segment[] = outagesTouching(ids, from, to).map((outage) => ({
            from: outage.startAt,
            to: outageEnd(outage),
            title: `${outage.label}: ${fmtDateTime(outage.startAt)} — ${outage.endAt ? fmtDateTime(outage.endAt) : "сейчас"}`,
        }))
        const binSegments: Segment[] = V_BINS
            .filter((episode) => episode.stopId === stop.id && episode.startAt < to && (episode.endAt ?? V_NOW) > from)
            .map((episode) => ({
                from: episode.startAt,
                to: episode.endAt ?? V_NOW,
                title: `Урна переполнена: ${fmtDateTime(episode.startAt)} — ${episode.endAt ? fmtDateTime(episode.endAt) : "сейчас"}`,
            }))
        const safetySegments: Segment[] = safetyIn(ids, from, to).map((event) => ({
            from: event.at,
            to: event.at,
            title: `${SAFETY_TYPES.find((type) => type.id === event.type)?.label}: ${fmtDateTime(event.at)}`,
        }))
        const climateSegments: Segment[] = []
        let run: Segment | null = null
        for (let ts = Math.ceil(from / HOUR) * HOUR; ts < Math.min(to, V_NOW); ts += HOUR) {
            if (climateOutOfNorm(climateAt(stop, ts))) {
                if (run) run.to = ts + HOUR
                else {
                    run = { from: ts, to: ts + HOUR, title: "" }
                    climateSegments.push(run)
                }
            } else run = null
        }
        for (const segment of climateSegments) segment.title = `Климат вне нормы: ${fmtDateTime(segment.from)} — ${fmtDateTime(segment.to)}`

        // Профиль по часам суток: остановка рядом со средним по городу.
        const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour: String(hour).padStart(2, "0"), stop: 0, city: 0, n: 0 }))
        let counted = 0
        for (let ts = Math.ceil(from / HOUR) * HOUR; ts < Math.min(to, V_NOW); ts += HOUR) {
            // Пока остановка без связи, людей никто не считает.
            if (stopOfflineAt(stop.id, ts)) continue
            counted += 1
            const slot = hourly[cityHour(ts)]
            slot.stop += loadAt(stop, ts)
            slot.city += V_STOPS.reduce((sum, item) => sum + loadAt(item, ts), 0) / V_STOPS.length
            slot.n += 1
        }
        const loadRows = hourly.map((slot) => ({
            hour: slot.hour,
            stop: slot.n ? Number((slot.stop / slot.n).toFixed(1)) : 0,
            city: slot.n ? Number((slot.city / slot.n).toFixed(1)) : 0,
        }))

        const step = scope.hourly ? HOUR : to - from <= 8 * DAY ? 3 * HOUR : 12 * HOUR
        const tempRows: { label: string; temp: number | null }[] = []
        for (let ts = Math.ceil(from / step) * step; ts < Math.min(to, V_NOW); ts += step) {
            tempRows.push({ label: scope.hourly ? fmtTime(ts) : `${fmtDay(ts)} ${fmtTime(ts)}`, temp: climateAt(stop, ts).temp })
        }

        return {
            open, offline, bin, climate, people, usual, outageSegments, binSegments, safetySegments, climateSegments, loadRows, tempRows, counted,
            availability: availabilityPct(ids, from, to),
        }
    }, [stop, scope])

    const climateOut = climateOutOfNorm(data.climate)
    const offlineCameras = new Set(data.open.filter((outage) => outage.device === "camera").map((outage) => outage.label))

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{stop.cameras.length} камеры</Badge>
                <Badge variant="secondary">Контроллер</Badge>
                <Badge variant="secondary">Датчики климата и стекла</Badge>
                {stop.capacity !== null && <Badge variant="outline">Вместимость {stop.capacity} чел.</Badge>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatusTile
                    icon={Cctv}
                    title="Оборудование"
                    value={data.offline ? "нет связи" : data.open.length > 0 ? `не в сети: ${data.open.length}` : "на связи"}
                    detail={`Доступность за период ${fmtNum(data.availability)} %`}
                    tone={data.offline ? "high" : data.open.length > 0 ? "attention" : "success"}
                />
                <StatusTile
                    icon={Trash2}
                    title="Урна"
                    value={data.bin ? "переполнена" : "в порядке"}
                    detail={data.bin ? `${fmtDuration(V_NOW - data.bin.startAt)} при норме ${V_NORMS.binHours} ч` : "Переполнения сейчас нет"}
                    tone={data.bin ? (V_NOW - data.bin.startAt > V_NORMS.binHours * HOUR ? "high" : "attention") : "success"}
                />
                <StatusTile
                    icon={Thermometer}
                    title="В павильоне"
                    value={fmtTemp(data.climate.temp)}
                    detail={data.climate.temp === null ? "Показаний нет" : `Влажность ${data.climate.humidity} % · ${climateOut ? "вне нормы" : "в норме"}`}
                    tone={data.climate.temp === null ? "normal" : climateOut ? "high" : "success"}
                />
                <StatusTile
                    icon={Users2}
                    title="Людей сейчас"
                    value={data.people === null ? "—" : fmtInt(data.people)}
                    detail={`Обычно в этот час около ${fmtInt(data.usual)}`}
                    tone="normal"
                />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">Что происходило за период?</h3>
                    <span className="text-xs text-muted-foreground">Наведите на отрезок, чтобы увидеть время</span>
                </div>
                <div className="space-y-2">
                    <Track label="Связь" color={CATEGORY_COLORS.equipment} segments={data.outageSegments} scope={scope} />
                    <Track label="Урна" color={CATEGORY_COLORS.clean} segments={data.binSegments} scope={scope} />
                    <Track label="События" color={CATEGORY_COLORS.safety} segments={data.safetySegments} scope={scope} dots />
                    <Track label="Климат" color={CATEGORY_COLORS.climate} segments={data.climateSegments} scope={scope} />
                </div>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 text-xs tabular-nums text-muted-foreground">
                    <span />
                    <div className="flex justify-between">
                        <span>{fmtDateTime(scope.from)}</span>
                        <span>{fmtDateTime(scope.from + (scope.to - scope.from) / 2)}</span>
                        <span>{fmtDateTime(scope.to)}</span>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">В какие часы здесь больше всего людей?</h3>
                    {data.counted === 0 ? (
                        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Камеры не на связи, людей никто не считал</div>
                    ) : (
                    <ChartContainer config={loadConfig} className="h-[220px] w-full">
                        <ComposedChart data={data.loadRows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={28} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar dataKey="stop" fill="var(--color-stop)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            <Line dataKey="city" stroke="var(--color-city)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                        </ComposedChart>
                    </ChartContainer>
                    )}
                </div>
                <div className="space-y-2 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">Держит ли павильон тепло?</h3>
                    {data.tempRows.every((row) => row.temp === null) ? (
                        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Датчик не передаёт показания</div>
                    ) : (
                        <ChartContainer config={tempConfig} className="h-[220px] w-full">
                            <LineChart data={data.tempRows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} domain={[(min: number) => Math.floor(Math.min(min, V_NORMS.tempMin - 2)), (max: number) => Math.ceil(max + 1)]} allowDecimals={false} unit="°" />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ReferenceLine y={V_NORMS.tempMin} stroke="var(--muted-foreground)" strokeDasharray="5 4" label={{ value: `норма +${V_NORMS.tempMin} °C`, position: "insideBottomRight", fontSize: 11, fill: "var(--muted-foreground)" }} />
                                <Line dataKey="temp" stroke="var(--color-temp)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} connectNulls={false} />
                            </LineChart>
                        </ChartContainer>
                    )}
                </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Камеры</h3>
                    <Legend items={[{ label: "на связи", color: "#10b981" }, { label: "не в сети", color: "#ef4444" }]} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    {stop.cameras.map((camera) => {
                        const down = data.offline || offlineCameras.has(`Камера ${camera}`)
                        return (
                            <div key={camera} className="overflow-hidden rounded-lg border">
                                <div className="flex aspect-video items-center justify-center bg-muted/60 text-muted-foreground">
                                    <Camera className="h-7 w-7 opacity-50" />
                                </div>
                                <div className="flex items-center justify-between px-3 py-2 text-sm">
                                    <span>Камера {camera}</span>
                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <span className={cn("h-2 w-2 rounded-full", down ? "bg-red-500" : "bg-emerald-500")} />
                                        {down ? "не в сети" : "на связи"}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                    <Bell className="h-4 w-4" />
                    Уведомления по остановке
                    <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                    <MapIcon className="h-4 w-4" />
                    Показать на карте
                </Button>
            </div>
        </div>
    )
}

export function StopCardDialog() {
    const { cardStopId, closeStop } = useVision()
    const stop = cardStopId !== null ? stopById(cardStopId) : undefined
    return (
        <Dialog open={Boolean(stop)} onOpenChange={(open) => { if (!open) closeStop() }}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl" onOpenAutoFocus={(event) => event.preventDefault()}>
                {stop && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl">{stop.name}</DialogTitle>
                            <DialogDescription>
                                № {stop.code} · {stop.direction} · {districtName(stop.districtId)}
                            </DialogDescription>
                        </DialogHeader>
                        <StopCardBody stop={stop} />
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
