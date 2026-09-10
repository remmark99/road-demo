"use client"

import { useEffect, useMemo, useState } from "react"
import { addDays, format, isSameDay, startOfDay, subDays } from "date-fns"
import { ru } from "date-fns/locale"
import {
  CalendarIcon,
  Camera as CameraIcon,
  Loader2,
  Router,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import {
  fetchEquipmentOutages,
  fetchEquipmentState,
  type EquipmentOutage,
  type EquipmentState,
  type EquipmentType,
} from "@/lib/api/equipment"
import { getStopComplexByLocationId } from "@/lib/stop-analytics-config"

const REFRESH_INTERVAL_MS = 60_000
/** Как EQUIPMENT_ALERT_AFTER_SEC на бэкенде: короче — обрыв связи, а не простой. */
const SHORT_OUTAGE_MS = 10 * 60_000

type DeviceKey = `${EquipmentType}:${number}`

function deviceKey(type: EquipmentType, id: number): DeviceKey {
  return `${type}:${id}`
}

function deviceLabel(type: EquipmentType, id: number) {
  return type === "camera" ? `Камера ${id}` : "Контроллер"
}

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

function formatDurationMs(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  if (totalMinutes < 1) return "меньше минуты"
  if (totalMinutes < 60) return `${totalMinutes} мин.`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `${hours} ч. ${minutes} мин.` : `${hours} ч.`

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days} дн. ${restHours} ч.` : `${days} дн.`
}

/** Время внутри выбранного дня, дата с временем — за его пределами. */
function formatMoment(iso: string, day: Date) {
  const date = new Date(iso)
  return isSameDay(date, day)
    ? format(date, "HH:mm", { locale: ru })
    : format(date, "d MMM HH:mm", { locale: ru })
}

function outageDurationMs(outage: EquipmentOutage, now: number) {
  const end = outage.ended_at ? Date.parse(outage.ended_at) : now
  return end - Date.parse(outage.started_at)
}

function stopLabel(
  item: { location_id: string | null; bus_stop_id: number | null },
  state: EquipmentState | undefined
) {
  const complex = getStopComplexByLocationId(item.location_id ?? state?.location_id)
  if (complex) return complex.stopName
  if (state?.stop_name) return state.stop_name
  if (item.location_id) return `Остановка ${item.location_id}`
  if (item.bus_stop_id !== null) return `Остановка №${item.bus_stop_id}`
  return "Остановка не указана"
}

function DeviceIcon({ type, className }: { type: EquipmentType; className: string }) {
  return type === "camera" ? <CameraIcon className={className} /> : <Router className={className} />
}

function SummaryCard({
  Icon,
  title,
  value,
  total,
  caption,
  alert,
}: {
  Icon: LucideIcon
  title: string
  value: number
  total: number
  caption: string
  alert: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`text-3xl font-semibold tabular-nums ${alert ? "text-red-400" : ""}`}>
            {value}
          </span>
          <span className="text-sm text-muted-foreground">из {total}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{caption}</div>
      </CardContent>
    </Card>
  )
}

export function EquipmentTab() {
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()))
  const [showShort, setShowShort] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [states, setStates] = useState<EquipmentState[]>([])
  const [outages, setOutages] = useState<EquipmentOutage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [stateResult, outageResult] = await Promise.all([
        fetchEquipmentState(),
        fetchEquipmentOutages(day, addDays(day, 1)),
      ])
      if (cancelled) return

      setStates(stateResult.data)
      setOutages(outageResult.data)
      setError(stateResult.error ?? outageResult.error)
      setNow(Date.now())
      setLoading(false)
    }

    load()
    const timer = window.setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [day])

  const selectDay = (date: Date) => {
    const next = startOfDay(date)
    if (next.getTime() === day.getTime()) return
    setLoading(true)
    setDay(next)
  }

  const today = new Date(now)
  const isToday = isSameDay(day, today)
  const isYesterday = isSameDay(day, subDays(today, 1))
  const dayCaption = isToday
    ? "не работало сегодня"
    : isYesterday
      ? "не работало вчера"
      : `не работало ${format(day, "d MMMM", { locale: ru })}`

  const stateByKey = useMemo(
    () => new Map(states.map((s) => [deviceKey(s.equipment_type, s.equipment_id), s])),
    [states]
  )

  const visibleOutages = useMemo(
    () =>
      outages
        .filter((o) => showShort || outageDurationMs(o, now) >= SHORT_OUTAGE_MS)
        .sort((a, b) => {
          // Незакрытые — сверху, дальше по началу, свежие первыми.
          if ((a.ended_at === null) !== (b.ended_at === null)) return a.ended_at === null ? -1 : 1
          return Date.parse(b.started_at) - Date.parse(a.started_at)
        }),
    [outages, showShort, now]
  )

  const inventory = {
    camera: states.filter((s) => s.equipment_type === "camera").length,
    controller: states.filter((s) => s.equipment_type === "controller").length,
  }
  const affected = (type: EquipmentType) =>
    new Set(visibleOutages.filter((o) => o.equipment_type === type).map((o) => o.equipment_id))
      .size
  const offlineNow = states
    .filter((s) => s.status === "offline")
    .sort((a, b) => Date.parse(a.status_since ?? "") - Date.parse(b.status_since ?? ""))
  const unknownCount = states.filter((s) => s.status === "unknown").length

  return (
    <>
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isToday ? "default" : "outline"}
              size="sm"
              onClick={() => selectDay(new Date())}
            >
              Сегодня
            </Button>
            <Button
              variant={isYesterday ? "default" : "outline"}
              size="sm"
              onClick={() => selectDay(subDays(new Date(), 1))}
            >
              Вчера
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 font-normal">
                  <CalendarIcon className="h-4 w-4" />
                  {format(day, "d MMMM yyyy", { locale: ru })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={day}
                  defaultMonth={day}
                  onSelect={(date) => {
                    if (!date) return
                    selectDay(date)
                    setCalendarOpen(false)
                  }}
                  locale={ru}
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2 md:ml-auto">
            <Switch id="equipment-short-outages" checked={showShort} onCheckedChange={setShowShort} />
            <Label htmlFor="equipment-short-outages" className="text-sm text-muted-foreground">
              Показывать кратковременные обрывы (до 10 мин.)
            </Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <SummaryCard
              Icon={CameraIcon}
              title="Камеры"
              value={affected("camera")}
              total={inventory.camera}
              caption={dayCaption}
              alert={affected("camera") > 0}
            />
            <SummaryCard
              Icon={Router}
              title="Контроллеры"
              value={affected("controller")}
              total={inventory.controller}
              caption={dayCaption}
              alert={affected("controller") > 0}
            />
            <SummaryCard
              Icon={WifiOff}
              title="Не работает сейчас"
              value={offlineNow.length}
              total={inventory.camera + inventory.controller}
              caption="камеры и контроллеры без связи"
              alert={offlineNow.length > 0}
            />
          </div>

          <h2 className="mb-3 text-base font-semibold">Сейчас не в сети</h2>
          {offlineNow.length === 0 ? (
            <Card className="mb-6">
              <CardContent className="p-4 text-sm text-muted-foreground">
                {states.length === 0
                  ? "Сервис контроля оборудования ещё не передавал данных"
                  : "Всё оборудование на связи"}
              </CardContent>
            </Card>
          ) : (
            <div className="mb-6 space-y-2">
              {offlineNow.map((state) => (
                <Card key={deviceKey(state.equipment_type, state.equipment_id)}>
                  <CardContent className="grid grid-cols-1 items-center gap-2 p-4 text-sm md:grid-cols-12 md:gap-4">
                    <div className="flex items-center gap-2 font-medium md:col-span-3">
                      <DeviceIcon type={state.equipment_type} className="h-4 w-4 text-red-400" />
                      {deviceLabel(state.equipment_type, state.equipment_id)}
                    </div>
                    <div className="truncate md:col-span-4">{stopLabel(state, state)}</div>
                    <div className="text-muted-foreground md:col-span-3">
                      {state.status_since
                        ? `нет связи с ${format(new Date(state.status_since), "d MMM HH:mm", { locale: ru })}`
                        : "нет связи"}
                    </div>
                    <div className="font-medium tabular-nums md:col-span-2 md:text-right">
                      {state.status_since
                        ? formatDurationMs(now - Date.parse(state.status_since))
                        : "—"}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <h2 className="mb-3 text-base font-semibold">
            Отключения за {format(day, "d MMMM yyyy", { locale: ru })}
          </h2>
          {visibleOutages.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Отключений не было
                {!showShort && outages.length > 0 && (
                  <>
                    {" "}
                    (скрыто кратковременных обрывов: {outages.length} — включите переключатель
                    выше)
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="hidden gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-12">
                <div className="col-span-3">Оборудование</div>
                <div className="col-span-3">Остановка</div>
                <div className="col-span-3">Период</div>
                <div className="col-span-2">Длительность</div>
                <div className="col-span-1"></div>
              </div>
              {visibleOutages.map((outage) => {
                const state = stateByKey.get(deviceKey(outage.equipment_type, outage.equipment_id))
                const open = outage.ended_at === null
                return (
                  <Card key={outage.id}>
                    <CardContent className="grid grid-cols-1 items-center gap-2 p-4 text-sm md:grid-cols-12 md:gap-4">
                      <div className="flex items-center gap-2 font-medium md:col-span-3">
                        <DeviceIcon
                          type={outage.equipment_type}
                          className={`h-4 w-4 ${open ? "text-red-400" : "text-muted-foreground"}`}
                        />
                        {deviceLabel(outage.equipment_type, outage.equipment_id)}
                      </div>
                      <div className="truncate md:col-span-3">{stopLabel(outage, state)}</div>
                      <div className="text-muted-foreground md:col-span-3">
                        {formatMoment(outage.started_at, day)} —{" "}
                        {outage.ended_at ? formatMoment(outage.ended_at, day) : "сейчас"}
                      </div>
                      <div className="font-medium tabular-nums md:col-span-2">
                        {formatDurationMs(outageDurationMs(outage, now))}
                      </div>
                      <div className="md:col-span-1 md:flex md:justify-end">
                        {open ? (
                          <Badge className="border-red-500/30 bg-red-500/20 text-red-400">
                            Не работает
                          </Badge>
                        ) : outage.resolution === "removed" ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Снято с контроля
                          </Badge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {unknownCount > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Для {unknownCount} {plural(unknownCount, ["устройства", "устройств", "устройств"])}{" "}
              ещё нет данных о связи — они не учитываются в отключениях.
            </p>
          )}
        </>
      )}
    </>
  )
}
