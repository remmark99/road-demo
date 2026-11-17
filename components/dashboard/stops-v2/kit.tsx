"use client"

// Общие кирпичи новой аналитики остановок: фильтры, плитки, карточки графиков,
// рейтинги, тепловая карта и таблица с поиском. Оформление повторяет действующие разделы.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Download,
    Lightbulb,
    MapPin,
    Minus,
    Search,
    X,
    type LucideIcon,
} from "lucide-react"

import { TimeRangeFilter, type TimeRange, type TimeRangeResult } from "@/components/dashboard/time-range-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
    CITY_OFFSET,
    DAY,
    DOW_LABELS,
    V_DISTRICTS,
    V_NOW,
    V_START,
    V_STOPS,
    cityDayStart,
    districtName,
    fmtDateTime,
    fmtDuration,
    fmtInt,
    fmtNum,
    stopById,
    type VStop,
} from "@/lib/mock/stop-analytics-vision-data"
import type { Scope } from "@/components/dashboard/stops-v2/selectors"

// ---------------------------------------------------------------- состояние

export type VisionView = "overview" | "safety" | "clean" | "equipment" | "sensors" | "load" | "districts"

interface VisionState {
    timeRange: TimeRangeResult
    setTimeRange: (value: TimeRangeResult) => void
    districtId: string | null
    setDistrictId: (value: string | null) => void
    stopId: number | null
    setStopId: (value: number | null) => void
    view: VisionView
    setView: (value: VisionView) => void
    cardStopId: number | null
    openStop: (stopId: number) => void
    closeStop: () => void
}

const VisionContext = createContext<VisionState | null>(null)

/** Фильтры общие для всех разделов: выбранный период, район и остановка переходят вместе с пользователем. */
export interface VisionInitial {
    period?: TimeRange
    districtId?: string | null
    stopId?: number | null
    /** Карточка остановки, открытая сразу. */
    cardStopId?: number | null
}

export function VisionProvider({ children, view, onViewChange, initial }: {
    children: ReactNode
    view: VisionView
    onViewChange: (view: VisionView) => void
    /** Состояние из адреса страницы: ссылкой можно поделиться, кнопка «назад» вернёт в то же место. */
    initial?: VisionInitial
}) {
    const [timeRange, setTimeRange] = useState<TimeRangeResult>({ preset: initial?.period ?? "week" })
    const [districtId, setDistrictIdState] = useState<string | null>(initial?.districtId ?? null)
    const [stopId, setStopIdState] = useState<number | null>(initial?.stopId ?? null)
    const [cardStopId, setCardStopId] = useState<number | null>(initial?.cardStopId ?? null)

    // Раздел, период, район и остановка живут в адресе страницы.
    useEffect(() => {
        const params = new URLSearchParams()
        params.set("view", view)
        if (timeRange.preset !== "week" && timeRange.preset !== "custom") params.set("period", timeRange.preset)
        if (districtId) params.set("district", districtId)
        if (stopId !== null) params.set("s", String(stopId))
        if (cardStopId !== null) params.set("stop", String(cardStopId))
        window.history.replaceState(null, "", `?${params.toString()}`)
    }, [view, timeRange, districtId, stopId, cardStopId])

    const setDistrictId = useCallback((value: string | null) => {
        setDistrictIdState(value)
        setStopIdState(null)
    }, [])
    const setStopId = useCallback((value: number | null) => setStopIdState(value), [])
    const openStop = useCallback((id: number) => setCardStopId(id), [])
    const closeStop = useCallback(() => setCardStopId(null), [])

    const value = useMemo<VisionState>(() => ({
        timeRange, setTimeRange, districtId, setDistrictId, stopId, setStopId, view, setView: onViewChange, cardStopId, openStop, closeStop,
    }), [timeRange, districtId, setDistrictId, stopId, setStopId, view, onViewChange, cardStopId, openStop, closeStop])

    return <VisionContext.Provider value={value}>{children}</VisionContext.Provider>
}

export function useVision() {
    const value = useContext(VisionContext)
    if (!value) throw new Error("Раздел аналитики остановок должен быть внутри VisionProvider")
    return value
}

function cityMidnight(date: Date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - CITY_OFFSET
}

export function resolveRange(timeRange: TimeRangeResult): { from: number; to: number; prevLabel: string } {
    const today = cityDayStart(V_NOW)
    if (timeRange.preset === "custom" && timeRange.customRange?.from) {
        const from = Math.max(V_START + 31 * DAY, Math.min(cityMidnight(timeRange.customRange.from), today))
        const to = Math.min(V_NOW, cityMidnight(timeRange.customRange.to ?? timeRange.customRange.from) + DAY)
        return { from, to: Math.max(to, from + DAY > V_NOW ? V_NOW : from + DAY), prevLabel: "к прошлому периоду" }
    }
    switch (timeRange.preset) {
        case "today": return { from: today, to: V_NOW, prevLabel: "ко вчера, к этому же часу" }
        case "yesterday": return { from: today - DAY, to: today, prevLabel: "к позавчера" }
        case "month": return { from: V_NOW - 30 * DAY, to: V_NOW, prevLabel: "к прошлому месяцу" }
        default: return { from: V_NOW - 7 * DAY, to: V_NOW, prevLabel: "к прошлой неделе" }
    }
}

export function useScope(): Scope {
    const { timeRange, districtId, stopId } = useVision()
    return useMemo(() => {
        const { from, to, prevLabel } = resolveRange(timeRange)
        const length = to - from
        // «Сегодня» сравнивается с тем же отрезком вчера, остальное — с предыдущим периодом той же длины.
        const prevFrom = timeRange.preset === "today" ? from - DAY : from - length
        const prevTo = timeRange.preset === "today" ? to - DAY : from
        const stops = V_STOPS.filter((stop) => (stopId !== null ? stop.id === stopId : districtId === null || stop.districtId === districtId))
        return { from, to, prevFrom, prevTo, stops, ids: new Set(stops.map((stop) => stop.id)), prevLabel, hourly: length <= 2 * DAY }
    }, [timeRange, districtId, stopId])
}

// ---------------------------------------------------------------- изменение к прошлому периоду

export interface DeltaInfo {
    text: string
    direction: "up" | "down" | "flat"
    /** null — изменение ни хорошее, ни плохое. */
    good: boolean | null
}

export function makeDelta(
    current: number,
    previous: number,
    options: { kind: "percent" | "count" | "points" | "duration"; goodWhen: "down" | "up" | "none" },
): DeltaInfo {
    const diff = current - previous
    let direction: DeltaInfo["direction"] = "flat"
    let text = "без изменений"
    if (options.kind === "percent") {
        const pct = previous === 0 ? (current === 0 ? 0 : 100) : (diff / previous) * 100
        if (Math.abs(pct) >= 1) {
            direction = pct > 0 ? "up" : "down"
            text = `${fmtInt(Math.abs(pct))} %`
        }
    } else if (options.kind === "points") {
        if (Math.abs(diff) >= 0.1) {
            direction = diff > 0 ? "up" : "down"
            text = `${fmtNum(Math.abs(diff))} п.п.`
        }
    } else if (options.kind === "duration") {
        if (Math.abs(diff) >= 5 * 60_000) {
            direction = diff > 0 ? "up" : "down"
            text = fmtDuration(Math.abs(diff))
        }
    } else if (Math.abs(diff) >= 1) {
        direction = diff > 0 ? "up" : "down"
        text = fmtInt(Math.abs(diff))
    }
    const good = direction === "flat" || options.goodWhen === "none" ? null : direction === options.goodWhen
    return { text, direction, good }
}

export function DeltaText({ delta, label }: { delta: DeltaInfo; label?: string }) {
    const Icon = delta.direction === "up" ? ArrowUp : delta.direction === "down" ? ArrowDown : Minus
    return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs">
            <span
                className={cn(
                    "inline-flex items-center gap-0.5 font-medium tabular-nums",
                    delta.good === true && "text-emerald-600 dark:text-emerald-400",
                    delta.good === false && "text-red-600 dark:text-red-400",
                    delta.good === null && "text-muted-foreground",
                )}
            >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {delta.text}
            </span>
            {label && <span className="text-muted-foreground">{label}</span>}
        </span>
    )
}

// ---------------------------------------------------------------- каркас раздела

export function SectionShell({ title, children, filters, district = true, stop = true }: {
    title: string
    children: ReactNode
    /** Дополнительные фильтры раздела справа от общих. */
    filters?: ReactNode
    district?: boolean
    stop?: boolean
}) {
    const scope = useScope()
    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">{title}</h2>
                        <Badge variant="secondary">Демо-данные</Badge>
                    </div>
                </div>
                <div className="text-sm text-muted-foreground lg:text-right">
                    <div>Период: {fmtDateTime(scope.from)} - {fmtDateTime(scope.to)}</div>
                    <div>Последние данные: 2 мин назад · {fmtInt(scope.stops.length)} ост.</div>
                </div>
            </div>
            <FilterBar district={district} stop={stop}>{filters}</FilterBar>
            {children}
        </div>
    )
}

export function FilterBar({ children, district = true, stop = true }: { children?: ReactNode; district?: boolean; stop?: boolean }) {
    const vision = useVision()
    return (
        <TimeRangeFilter value={vision.timeRange} onChange={vision.setTimeRange}>
            {district && (
                <Select value={vision.districtId ?? "all"} onValueChange={(value) => vision.setDistrictId(value === "all" ? null : value)}>
                    <SelectTrigger className="w-[190px]" aria-label="Микрорайон">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Все микрорайоны</SelectItem>
                        {V_DISTRICTS.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            )}
            {stop && <StopSearch />}
            {children}
        </TimeRangeFilter>
    )
}

function StopSearch() {
    const { stopId, setStopId, districtId, openStop } = useVision()
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const selected = stopId !== null ? stopById(stopId) : undefined

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return V_STOPS
            .filter((stop) => districtId === null || stop.districtId === districtId)
            .filter((stop) => !needle || `${stop.name} ${stop.code} ${districtName(stop.districtId)}`.toLowerCase().includes(needle))
            .slice(0, 8)
    }, [query, districtId])

    if (selected) {
        return (
            <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="gap-2 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20" onClick={() => openStop(selected.id)}>
                    <MapPin className="h-3.5 w-3.5" />
                    {selected.name}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStopId(null)} aria-label="Сбросить остановку">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        )
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 font-normal text-muted-foreground">
                    <Search className="h-3.5 w-3.5" />
                    Найти остановку
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
                <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, номер или микрорайон" aria-label="Поиск остановки" />
                <div className="mt-2 max-h-72 space-y-0.5 overflow-auto">
                    {matches.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Ничего не найдено</p>}
                    {matches.map((stop) => (
                        <button
                            key={stop.id}
                            type="button"
                            className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                            onClick={() => { setStopId(stop.id); setOpen(false); setQuery("") }}
                        >
                            <span className="font-medium">{stop.name}</span>
                            <span className="text-xs text-muted-foreground">№ {stop.code} · {districtName(stop.districtId)}</span>
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    )
}

// ---------------------------------------------------------------- вывод словами

export function Insight({ children }: { children: ReactNode }) {
    return (
        <Card className="border-primary/30 bg-primary/[0.04]">
            <CardContent className="flex items-start gap-3 p-4">
                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed">{children}</p>
            </CardContent>
        </Card>
    )
}

// ---------------------------------------------------------------- плитка показателя

export type Tone = "normal" | "success" | "attention" | "high"

export function KpiCard({ title, value, detail, icon: Icon, tone = "normal", delta, deltaLabel, onClick, compactValue = false }: {
    title: string
    /** Для текстовых значений (название остановки, интервал) — шрифт поменьше. */
    compactValue?: boolean
    value: string
    detail?: string
    icon: LucideIcon
    tone?: Tone
    delta?: DeltaInfo
    deltaLabel?: string
    onClick?: () => void
}) {
    const card = (
        <Card className={cn("h-full overflow-hidden", onClick && "transition-colors hover:bg-muted/40")}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="min-w-0 space-y-1">
                    <CardDescription>{title}</CardDescription>
                    <CardTitle
                        className={cn(
                            "font-semibold tabular-nums",
                            compactValue ? "text-xl leading-tight" : "text-3xl",
                            tone === "high" && "text-red-600 dark:text-red-400",
                            tone === "attention" && "text-amber-600 dark:text-amber-400",
                            tone === "success" && "text-emerald-600 dark:text-emerald-400",
                            tone === "normal" && "text-foreground",
                        )}
                    >
                        {value}
                    </CardTitle>
                </div>
                <div
                    className={cn(
                        "rounded-md border p-2",
                        tone === "high" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
                        tone === "attention" && "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
                        tone === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                        tone === "normal" && "border-primary/20 bg-primary/10 text-primary",
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>
            {(detail || delta) && (
                <CardContent className="space-y-1">
                    {delta && <div><DeltaText delta={delta} label={deltaLabel} /></div>}
                    {detail && <p className="text-xs font-medium text-foreground">{detail}</p>}
                </CardContent>
            )}
        </Card>
    )
    if (!onClick) return card
    return (
        <button type="button" onClick={onClick} className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {card}
        </button>
    )
}

// ---------------------------------------------------------------- карточка графика

export function ChartCard({ title, icon: Icon, iconClassName, hint, action, className, children }: {
    /** Заголовок — вопрос, на который отвечает блок. */
    title: string
    icon?: LucideIcon
    iconClassName?: string
    hint?: ReactNode
    action?: ReactNode
    className?: string
    children: ReactNode
}) {
    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                    <div className="min-w-[16rem] flex-1 space-y-1.5">
                        <CardTitle className="flex items-center gap-2 text-base">
                            {Icon && <Icon className={cn("h-5 w-5 shrink-0", iconClassName)} />}
                            {title}
                        </CardTitle>
                        {hint && <CardDescription>{hint}</CardDescription>}
                    </div>
                    {action && <div className="flex max-w-full flex-wrap gap-2">{action}</div>}
                </div>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    )
}

export function EmptyNote({ children }: { children: ReactNode }) {
    return <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">{children}</div>
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {items.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: item.color }} />
                    {item.label}
                </span>
            ))}
        </div>
    )
}

// ---------------------------------------------------------------- остановка-ссылка и статусы

export function StopLink({ stop, sub }: { stop: VStop; sub?: string }) {
    const { openStop } = useVision()
    return (
        <button type="button" className="group flex w-full min-w-0 flex-col text-left focus-visible:outline-none" onClick={() => openStop(stop.id)} title="Открыть карточку остановки">
            <span className="truncate font-medium underline-offset-4 group-hover:underline group-focus-visible:underline">{stop.name}</span>
            <span className="truncate text-xs text-muted-foreground">{sub ?? `${districtName(stop.districtId)} · № ${stop.code}`}</span>
        </button>
    )
}

export function StatusBadge({ tone, children }: { tone: Tone | "muted"; children: ReactNode }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                tone === "high" && "border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400",
                tone === "attention" && "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
                tone === "success" && "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                tone === "muted" && "text-muted-foreground",
            )}
        >
            {children}
        </Badge>
    )
}

// ---------------------------------------------------------------- рейтинг

export interface RankRow {
    id: number | string
    stop?: VStop
    label?: string
    sub?: string
    /** Части столбца в том же порядке, что и colors. */
    parts: number[]
    valueText: string
    onClick?: () => void
}

export function RankList({ rows, colors, legend, emptyText = "Нет данных за выбранный период", labelWidth = "10rem" }: {
    rows: RankRow[]
    colors: string[]
    legend?: string[]
    emptyText?: string
    labelWidth?: string
}) {
    const max = Math.max(...rows.map((row) => row.parts.reduce((sum, part) => sum + part, 0)), 0)
    if (rows.length === 0 || max <= 0) return <EmptyNote>{emptyText}</EmptyNote>
    return (
        <div className="space-y-3">
            {legend && legend.length > 1 && <Legend items={legend.map((label, index) => ({ label, color: colors[index] }))} />}
            <ol className="space-y-1">
                {rows.map((row, index) => (
                    <li key={row.id} className="grid items-center gap-3 rounded-md px-1 py-1.5 hover:bg-muted/40" style={{ gridTemplateColumns: `1.25rem minmax(0, ${labelWidth}) minmax(0, 1fr) auto` }}>
                        <span className="text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                        {row.stop ? (
                            <StopLink stop={row.stop} sub={row.sub} />
                        ) : (
                            <button type="button" className="flex min-w-0 flex-col text-left" onClick={row.onClick} disabled={!row.onClick}>
                                <span className={cn("truncate font-medium", row.onClick && "underline-offset-4 hover:underline")}>{row.label}</span>
                                {row.sub && <span className="truncate text-xs text-muted-foreground">{row.sub}</span>}
                            </button>
                        )}
                        <div className="flex h-3 gap-[2px]" aria-hidden>
                            {row.parts.map((part, partIndex) => part > 0 && (
                                <span
                                    key={partIndex}
                                    className="h-full rounded-[3px]"
                                    style={{ width: `${(part / max) * 100}%`, backgroundColor: colors[partIndex] }}
                                    title={legend ? `${legend[partIndex]}: ${fmtNum(part)}` : undefined}
                                />
                            ))}
                        </div>
                        <span className="text-right text-sm font-medium tabular-nums">{row.valueText}</span>
                    </li>
                ))}
            </ol>
        </div>
    )
}

// ---------------------------------------------------------------- тепловая карта «день недели × час»

function heatClass(value: number, max: number) {
    if (max <= 0 || value <= 0) return "bg-muted/40 text-muted-foreground"
    const pct = value / max
    if (pct >= 0.8) return "bg-blue-700 text-white dark:bg-blue-500 dark:text-blue-950"
    if (pct >= 0.6) return "bg-blue-500 text-white dark:bg-blue-400 dark:text-blue-950"
    if (pct >= 0.4) return "bg-sky-300 text-sky-950 dark:bg-sky-500 dark:text-sky-950"
    if (pct >= 0.2) return "bg-sky-100 text-sky-950 dark:bg-sky-900 dark:text-sky-100"
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
}

export function HeatScale({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>меньше</span>
            <span className="flex gap-[2px]">
                {[0.1, 0.3, 0.5, 0.7, 0.9].map((step) => <span key={step} className={cn("h-3 w-5 rounded-[3px]", heatClass(step, 1))} />)}
            </span>
            <span>больше · {label}</span>
        </div>
    )
}

export interface HeatRow {
    key: string
    label: ReactNode
    values: number[]
}

/** Тепловая карта по часам суток: строки — дни недели или остановки. */
export function HourHeatmap({ rows, unit, digits = 0, showValues = true, labelWidth = "2rem", rowTitle }: {
    rows: HeatRow[]
    unit: string
    digits?: number
    showValues?: boolean
    labelWidth?: string
    rowTitle?: (row: HeatRow) => string
}) {
    const max = Math.max(...rows.flatMap((row) => row.values), 0)
    return (
        <div className="space-y-3">
            <div className="overflow-x-auto">
                <div className="grid gap-[3px] text-[11px]" style={{ minWidth: `calc(${labelWidth} + 470px)`, gridTemplateColumns: `${labelWidth} repeat(24, minmax(15px, 1fr))` }}>
                    <div />
                    {Array.from({ length: 24 }, (_, hour) => (
                        <div key={hour} className="pb-0.5 text-center tabular-nums text-muted-foreground">{hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</div>
                    ))}
                    {rows.map((row) => (
                        <div key={row.key} className="contents">
                            <div className="flex min-w-0 items-center pr-2 text-xs">{row.label}</div>
                            {row.values.map((value, hour) => (
                                <div
                                    key={hour}
                                    className={cn("flex h-7 items-center justify-center rounded-[4px] tabular-nums", heatClass(value, max))}
                                    title={`${rowTitle ? rowTitle(row) : row.key}, ${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00 · ${fmtNum(value, digits)} ${unit}`}
                                >
                                    {showValues && value >= (digits > 0 ? 0.05 : 0.5) ? fmtNum(value, digits) : ""}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <HeatScale label={unit} />
        </div>
    )
}

export function WeekHourHeatmap({ matrix, unit, digits = 0, showValues = true }: {
    /** matrix[день недели, 0 — понедельник][час] */
    matrix: number[][]
    unit: string
    digits?: number
    showValues?: boolean
}) {
    const rows = matrix.map((values, dow) => ({
        key: DOW_LABELS[dow],
        label: <span className={cn("font-medium", dow >= 5 ? "text-foreground" : "text-muted-foreground")}>{DOW_LABELS[dow]}</span>,
        values,
    }))
    return <HourHeatmap rows={rows} unit={unit} digits={digits} showValues={showValues} />
}

// ---------------------------------------------------------------- таблица с поиском

export interface Column<T> {
    key: string
    header: string
    cell: (row: T) => ReactNode
    /** Значение для сортировки и выгрузки. */
    value?: (row: T) => number | string
    align?: "right"
}

export function DataTable<T>({ columns, rows, rowKey, search, searchPlaceholder = "Поиск по остановке", pageSize = 8, exportName, toolbar, initialSort }: {
    columns: Column<T>[]
    rows: T[]
    rowKey: (row: T) => string
    /** Текст строки, по которому работает поиск. */
    search?: (row: T) => string
    searchPlaceholder?: string
    pageSize?: number
    exportName?: string
    toolbar?: ReactNode
    initialSort?: { key: string; dir: "asc" | "desc" }
}) {
    const [query, setQuery] = useState("")
    const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null)
    const [page, setPage] = useState(0)

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        let list = needle && search ? rows.filter((row) => search(row).toLowerCase().includes(needle)) : rows
        const column = sort ? columns.find((item) => item.key === sort.key) : undefined
        if (sort && column?.value) {
            const getValue = column.value
            list = list.slice().sort((a, b) => {
                const left = getValue(a)
                const right = getValue(b)
                const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "ru")
                return sort.dir === "asc" ? order : -order
            })
        }
        return list
    }, [rows, query, sort, columns, search])

    const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const current = Math.min(page, pages - 1)
    const shown = filtered.slice(current * pageSize, current * pageSize + pageSize)

    const toggleSort = (key: string) => {
        setPage(0)
        setSort((previous) => (previous?.key === key ? { key, dir: previous.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
    }

    const exportCsv = () => {
        const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
        const lines = [
            columns.map((column) => escape(column.header)).join(";"),
            ...filtered.map((row) => columns.map((column) => escape(column.value ? column.value(row) : "")).join(";")),
        ]
        const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${exportName ?? "table"}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {search && (
                    <div className="relative w-full sm:w-72">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input className="pl-8" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
                    </div>
                )}
                {toolbar}
                {exportName && (
                    <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={exportCsv}>
                        <Download className="h-4 w-4" />
                        Excel
                    </Button>
                )}
            </div>
            <div className="overflow-x-auto rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead key={column.key} className={cn(column.align === "right" && "text-right")}>
                                    {column.value ? (
                                        <button
                                            type="button"
                                            className={cn("inline-flex items-center gap-1 hover:text-foreground", column.align === "right" && "flex-row-reverse")}
                                            onClick={() => toggleSort(column.key)}
                                        >
                                            {column.header}
                                            {sort?.key === column.key
                                                ? (sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)
                                                : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                                        </button>
                                    ) : column.header}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shown.length === 0 ? (
                            <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>
                        ) : shown.map((row) => (
                            <TableRow key={rowKey(row)}>
                                {columns.map((column) => (
                                    <TableCell key={column.key} className={cn(column.align === "right" && "text-right tabular-nums")}>{column.cell(row)}</TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                    {filtered.length === 0 ? "Нет строк" : `Строки ${current * pageSize + 1}–${Math.min(filtered.length, (current + 1) * pageSize)} из ${fmtInt(filtered.length)}`}
                </span>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Предыдущая страница">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2 tabular-nums">{current + 1} / {pages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Следующая страница">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

/** Переключатель из нескольких вариантов в стиле кнопок периода. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
    return (
        <div className="inline-flex w-fit rounded-lg bg-muted p-1">
            {options.map((option) => (
                <Button key={option.value} type="button" size="sm" variant={value === option.value ? "default" : "ghost"} className="h-7 rounded-md px-3" onClick={() => onChange(option.value)}>
                    {option.label}
                </Button>
            ))}
        </div>
    )
}

const PERIOD_PHRASE: Record<string, string> = {
    today: "За сегодня",
    yesterday: "За вчера",
    week: "За неделю",
    month: "За месяц",
    custom: "За выбранный период",
}

/** «За неделю», «За месяц» — начало вывода словами. */
export function usePeriodPhrase() {
    const { timeRange } = useVision()
    return PERIOD_PHRASE[timeRange.preset] ?? "За период"
}

/** Место под кадр с камеры: в прототипе снимков нет. */
export function FrameThumb({ label }: { label?: string }) {
    return (
        <span className="inline-flex h-9 w-14 items-center justify-center rounded-md border bg-muted/60 text-[10px] text-muted-foreground" title={label ?? "Кадр с камеры"}>
            {label ?? "кадр"}
        </span>
    )
}
