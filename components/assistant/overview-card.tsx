"use client"

import type { ReactNode } from "react"
import { Activity, ChevronRight, Cpu, LayoutDashboard, MapPin, ShieldAlert, Trash2, Video } from "lucide-react"
import type { OverviewSummary } from "@/lib/assistant/overview"
import { cn } from "@/lib/utils"

type Tone = "good" | "warn" | "bad" | "plain"

const TONE_TEXT: Record<Tone, string> = {
    good: "text-emerald-600 dark:text-emerald-400", warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400", plain: "text-muted-foreground",
}

const plural = (n: number, one: string, few: string, many: string) => {
    const tens = n % 100, units = n % 10
    return tens >= 11 && tens <= 14 ? many : units === 1 ? one : units >= 2 && units <= 4 ? few : many
}

/** Доля на связи: зелёная часть — в сети, красная — нет. */
function ShareBar({ online, total }: { online: number; total: number }) {
    const share = total > 0 ? Math.min(online / total, 1) : 0
    return (
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="bg-emerald-500" style={{ width: `${share * 100}%` }} />
            {total > online && <div className="flex-1 bg-red-500/80" />}
        </div>
    )
}

/** Состояние остановок с данными: норма, одно нарушение, два и больше. */
function ConditionBar({ ok, warn, bad }: { ok: number; warn: number; bad: number }) {
    const total = ok + warn + bad
    if (!total) return <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden />
    return (
        <div className="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full bg-muted" aria-hidden>
            {ok > 0 && <div className="bg-emerald-500" style={{ flexGrow: ok }} />}
            {warn > 0 && <div className="bg-amber-500" style={{ flexGrow: warn }} />}
            {bad > 0 && <div className="bg-red-500" style={{ flexGrow: bad }} />}
        </div>
    )
}

function Tile({ icon, label, value, unit, note, tone, question, onAsk, disabled, children }: {
    icon: ReactNode; label: string; value: string; unit?: string; note: string; tone: Tone
    question: string; onAsk?: (question: string) => void; disabled?: boolean; children?: ReactNode
}) {
    return (
        <button
            type="button" title={question} disabled={disabled || !onAsk} onClick={() => onAsk?.(question)}
            className="group/tile flex min-w-0 flex-col rounded-lg border bg-background px-3 py-2.5 text-left transition-colors enabled:hover:border-foreground/25 enabled:hover:bg-muted/50 disabled:cursor-default"
        >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {icon}
                <span className="truncate">{label}</span>
                {onAsk && !disabled && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover/tile:opacity-100" />}
            </span>
            <span className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
                {unit && <span className="truncate text-xs text-muted-foreground">{unit}</span>}
            </span>
            {children}
            <span className={cn("mt-1.5 text-xs leading-snug", TONE_TEXT[tone])}>{note}</span>
        </button>
    )
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]

function asOfLabel(asOf: string) {
    const match = /^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(asOf)
    const month = match ? MONTHS[Number(match[1]) - 1] : undefined
    return match && month ? `${Number(match[2])} ${month}, ${match[3]}` : asOf
}

/**
 * Сводка по остановкам карточкой: каждая плитка — вопрос ассистенту о подробностях.
 * Цифры — из вывода system_overview, а не из текста модели.
 */
export function OverviewCard({ overview, onAsk, disabled }: { overview: OverviewSummary; onAsk?: (question: string) => void; disabled?: boolean }) {
    const { cameras, controllers, conditions, events, binsFull, stops } = overview
    const camerasOff = Math.max(cameras.total - cameras.online, 0), controllersOff = Math.max(controllers.total - controllers.online, 0)
    const violations = conditions.warn + conditions.bad
    const eventsTotal = events.reduce((sum, event) => sum + event.count, 0)
    const iconClass = "h-3.5 w-3.5 shrink-0"
    const common = { onAsk, disabled }
    return (
        <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center gap-2.5 border-b px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><LayoutDashboard className="h-3.5 w-3.5" /></div>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-tight">Сводка по остановкам</div>
                    <div className="truncate text-[11px] text-muted-foreground">{asOfLabel(overview.asOf)} по Сургуту{onAsk ? " · нажмите на плитку, чтобы узнать подробности" : ""}</div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3">
                <Tile {...common} icon={<Video className={iconClass} />} label="Камеры на связи" value={String(cameras.online)} unit={`из ${cameras.total}`}
                    note={camerasOff ? `${camerasOff} не в сети` : "все на связи"} tone={camerasOff ? "bad" : "good"}
                    question="Какие камеры сейчас не в сети и сколько уже?">
                    <ShareBar online={cameras.online} total={cameras.total} />
                </Tile>
                <Tile {...common} icon={<Cpu className={iconClass} />} label="Контроллеры датчиков" value={String(controllers.online)} unit={`из ${controllers.total}`}
                    note={controllersOff ? `${controllersOff} не в сети` : "все на связи"} tone={controllersOff ? "bad" : "good"}
                    question="Какие контроллеры датчиков сейчас не в сети и сколько уже?">
                    <ShareBar online={controllers.online} total={controllers.total} />
                </Tile>
                <Tile {...common} icon={<Activity className={iconClass} />} label="Нарушения норм" value={String(violations)}
                    unit={`из ${conditions.ok + violations} с данными`}
                    note={violations ? [conditions.warn && `${conditions.warn} — одно нарушение`, conditions.bad && `${conditions.bad} — два и больше`].filter(Boolean).join(", ") : "нарушений нет"}
                    tone={conditions.bad ? "bad" : violations ? "warn" : "good"}
                    question="Покажи остановки с нарушениями: что именно не в норме">
                    <ConditionBar ok={conditions.ok} warn={conditions.warn} bad={conditions.bad} />
                </Tile>
                <Tile {...common} icon={<ShieldAlert className={iconClass} />} label="События за сутки" value={String(eventsTotal)}
                    unit={plural(eventsTotal, "событие", "события", "событий")}
                    note={events.length ? events.slice(0, 3).map(event => `${event.label.toLocaleLowerCase("ru")} — ${event.count}`).join(", ") : "событий не было"}
                    tone="plain" question="Покажи события безопасности за сутки: на каких остановках и какие" />
                <Tile {...common} icon={<Trash2 className={iconClass} />} label="Переполненные урны" value={String(binsFull)}
                    unit={plural(binsFull, "урна", "урны", "урн")}
                    note={binsFull ? "нужна уборка" : "переполнений нет"} tone={binsFull ? "warn" : "good"}
                    question="Какие урны переполнены прямо сейчас?" />
                <Tile {...common} icon={<MapPin className={iconClass} />} label="Оснащено остановок" value={String(stops.withCameras)}
                    unit="с камерами"
                    note={`${stops.withSensors} — с датчиками`} tone="plain"
                    question="Покажи оснащение и связь по микрорайонам" />
            </div>
        </div>
    )
}
