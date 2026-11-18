import { Droplets, Thermometer } from "lucide-react"

import type { OutdoorTemperature } from "@/lib/sokol-temperature"

const FRESH_MS = 4 * 60 * 60 * 1000
const MISSING_HINT = "Метеомониторинг недоступен"

function fresh(time: string | null | undefined) {
    const age = Date.now() - Date.parse(time ?? "")
    return Number.isFinite(age) && age >= 0 && age < FRESH_MS
}

function fmt(value: number, digits: number) {
    return value.toFixed(digits).replace('.', ',')
}

/** Уличное показание Сокола: значок + значение, без словесных подписей. */
export function SokolTemperature({ reading }: { reading: OutdoorTemperature | null }) {
    const temperature = reading && Number.isFinite(reading.temperature) && fresh(reading.temperatureTime) ? reading.temperature : null
    const humidity = reading && Number.isFinite(reading.humidity) && fresh(reading.humidityTime) ? reading.humidity : null
    return <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm" aria-live="polite">
        <span className="flex items-center gap-1.5" title={temperature === null ? MISSING_HINT : "Температура воздуха на улице"}>
            <Thermometer className="h-4 w-4 text-sky-500" aria-hidden />
            <span className="font-medium tabular-nums">{temperature === null ? "—" : `${fmt(temperature, 1)} °C`}</span>
            <span className="sr-only">Температура воздуха на улице</span>
        </span>
        <span className="flex items-center gap-1.5" title={humidity === null ? MISSING_HINT : "Относительная влажность на улице"}>
            <Droplets className="h-4 w-4 text-blue-400" aria-hidden />
            <span className="font-medium tabular-nums">{humidity === null ? "—" : `${fmt(humidity, 0)} %`}</span>
            <span className="sr-only">Относительная влажность на улице</span>
        </span>
    </div>
}

export function PavilionTemperatureDelta({ indoor, measuredAt, outdoor }: {
    indoor: number | undefined
    measuredAt: string | null | undefined
    outdoor: OutdoorTemperature | null
}) {
    if (!Number.isFinite(indoor) || !outdoor || !Number.isFinite(outdoor.temperature) || !fresh(measuredAt) || !fresh(outdoor.temperatureTime)) return null
    const delta = Number((indoor! - outdoor.temperature!).toFixed(1))
    return <span>{delta === 0 ? "Как на улице" : `На ${Math.abs(delta).toFixed(1).replace('.', ',')} °C ${delta > 0 ? "теплее" : "холоднее"} улицы`}</span>
}

/**
 * Влажность в павильоне относительно улицы. Сравнение в процентных пунктах:
 * «на 26 % суше» читалось бы как относительное изменение, а не как разница показаний.
 */
export function PavilionHumidityDelta({ indoor, measuredAt, outdoor }: {
    indoor: number | undefined
    measuredAt: string | null | undefined
    outdoor: OutdoorTemperature | null
}) {
    if (!Number.isFinite(indoor) || !outdoor || !Number.isFinite(outdoor.humidity) || !fresh(measuredAt) || !fresh(outdoor.humidityTime)) return null
    const delta = Number((indoor! - outdoor.humidity!).toFixed(1))
    return <span>{delta === 0 ? "Как на улице" : `На ${Math.abs(delta).toFixed(1).replace('.', ',')} п.п. ${delta > 0 ? "влажнее" : "суше"} улицы`}</span>
}
