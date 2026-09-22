"use client"

import { useId, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface DateRange { from: string; to: string }

const EMPTY: DateRange = { from: "", to: "" }
const day = (value: string) => value ? new Date(`${value}T12:00:00`) : undefined
const human = (value: string) => value.split("-").reverse().join(".")

/** Единый календарь периода: диапазон мышью или вводом дат, конец — включительно. */
export function DateRangePicker({ value, onChange, validate, label, className, open, onOpenChange }: {
    value: DateRange | null
    onChange: (value: DateRange) => void
    /** Бросает Error с текстом ошибки, если период недопустим. */
    validate?: (range: DateRange) => void
    /** Текст кнопки вместо выбранного диапазона — когда период задан пресетом. */
    label?: string
    className?: string
    open?: boolean
    onOpenChange?: (open: boolean) => void
}) {
    const id = useId()
    const [selfOpen, setSelfOpen] = useState(false)
    const [draft, setDraft] = useState<DateRange>(value ?? EMPTY)
    const [wasOpen, setWasOpen] = useState(false)
    const isOpen = open ?? selfOpen
    if (isOpen !== wasOpen) { setWasOpen(isOpen); if (isOpen) setDraft(value ?? EMPTY) }
    const setOpen = (next: boolean) => { setSelfOpen(next); onOpenChange?.(next) }
    let error = ""
    if (draft.from && draft.to) try { validate?.(draft) } catch (e) { error = (e as Error).message }
    return <Popover open={isOpen} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button variant="outline" className={cn("gap-2 font-normal", className)} aria-label="Выбрать даты">
                <CalendarDays className="h-4 w-4" />{label ?? (value?.from ? `${human(value.from)} — ${human(value.to || value.from)}` : "Выбрать даты")}
            </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(300px,calc(100vw-24px))] p-3">
            <Calendar mode="range" locale={ru} numberOfMonths={1} className="w-full p-0" selected={{ from: day(draft.from), to: day(draft.to) }} defaultMonth={day(draft.from || value?.from || "")}
                onSelect={range => setDraft({ from: range?.from ? format(range.from, "yyyy-MM-dd") : "", to: range?.to ? format(range.to, "yyyy-MM-dd") : "" })} />
            <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2"><Label htmlFor={`${id}-from`} className="w-[124px] shrink-0">С</Label><Input id={`${id}-from`} type="date" className="min-w-0 flex-1" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></div>
                <div className="flex items-center gap-2"><Label htmlFor={`${id}-to`} className="w-[124px] shrink-0">По включительно</Label><Input id={`${id}-to`} type="date" className="min-w-0 flex-1" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></div>
            </div>
            {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
            <Button className="mt-3 w-full" disabled={Boolean(error) || !draft.from} onClick={() => { onChange({ from: draft.from, to: draft.to || draft.from }); setOpen(false) }}>Применить</Button>
        </PopoverContent>
    </Popover>
}
