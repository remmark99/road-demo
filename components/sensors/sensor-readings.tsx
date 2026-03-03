"use client"

import { useEffect, useState, useCallback } from "react"
import { Thermometer, Droplets, AlertTriangle, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
    fetchLatestMeasurements,
    subscribeMeasurements,
    SENSOR_DESCRIPTIONS,
    type SensorReading,
} from "@/lib/api/measurements"

function formatTime(isoString: string | null) {
    if (!isoString) return "—"
    const d = new Date(isoString)
    return d.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    })
}

/** A single measurement line: icon + value + unit + timestamp */
function MeasurementLine({
    icon: Icon,
    value,
    unit,
    alarm,
    updatedAt,
    normalColor,
}: {
    icon: typeof Thermometer
    value: number
    unit: string
    alarm: string | null
    updatedAt: string | null
    normalColor: string
}) {
    const isWarning = alarm === "warning"
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
                <Icon
                    className={`h-3.5 w-3.5 ${isWarning ? "text-amber-500" : normalColor}`}
                />
                <span
                    className={`text-lg font-bold tabular-nums ${isWarning ? "text-amber-500" : "text-foreground"
                        }`}
                >
                    {value.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">{unit}</span>
            </div>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                {formatTime(updatedAt)}
            </span>
        </div>
    )
}

function SensorRow({ reading }: { reading: SensorReading }) {
    const hasWarning =
        reading.temperatureAlarm === "warning" ||
        reading.humidityAlarm === "warning"

    return (
        <div className="space-y-2">
            {/* Sensor name */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold tracking-wide">
                    {reading.label}
                </span>
                {hasWarning && (
                    <AlertTriangle className="h-3 w-3 text-amber-500 animate-pulse" />
                )}
            </div>

            {/* Description */}
            <p className="text-[11px] text-muted-foreground leading-tight">
                {SENSOR_DESCRIPTIONS[reading.element] ?? ""}
            </p>

            {/* Values — each with its own timestamp */}
            <div className="space-y-1">
                {reading.temperature !== null && (
                    <MeasurementLine
                        icon={Thermometer}
                        value={reading.temperature}
                        unit="°C"
                        alarm={reading.temperatureAlarm}
                        updatedAt={reading.temperatureUpdatedAt}
                        normalColor="text-sky-500"
                    />
                )}
                {reading.humidity !== null && (
                    <MeasurementLine
                        icon={Droplets}
                        value={reading.humidity}
                        unit="%"
                        alarm={reading.humidityAlarm}
                        updatedAt={reading.humidityUpdatedAt}
                        normalColor="text-indigo-500"
                    />
                )}
            </div>
        </div>
    )
}

export function SensorPopover() {
    const [readings, setReadings] = useState<SensorReading[]>([])
    const [loading, setLoading] = useState(true)

    const loadData = useCallback(async () => {
        const data = await fetchLatestMeasurements()
        setReadings(data)
        setLoading(false)
    }, [])

    useEffect(() => {
        loadData()

        const unsubscribe = subscribeMeasurements(() => {
            loadData()
        })

        const interval = setInterval(loadData, 15000)

        return () => {
            unsubscribe()
            clearInterval(interval)
        }
    }, [loadData])

    const hasAnyWarning = readings.some(
        (r) => r.temperatureAlarm === "warning" || r.humidityAlarm === "warning"
    )

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={`gap-1.5 ${hasAnyWarning
                            ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        }`}
                >
                    {hasAnyWarning ? (
                        <AlertTriangle className="h-4 w-4" />
                    ) : (
                        <Activity className="h-4 w-4" />
                    )}
                    <span className="text-sm">Датчики</span>
                    {!loading && (
                        <span
                            className={`h-1.5 w-1.5 rounded-full animate-pulse ${hasAnyWarning ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end" sideOffset={8}>
                <div className="space-y-1 mb-3">
                    <h4 className="font-semibold text-sm">Показания датчиков</h4>
                    <p className="text-xs text-muted-foreground">
                        Обновляется автоматически
                    </p>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        {[0, 1].map((i) => (
                            <div key={i} className="animate-pulse space-y-2">
                                <div className="h-3 w-24 bg-muted rounded" />
                                <div className="h-5 w-32 bg-muted rounded" />
                            </div>
                        ))}
                    </div>
                ) : readings.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                        Нет данных с датчиков
                    </p>
                ) : (
                    <div className="space-y-3">
                        {readings.map((r, i) => (
                            <div key={r.element}>
                                <SensorRow reading={r} />
                                {i < readings.length - 1 && <Separator className="mt-3" />}
                            </div>
                        ))}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}
