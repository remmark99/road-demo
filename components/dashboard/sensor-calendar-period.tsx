"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarDays } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sensorCalendarBounds } from "@/lib/sensor-history-period"

type Period = { from: string; to: string }
export function SensorCalendarPeriod({ value, onChange }: { value: Period | null; onChange: (value: Period) => void }) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<Period>({ from: "", to: "" })
    const date = (day: string) => day ? new Date(`${day}T12:00:00`) : undefined
    let error = ""
    try { sensorCalendarBounds(draft.from, draft.to) } catch (e) { error = (e as Error).message }
    return <Popover open={open} onOpenChange={next => { if (next) setDraft(value ?? { from: "", to: "" }); setOpen(next) }}>
        <PopoverTrigger asChild><Button variant="outline" className="gap-2 font-normal"><CalendarDays className="h-4 w-4" />{value ? `${value.from.split("-").reverse().join(".")} — ${value.to.split("-").reverse().join(".")}` : "Выбрать даты"}</Button></PopoverTrigger>
        <PopoverContent align="start" className="w-[min(340px,calc(100vw-24px))] p-3">
            <Calendar mode="range" locale={ru} numberOfMonths={1} selected={{ from: date(draft.from), to: date(draft.to) }} defaultMonth={date(value?.from ?? "")} onSelect={range => setDraft({ from: range?.from ? format(range.from, "yyyy-MM-dd") : "", to: range?.to ? format(range.to, "yyyy-MM-dd") : range?.from ? format(range.from, "yyyy-MM-dd") : "" })} />
            <div className="grid grid-cols-2 gap-2">
                <div><Label htmlFor="sensor-period-from">С</Label><Input id="sensor-period-from" type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></div>
                <div><Label htmlFor="sensor-period-to">По</Label><Input id="sensor-period-to" type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Целые дни, время Сургута (UTC+5).</p>
            {error && draft.from && draft.to && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
            <Button className="mt-3 w-full" disabled={Boolean(error)} onClick={() => { onChange(draft); setOpen(false) }}>Применить</Button>
        </PopoverContent>
    </Popover>
}
