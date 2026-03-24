import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Wifi, WifiOff, Thermometer, Droplets, Zap, AlertTriangle, ShieldAlert, BusFront, Hammer } from "lucide-react"
import { fetchLatestMeasurements, subscribeMeasurements, type SensorReading } from "@/lib/api/measurements"

export interface BusStopSensorData {
    is_online: boolean
    has_equipment: boolean
    is_partly_equipped: boolean
    temperature_in?: number
    temperature_out?: number
    humidity?: number
    heater_working?: boolean
    glass_broken?: boolean
}

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

export function BusStopModal({ busStop, onClose }: BusStopModalProps) {
    const [realReadings, setRealReadings] = useState<SensorReading[]>([])

    // Check if this is the target station
    const isTargetStation = busStop?.name?.toLowerCase().includes("юности") && busStop?.description?.toLowerCase().includes("ленин") || false;

    useEffect(() => {
        if (!busStop || !isTargetStation) return;

        // Fetch real data for this specific stop
        fetchLatestMeasurements().then(setRealReadings)

        const unsubscribe = subscribeMeasurements(() => {
            fetchLatestMeasurements().then(setRealReadings)
        })

        return () => unsubscribe()
    }, [busStop, isTargetStation])

    if (!busStop) return null

    // Use real data if it's the target station and we have readings, otherwise use mock data
    let sd = busStop.sensor_data

    if (isTargetStation && realReadings.length > 0) {
        const dio1 = realReadings.find(r => r.element === 1)
        const dht13 = realReadings.find(r => r.element === 13) // temp & humidity
        const temp14 = realReadings.find(r => r.element === 14) // internal temp

        sd = {
            ...sd,
            is_online: true,
            has_equipment: true,
            is_partly_equipped: false,
            temperature_out: dht13?.temperature ?? undefined,
            temperature_in: temp14?.temperature ?? undefined,
            humidity: dht13?.humidity ?? undefined,
            heater_working: dio1?.digitalState ?? undefined,
            // You can also map alarms to glass_broken or other statuses if needed
            glass_broken: dio1?.digitalState === false, // Example: mapping broken state
        } as BusStopSensorData
    }

    const isOnline = sd?.is_online ?? false
    // Force hasEquipment for the target station so the grid always renders
    const hasEquipment = isTargetStation ? true : (sd?.has_equipment || sd?.is_partly_equipped)

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
                        ) : isOnline ? (
                            <Badge variant="default" className="ml-auto bg-green-500 hover:bg-green-600">
                                <Wifi className="h-3 w-3 mr-1" /> В сети
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="ml-auto">
                                <WifiOff className="h-3 w-3 mr-1" /> Не в сети
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
                                На данной остановке нет датчиков телеметрии.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Critical Alerts */}
                            {isOnline && (sd?.glass_broken || sd?.heater_working === false) && (
                                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 space-y-2">
                                    <div className="font-semibold flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        Внимание: Обнаружены проблемы
                                    </div>
                                    <ul className="text-sm list-disc pl-5 space-y-1">
                                        {sd?.glass_broken && <li>Зафиксирован вандализм (разбито стекло).</li>}
                                        {sd?.heater_working === false && <li>Отказ системы обогрева остановки.</li>}
                                    </ul>
                                </div>
                            )}

                            {/* Sensor Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-secondary rounded-lg flex flex-col items-center justify-center text-center">
                                    <Thermometer className="h-5 w-5 text-sky-500 mb-2" />
                                    <div className="text-xs text-muted-foreground">Т. снаружи</div>
                                    <div className="font-medium mt-0.5">
                                        {isOnline && sd?.temperature_out !== undefined ? `${sd.temperature_out.toFixed(1)}°C` : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary rounded-lg flex flex-col items-center justify-center text-center">
                                    <Thermometer className="h-5 w-5 text-orange-500 mb-2" />
                                    <div className="text-xs text-muted-foreground">Т. внутри</div>
                                    <div className="font-medium mt-0.5">
                                        {isOnline && sd?.temperature_in !== undefined ? `${sd.temperature_in.toFixed(1)}°C` : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary rounded-lg flex flex-col items-center justify-center text-center">
                                    <Droplets className="h-5 w-5 text-blue-400 mb-2" />
                                    <div className="text-xs text-muted-foreground">Влажность</div>
                                    <div className="font-medium mt-0.5">
                                        {isOnline && sd?.humidity !== undefined ? `${sd.humidity.toFixed(1)}%` : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary rounded-lg flex flex-col items-center justify-center text-center">
                                    <Zap className={`h-5 w-5 mb-2 ${isOnline && sd?.heater_working !== undefined && sd.heater_working ? 'text-amber-400' : 'text-muted-foreground'}`} />
                                    <div className="text-xs text-muted-foreground">Обогрев</div>
                                    <div className="font-medium mt-0.5">
                                        {isOnline && sd?.heater_working !== undefined ? (sd.heater_working ? 'Исправен' : 'Отказ') : '—'}
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary rounded-lg flex flex-col items-center justify-center text-center">
                                    <Hammer className={`h-5 w-5 mb-2 ${isOnline ? (sd?.glass_broken ? 'text-red-500' : 'text-emerald-500') : 'text-muted-foreground'}`} />
                                    <div className="text-xs text-muted-foreground">Датчик разбития</div>
                                    <div className="font-medium mt-0.5">
                                        {isOnline ? (sd?.glass_broken ? 'Тревога' : 'Норма') : '—'}
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Recent Events Mock */}
                            <div>
                                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                                    Журнал событий
                                </h3>
                                <div className="space-y-2">
                                    {!isOnline ? (
                                        <div className="text-sm text-muted-foreground text-center py-4 bg-muted/50 rounded-lg">
                                            История недоступна (устройство оффлайн)
                                        </div>
                                    ) : (
                                        <>
                                            {sd?.glass_broken && (
                                                <div className="flex justify-between items-center text-sm p-2 rounded bg-red-500/5 border border-red-500/10">
                                                    <span className="text-red-500 font-medium">{isTargetStation ? 'Срабатывание цифрового датчика 1' : 'Срабатывание датчика разбития стекла'}</span>
                                                    <span className="text-xs text-muted-foreground">Недавно</span>
                                                </div>
                                            )}
                                            {sd?.heater_working === false && (
                                                <div className="flex justify-between items-center text-sm p-2 rounded bg-amber-500/5 border border-amber-500/10">
                                                    <span className="text-amber-500 font-medium">Отказ системы обогревателя</span>
                                                    <span className="text-xs text-muted-foreground">Недавно</span>
                                                </div>
                                            )}
                                            {isTargetStation && realReadings.some(r => r.temperatureAlarm) && (
                                                <div className="flex justify-between items-center text-sm p-2 rounded bg-amber-500/5 border border-amber-500/10">
                                                    <span className="text-amber-500 font-medium">Предупреждение температуры</span>
                                                    <span className="text-xs text-muted-foreground">Недавно</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center text-sm p-2 rounded bg-secondary/50">
                                                <span className="text-muted-foreground">Отправка телеметрии</span>
                                                <span className="text-xs text-muted-foreground">Только что</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm p-2 rounded bg-secondary/50">
                                                <span className="text-muted-foreground">Синхронизация времени системы</span>
                                                <span className="text-xs text-muted-foreground">1 час назад</span>
                                            </div>
                                        </>
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
