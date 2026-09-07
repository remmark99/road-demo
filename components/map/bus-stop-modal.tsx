import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Wifi, WifiOff, Thermometer, Droplets, Zap, AlertTriangle, ShieldAlert, BusFront, Hammer } from "lucide-react"
import { fetchLatestMeasurements, subscribeMeasurements, type SensorReading } from "@/lib/api/measurements"
import { fetchControllerAlerts, type ControllerAlert } from "@/lib/api/controller-alerts"
import type { BusStopSensorData } from "@/lib/api/bus-stops"
import { ACTIVITY_STATUS_LABELS, resolveActivityStatus } from "@/lib/api/stop-activity"

export type { BusStopSensorData }

export interface SelectedBusStop {
    id: number
    name: string | null
    description: string | null
    address: string | null
    sensor_data?: BusStopSensorData
}

interface BusStopModalProps {
    busStop: SelectedBusStop | null
    onClose: () => void
}

function formatTime(isoString: string | null | undefined) {
    if (!isoString) return "—"
    try {
        const d = new Date(isoString)
        return d.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
    } catch {
        return "—"
    }
}

export function BusStopModal({ busStop, onClose }: BusStopModalProps) {
    const [realReadings, setRealReadings] = useState<SensorReading[]>([])
    const [realAlerts, setRealAlerts] = useState<ControllerAlert[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!busStop) {
            setRealReadings([])
            setRealAlerts([])
            return
        }

        let isMounted = true
        setLoading(true)

        async function loadData() {
            try {
                const [readings, alertsResult] = await Promise.all([
                    fetchLatestMeasurements(busStop?.id),
                    fetchControllerAlerts({ busStopId: busStop?.id, limit: 10 }),
                ])
                if (isMounted) {
                    setRealReadings(readings)
                    setRealAlerts(alertsResult.alerts || [])
                    setLoading(false)
                }
            } catch (e) {
                console.error("Error loading bus stop telemetry:", e)
                if (isMounted) setLoading(false)
            }
        }

        loadData()

        const unsubscribe = subscribeMeasurements(() => {
            loadData()
        }, busStop.id)

        return () => {
            isMounted = false
            unsubscribe()
        }
    }, [busStop])

    if (!busStop) return null

    // Determine equipment presence and online status based strictly on real readings & database status
    const dht13 = realReadings.find((r) => r.element === 13) // Temperature & Humidity
    const temp14 = realReadings.find((r) => r.element === 14) // Temp sensor 2
    const dio1 = realReadings.find((r) => r.element === 1) // Digital input

    const hasRealReadings = realReadings.some(
        (r) =>
            r.temperature !== null ||
            r.humidity !== null ||
            r.digitalState !== null ||
            r.temperatureAlarm !== null ||
            r.humidityAlarm !== null ||
            r.digitalAlarm !== null
    )

    // Датчики считаются рабочими, если контроллер прислал свежие показания;
    // камеры — если хотя бы одна привязанная к остановке камера в сети.
    const sensorsOnline = hasRealReadings || Boolean(busStop.sensor_data?.sensors_online)
    const camerasOnline = Boolean(busStop.sensor_data?.cameras_online)
    const onlineCameraCount = busStop.sensor_data?.online_camera_count ?? 0
    const activityStatus = resolveActivityStatus(sensorsOnline, camerasOnline)
    const hasEquipment = hasRealReadings || camerasOnline || Boolean(busStop.sensor_data?.has_equipment)

    // Real metric values (no fallbacks to fake random values)
    const tempOut = dht13?.temperature ?? undefined
    const tempIn = temp14?.temperature ?? undefined
    const humidity = dht13?.humidity ?? undefined

    // Real alarm conditions (derived strictly from active real alarms or non-normal statuses)
    const glassBrokenAlarm = realReadings.some(
        (r) => r.digitalAlarm === "alarm" || r.digitalAlarm === "critical"
    ) || realAlerts.some((a) => a.category === "glass_break" && (a.alarm === "alarm" || a.alarm === "critical"))

    const heaterFaultAlarm = realReadings.some(
        (r) => r.element === 1 && (r.digitalAlarm === "critical" || r.digitalAlarm === "warning")
    )

    const tempWarningAlarm = realReadings.some(
        (r) => r.temperatureAlarm === "warning" || r.temperatureAlarm === "critical"
    )

    const hasAnyRealProblems = glassBrokenAlarm || heaterFaultAlarm || tempWarningAlarm

    return (
        <Dialog open={!!busStop} onOpenChange={onClose}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BusFront className="h-5 w-5 text-primary" />
                        {busStop.name || "Остановка общественного транспорта"}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2">
                        {busStop.address || busStop.description || "Нет адреса"}
                        {!hasEquipment ? (
                            <Badge variant="secondary" className="ml-auto text-blue-500 bg-blue-500/10 border-blue-500/20">
                                Без оборудования
                            </Badge>
                        ) : activityStatus === "active" ? (
                            <Badge variant="default" className="ml-auto bg-green-500 hover:bg-green-600">
                                <Wifi className="h-3 w-3 mr-1" /> {ACTIVITY_STATUS_LABELS.active}
                            </Badge>
                        ) : activityStatus === "partial" ? (
                            <Badge variant="default" className="ml-auto bg-yellow-500 hover:bg-yellow-600 text-black">
                                <Wifi className="h-3 w-3 mr-1" /> {ACTIVITY_STATUS_LABELS.partial}
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="ml-auto">
                                <WifiOff className="h-3 w-3 mr-1" /> {ACTIVITY_STATUS_LABELS.inactive}
                            </Badge>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {!hasEquipment ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/50 rounded-lg border border-dashed">
                            <BusFront className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground font-medium">Оборудование не установлено</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                На данной остановке пока нет подключенных датчиков телеметрии.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Какие именно источники дают остановке её статус */}
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className={`px-2 py-1 rounded-md border ${sensorsOnline ? "text-green-500 border-green-500/30 bg-green-500/10" : "text-muted-foreground border-border bg-muted/50"}`}>
                                    Датчики: {sensorsOnline ? "в сети" : "не в сети"}
                                </span>
                                <span className={`px-2 py-1 rounded-md border ${camerasOnline ? "text-green-500 border-green-500/30 bg-green-500/10" : "text-muted-foreground border-border bg-muted/50"}`}>
                                    Камеры: {camerasOnline ? `в сети (${onlineCameraCount})` : "не в сети"}
                                </span>
                            </div>

                            {/* Critical Alerts Banner: ONLY rendered if there are real active problems */}
                            {sensorsOnline && hasAnyRealProblems && (
                                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 space-y-2">
                                    <div className="font-semibold flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        Внимание: Обнаружены проблемы
                                    </div>
                                    <ul className="text-sm list-disc pl-5 space-y-1">
                                        {glassBrokenAlarm && <li>Зафиксирован вандализм (разбито стекло).</li>}
                                        {heaterFaultAlarm && <li>Отказ системы обогрева остановки.</li>}
                                        {tempWarningAlarm && <li>Предупреждение по температуре.</li>}
                                    </ul>
                                </div>
                            )}

                            {/* Sensor Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-secondary/80 rounded-lg flex flex-col items-center justify-center text-center">
                                    <Thermometer className="h-5 w-5 text-sky-500 mb-2" />
                                    <div className="text-xs text-muted-foreground">Т. снаружи</div>
                                    <div className="font-medium mt-0.5">
                                        {sensorsOnline && tempOut !== undefined ? `${tempOut.toFixed(1)}°C` : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary/80 rounded-lg flex flex-col items-center justify-center text-center">
                                    <Thermometer className="h-5 w-5 text-orange-500 mb-2" />
                                    <div className="text-xs text-muted-foreground">Т. внутри</div>
                                    <div className="font-medium mt-0.5">
                                        {sensorsOnline && tempIn !== undefined ? `${tempIn.toFixed(1)}°C` : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary/80 rounded-lg flex flex-col items-center justify-center text-center">
                                    <Droplets className="h-5 w-5 text-blue-400 mb-2" />
                                    <div className="text-xs text-muted-foreground">Влажность</div>
                                    <div className="font-medium mt-0.5">
                                        {sensorsOnline && humidity !== undefined ? `${humidity.toFixed(1)}%` : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary/80 rounded-lg flex flex-col items-center justify-center text-center">
                                    <Zap className={`h-5 w-5 mb-2 ${sensorsOnline && dio1?.digitalState ? 'text-amber-400' : 'text-muted-foreground'}`} />
                                    <div className="text-xs text-muted-foreground">Обогрев</div>
                                    <div className="font-medium mt-0.5">
                                        {sensorsOnline && dio1?.digitalState !== null && dio1?.digitalState !== undefined
                                            ? (dio1.digitalState ? 'Включен' : 'Отключен')
                                            : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary/80 rounded-lg flex flex-col items-center justify-center text-center">
                                    <Hammer className={`h-5 w-5 mb-2 ${sensorsOnline ? (glassBrokenAlarm ? 'text-red-500' : 'text-emerald-500') : 'text-muted-foreground'}`} />
                                    <div className="text-xs text-muted-foreground">Датчик разбития</div>
                                    <div className="font-medium mt-0.5">
                                        {sensorsOnline ? (glassBrokenAlarm ? 'Тревога' : 'Норма') : '—'}
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Real Event Log */}
                            <div>
                                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                                    Журнал событий
                                </h3>
                                <div className="space-y-2">
                                    {!sensorsOnline ? (
                                        <div className="text-sm text-muted-foreground text-center py-4 bg-muted/50 rounded-lg">
                                            История недоступна (устройство оффлайн)
                                        </div>
                                    ) : loading ? (
                                        <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg animate-pulse">
                                            Загрузка событий...
                                        </div>
                                    ) : realAlerts.length === 0 ? (
                                        <div className="text-xs text-muted-foreground text-center py-4 bg-secondary/30 rounded-lg">
                                            Событий не зафиксировано
                                        </div>
                                    ) : (
                                        realAlerts.map((alert) => (
                                            <div
                                                key={alert.id}
                                                className="flex justify-between items-center text-sm p-2 rounded bg-secondary/50 border border-secondary"
                                            >
                                                <span
                                                    className={
                                                        alert.alarm === "alarm" || alert.alarm === "critical"
                                                            ? "text-red-500 font-medium"
                                                            : alert.alarm === "warning"
                                                            ? "text-amber-500 font-medium"
                                                            : "text-foreground"
                                                    }
                                                >
                                                    {alert.message || `Событие элемента ${alert.element}`}
                                                </span>
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {formatTime(alert.created_at)}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
