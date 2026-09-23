"use client"

import { useEffect, useMemo, useState } from "react"
import { EquipmentExport } from "@/components/notifications/equipment-export"
import { addDays, format, isSameDay, startOfDay, subDays } from "date-fns"
import { ru } from "date-fns/locale"
import {
  CalendarIcon,
  Camera as CameraIcon,
  Loader2,
  Router,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchStopDirectory, type BusStopProperties } from "@/lib/api/bus-stops"
import { equipmentLocalTime } from "@/lib/exports/equipment-hours"
import { getStopComplexByLocationId } from "@/lib/stop-analytics-config"

const REFRESH_INTERVAL_MS = 60_000
/** Как EQUIPMENT_ALERT_AFTER_SEC на бэкенде: короче — обрыв связи, а не простой. */
const SHORT_OUTAGE_MS = 10 * 60_000

type DeviceKey = `${EquipmentType}:${number}`

function deviceKey(type: EquipmentType, id: number): DeviceKey {
  return `${type}:${id}`
}

function deviceLabel(type: EquipmentType, id: number) {
  return type === "camera" ? `Камера ${id}` : "Датчики"
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

/** All equipment timestamps use the city timezone (UTC+5). */
function formatMoment(iso: string) {
  return equipmentLocalTime(Date.parse(iso)).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1')
}

function outageDurationMs(outage: EquipmentOutage, now: number) {
  const end = outage.ended_at ? Date.parse(outage.ended_at) : now
  return end - Date.parse(outage.started_at)
}

function stopLabel(
  item: { location_id: string | null; bus_stop_id: number | null },
  state: EquipmentState | undefined,
  stops: BusStopProperties[]
) {
  const stop = stops.find(s => s.id === (item.bus_stop_id ?? state?.bus_stop_id))
  if (stop) return [stop.name, stop.short_name ? `№ ${stop.short_name}` : null, stop.address].filter(Boolean).join(' · ')
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

export function StopEquipmentAnalytics() {
  const [deviceType, setDeviceType] = useState<EquipmentType>("camera")
  const [stops, setStops] = useState<BusStopProperties[]>([])
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
    fetchStopDirectory().then(data => { if (!cancelled) setStops(data.features.map(f => f.properties)) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [stateResult, outageResult] = await Promise.all([
        fetchEquipmentState(),
        fetchEquipmentOutages(new Date(`${format(day, 'yyyy-MM-dd')}T00:00:00+05:00`), new Date(`${format(addDays(day, 1), 'yyyy-MM-dd')}T00:00:00+05:00`)),
      ])
      if (cancelled) return

      setStates(stateResult.data)
      setOutages(outageResult.data)
      setError(stateResult.error ?? outageResult.error)
      setNow(Date.now())
      setLoading(false)
    }

    const refresh = () => load().catch(() => { if (!cancelled) { setError('Не удалось загрузить оборудование'); setLoading(false) } })
    void refresh()
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS)
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
  const stateByKey = useMemo(
    () => new Map(states.map((s) => [deviceKey(s.equipment_type, s.equipment_id), s])),
    [states]
  )

  const visibleOutages = useMemo(
    () =>
      outages
        .filter(o => o.equipment_type === deviceType)
        .filter((o) => showShort || outageDurationMs(o, now) >= SHORT_OUTAGE_MS)
        .sort((a, b) => {
          // Незакрытые — сверху, дальше по началу, свежие первыми.
          if ((a.ended_at === null) !== (b.ended_at === null)) return a.ended_at === null ? -1 : 1
          return Date.parse(b.started_at) - Date.parse(a.started_at)
        }),
    [outages, showShort, now, deviceType]
  )

  const offlineNow = states
    .filter((s) => s.equipment_type === deviceType && s.status === "offline")
    .sort((a, b) => Date.parse(a.status_since ?? "") - Date.parse(b.status_since ?? ""))
  const unknownCount = states.filter((s) => s.equipment_type === deviceType && s.status === "unknown").length

  return (
    <div className="p-4 md:p-6">
      <EquipmentExport compact />
      <Tabs value={deviceType} onValueChange={value => setDeviceType(value as EquipmentType)} className="mb-4">
        <TabsList aria-label="Тип оборудования"><TabsTrigger value="camera">Камеры</TabsTrigger><TabsTrigger value="controller">Датчики</TabsTrigger></TabsList>
      <div role="tabpanel" aria-label={deviceType === "camera" ? "Камеры" : "Датчики"}>
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
                  endMonth={new Date()}
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
                    <div className="break-words md:col-span-4">{stopLabel(state, state, stops)}</div>
                    <div className="text-muted-foreground md:col-span-3">
                      {state.status_since
                        ? `нет связи с ${formatMoment(state.status_since)}`
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
                {!showShort && outages.some(o => o.equipment_type === deviceType) && (
                  <>
                    {" "}
                    (скрыто кратковременных обрывов: {outages.filter(o => o.equipment_type === deviceType).length} — включите переключатель
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
                      <div className="break-words md:col-span-3">{stopLabel(outage, state, stops)}</div>
                      <div className="text-muted-foreground md:col-span-3">
                        {formatMoment(outage.started_at)} —{" "}
                        {outage.ended_at ? formatMoment(outage.ended_at) : "сейчас"}
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
                        ) : <Badge variant="outline">Восстановлено</Badge>}
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
      </div>
      </Tabs>
    </div>
  )
}
