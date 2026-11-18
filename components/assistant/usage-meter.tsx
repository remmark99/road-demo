"use client"

import { useState } from "react"
import { AlertTriangle, Gauge, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import {
    LIMIT_MAX_TOKENS, LIMIT_MIN_TOKENS, LIMIT_STEP_TOKENS, formatTokens, monthName, resetDay, type AssistantUsageSummary,
} from "@/lib/assistant/usage-shared"
import { cn } from "@/lib/utils"

const PRESETS = [50_000_000, 100_000_000, 150_000_000, 200_000_000]

/** Доля расхода → цвет: до 70 % спокойный, до 90 % жёлтый, дальше красный. */
export function usageTone(share: number) {
    if (share >= 0.9) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400", ring: "ring-red-500/30" }
    if (share >= 0.7) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/30" }
    return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-transparent" }
}

function Bar({ share, forecast, className }: { share: number; forecast?: number | null; className?: string }) {
    const tone = usageTone(share)
    return (
        <div className={cn("relative h-1.5 overflow-hidden rounded-full bg-muted", className)}>
            {forecast != null && forecast > share && (
                <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/10" style={{ width: `${Math.min(100, forecast * 100)}%` }} />
            )}
            <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", tone.bar)} style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100))}%` }} />
        </div>
    )
}

/** Лимит токенов ассистента в чате: полоска расхода, подробности и бегунок лимита для администратора. */
export function UsageMeter({ summary, onSaveLimit }: { summary: AssistantUsageSummary | null; onSaveLimit: (limitTokens: number) => Promise<void> }) {
    const [draft, setDraft] = useState(summary?.limitTokens ?? 100_000_000)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    if (!summary) return <div className="hidden h-8 w-36 animate-pulse rounded-full bg-muted sm:block" />

    const share = summary.limitTokens > 0 ? summary.spentTokens / summary.limitTokens : 1
    const tone = usageTone(share)
    const left = Math.max(0, summary.limitTokens - summary.spentTokens)
    const average = summary.requests ? summary.spentTokens / summary.requests : null
    const forecastShare = summary.forecastTokens != null && summary.limitTokens > 0 ? summary.forecastTokens / summary.limitTokens : null
    const draftShare = draft > 0 ? summary.spentTokens / draft : 1

    return (
        <Popover onOpenChange={open => { if (open) { setDraft(summary.limitTokens); setError("") } }}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn("group flex h-8 items-center gap-2 rounded-full px-2.5 text-xs text-muted-foreground ring-1 ring-inset transition-colors hover:bg-muted hover:text-foreground", tone.ring)}
                    aria-label="Лимит токенов ИИ-ассистента"
                    title="Токены ассистента за месяц"
                >
                    {share >= 0.9 ? <AlertTriangle className={cn("h-3.5 w-3.5", tone.text)} /> : <Gauge className="h-3.5 w-3.5" />}
                    <span className="hidden tabular-nums sm:inline">
                        <span className="font-medium text-foreground">{formatTokens(summary.spentTokens)}</span> / {formatTokens(summary.limitTokens)}
                    </span>
                    <span className={cn("tabular-nums font-semibold sm:hidden", tone.text)}>{Math.round(share * 100)}%</span>
                    <Bar share={share} className="hidden w-12 md:block" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] p-0">
                <div className="space-y-4 p-4">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Токены ассистента · {monthName(summary.month)}</div>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                            <span className="text-2xl font-semibold tabular-nums">{formatTokens(summary.spentTokens)}</span>
                            <span className="text-sm text-muted-foreground">из {formatTokens(summary.limitTokens)}</span>
                            <span className={cn("ml-auto text-sm font-semibold tabular-nums", tone.text)}>{Math.round(share * 100)}%</span>
                        </div>
                        <Bar share={share} forecast={forecastShare} className="mt-2 h-2" />
                        <div className="mt-1.5 text-[11px] text-muted-foreground">Счётчик обнулится {resetDay(summary.resetsAt)}</div>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 text-xs">
                        {[
                            ["Осталось", formatTokens(left)],
                            ["Ответов за месяц", summary.requests.toLocaleString("ru-RU")],
                            ["В среднем на ответ", average === null ? "—" : formatTokens(average)],
                            ["Прогноз на месяц", summary.forecastTokens === null ? "—" : `≈ ${formatTokens(summary.forecastTokens)}`],
                        ].map(([label, value], index) => (
                            <div key={label} className="rounded-lg bg-muted/50 px-2.5 py-2">
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className={cn("mt-0.5 text-sm font-semibold tabular-nums",
                                    index === 3 && summary.forecastTokens !== null && summary.forecastTokens > summary.limitTokens && "text-amber-600 dark:text-amber-400")}>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                {summary.canEdit && (
                    <div className="space-y-3 border-t bg-muted/20 p-4">
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium">Месячный лимит</span>
                            <span className="text-lg font-semibold tabular-nums">{formatTokens(draft)}</span>
                        </div>
                        <Slider value={[draft]} min={LIMIT_MIN_TOKENS} max={LIMIT_MAX_TOKENS} step={LIMIT_STEP_TOKENS} onValueChange={([value]) => setDraft(value)} aria-label="Месячный лимит, токенов" />
                        <div className="flex flex-wrap gap-1.5">
                            {PRESETS.map(value => (
                                <button key={value} type="button" onClick={() => setDraft(value)}
                                    className={cn("rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors",
                                        draft === value ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
                                    {formatTokens(value)}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                            {draftShare >= 1
                                ? "С таким лимитом ассистент сразу перестанет отвечать до конца месяца."
                                : `Когда счётчик дойдёт до лимита, ассистент перестанет отвечать до ${resetDay(summary.resetsAt)}. Лимит общий для всех пользователей.`}
                        </p>
                        {!summary.persisted && (
                            <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                                Счётчик пока в памяти сервера и сбросится при перезапуске: примените миграцию sql/assistant_usage.sql.
                            </p>
                        )}
                        {error && <p className="text-xs text-destructive">{error}</p>}
                        <Button size="sm" className="w-full" disabled={saving || draft === summary.limitTokens} onClick={async () => {
                            setSaving(true)
                            setError("")
                            try { await onSaveLimit(draft) } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить") } finally { setSaving(false) }
                        }}>
                            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                            {draft === summary.limitTokens ? "Лимит сохранён" : `Сохранить лимит ${formatTokens(draft)}`}
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}
