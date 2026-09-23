"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface DateRange { from: string; to: string }

const EMPTY: DateRange = { from: "", to: "" }
const day = (value: string) => value ? new Date(`${value}T12:00:00`) : undefined
const iso = (date: Date) => format(date, "yyyy-MM-dd")
const short = (value: string) => value.slice(8, 10) + "." + value.slice(5, 7) + "." + value.slice(2, 4)

/** Единый календарь периода: диапазон выбирается прямо в календаре, конец — включительно. */
export function DateRangePicker({ value, onChange, label, disabled, className, open, onOpenChange }: {
    value: DateRange | null
    onChange: (value: DateRange) => void
    /** Текст кнопки вместо выбранного диапазона — когда период задан пресетом. */
    label?: string
    disabled?: boolean
    className?: string
    open?: boolean
    onOpenChange?: (open: boolean) => void
}) {
    const [selfOpen, setSelfOpen] = useState(false)
    const [draft, setDraft] = useState<DateRange>(value ?? EMPTY)
    const [wasOpen, setWasOpen] = useState(false)
    const isOpen = open ?? selfOpen
    if (isOpen !== wasOpen) { setWasOpen(isOpen); if (isOpen) setDraft(value ?? EMPTY) }
    const setOpen = (next: boolean) => { setSelfOpen(next); onOpenChange?.(next) }
    return <Popover open={isOpen} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button variant="outline" disabled={disabled} className={cn("gap-2 font-normal", className)}>
                <CalendarIcon className="h-4 w-4" />{label ?? (value?.from ? `${short(value.from)} — ${short(value.to || value.from)}` : "Период")}
            </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
            <Calendar mode="range" locale={ru} numberOfMonths={2} selected={{ from: day(draft.from), to: day(draft.to) }} defaultMonth={day(draft.from || value?.from || "")}
                endMonth={new Date()} disabled={date => date > new Date()}
                onSelect={range => setDraft({ from: range?.from ? iso(range.from) : "", to: range?.to ? iso(range.to) : "" })} />
            <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">{draft.from ? draft.to ? `${short(draft.from)} — ${short(draft.to)}` : `С ${short(draft.from)}` : "Выберите даты"}</p>
                <Button size="sm" disabled={!draft.from} onClick={() => { onChange({ from: draft.from, to: draft.to || draft.from }); setOpen(false) }}>Применить</Button>
            </div>
        </PopoverContent>
    </Popover>
}
