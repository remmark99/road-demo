"use client"

// Срез на момент: одна кнопка с датой и временем. По нажатию — календарь и поле времени,
// карта показывает состояние всей аппаратуры на выбранный момент. «Сейчас» возвращает живой режим.
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { RoadStatus } from "@/lib/types"

/** История для среза читается за сутки до выбранного момента: столько нужно тепловой карте и состоянию остановок. */
const WINDOW_MS = 24 * 3_600_000
const SURGUT_OFFSET_MS = 5 * 3_600_000
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const LABEL = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yekaterinburg", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })

interface MomentPickerProps {
  onTimeChange: (time: Date, statusOverride: Record<string, RoadStatus>, live: boolean, from: Date, to: Date) => void
}

/** Дата и время по Сургуту (UTC+5) → момент. */
function surgutMoment(day: Date, time: string) {
  return new Date(`${format(day, "yyyy-MM-dd")}T${time}:00+05:00`)
}

/** Момент → день календаря (локальная полночь той же даты по Сургуту) и «ЧЧ:ММ» по Сургуту. */
function surgutParts(at: Date) {
  const iso = new Date(at.getTime() + SURGUT_OFFSET_MS).toISOString()
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return { day: new Date(y, m - 1, d), time: iso.slice(11, 16) }
}

/** Цифры в «ЧЧ:ММ»: двоеточие ставится само. */
function normalizeTime(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

export function MomentPicker({ onTimeChange }: MomentPickerProps) {
  const [moment, setMoment] = useState<Date | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState<Date | undefined>()
  const [time, setTime] = useState("")

  // Живой режим двигается вместе со временем.
  useEffect(() => {
    if (moment) return
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [moment])

  useEffect(() => {
    const at = moment ?? now
    onTimeChange(at, {}, moment === null, new Date(at.getTime() - WINDOW_MS), at)
  }, [moment, now, onTimeChange])

  const shown = moment ?? now
  const candidate = day && TIME_RE.test(time) ? surgutMoment(day, time) : null
  const future = candidate !== null && candidate.getTime() > Date.now()

  const toggle = (next: boolean) => {
    if (next) {
      // Окно открывается на том моменте, который сейчас на карте.
      const parts = surgutParts(shown)
      setDay(parts.day)
      setTime(parts.time)
    }
    setOpen(next)
  }
  const apply = () => {
    if (!candidate || future) return
    setMoment(candidate)
    setOpen(false)
  }
  const live = () => {
    setMoment(null)
    setNow(new Date())
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-md">
      <Popover open={open} onOpenChange={toggle}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn("h-8 px-3 font-normal tabular-nums", moment && "text-primary")} aria-label="Дата и время на карте">
            {LABEL.format(shown)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" side="top">
          <Calendar mode="single" selected={day} onSelect={setDay} disabled={{ after: new Date() }} locale={ru} />
          <div className="flex items-center gap-2 border-t p-3">
            <Input
              value={time}
              onChange={(event) => setTime(normalizeTime(event.target.value))}
              onKeyDown={(event) => { if (event.key === "Enter") apply() }}
              inputMode="numeric"
              placeholder="ЧЧ:ММ"
              aria-label="Время"
              className="h-8 w-20 text-center tabular-nums"
            />
            <Button size="sm" className="h-8 flex-1" onClick={apply} disabled={!candidate || future}>Показать</Button>
          </div>
          {future && <p className="px-3 pb-3 text-xs text-destructive">Момент ещё не наступил</p>}
        </PopoverContent>
      </Popover>
      {moment && (
        <Button variant="ghost" size="sm" className="h-8 px-3" onClick={live}>Сейчас</Button>
      )}
    </div>
  )
}
