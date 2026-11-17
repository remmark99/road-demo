"use client"

// Срез на момент: дата по календарю и время — карта показывает состояние всей аппаратуры
// на этот момент. «Сейчас» возвращает живой режим. Заменяет слайдер времени.
import { useEffect, useState } from "react"
import { CalendarIcon, Clock, Radio } from "lucide-react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { RoadStatus } from "@/lib/types"

/** История для среза читается за сутки до выбранного момента: столько нужно тепловой карте и состоянию остановок. */
const WINDOW_MS = 24 * 3_600_000

interface MomentPickerProps {
  onTimeChange: (time: Date, statusOverride: Record<string, RoadStatus>, live: boolean, from: Date, to: Date) => void
}

/** Дата и время по Сургуту (UTC+5) → момент. */
function surgutMoment(day: Date, time: string) {
  return new Date(`${format(day, "yyyy-MM-dd")}T${time}:00+05:00`)
}

function surgutTimeNow() {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(11, 16)
}

export function MomentPicker({ onTimeChange }: MomentPickerProps) {
  const [day, setDay] = useState<Date | undefined>()
  const [time, setTime] = useState(surgutTimeNow)
  const [moment, setMoment] = useState<Date | null>(null)
  const [now, setNow] = useState(() => new Date())

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

  const candidate = day ? surgutMoment(day, time) : null
  const invalid = candidate !== null && (Number.isNaN(candidate.getTime()) || candidate.getTime() > Date.now())

  const show = () => {
    if (candidate && !invalid) setMoment(candidate)
  }
  const live = () => {
    setMoment(null)
    setDay(undefined)
    setTime(surgutTimeNow())
    setNow(new Date())
  }

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 justify-start font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {day ? format(day, "d MMMM yyyy", { locale: ru }) : "Дата"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={day} onSelect={setDay} disabled={{ after: new Date() }} locale={ru} />
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-8 w-[6.5rem]" aria-label="Время" />
        </div>
        <Button size="sm" className="h-8" onClick={show} disabled={!candidate || invalid}>Показать срез</Button>
        <Button variant={moment ? "outline" : "secondary"} size="sm" className="h-8 gap-1.5" onClick={live}>
          <Radio className="h-3.5 w-3.5" />
          Сейчас
        </Button>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {moment
          ? `Срез на ${moment.toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
          : "Текущее состояние"}
        {invalid && <span className="ml-2 text-destructive">Момент в будущем</span>}
      </div>
    </div>
  )
}
