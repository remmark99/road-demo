import type { OutdoorTemperature } from "@/lib/sokol-temperature"

function fresh(time: string | null | undefined) {
    const age = Date.now() - Date.parse(time ?? "")
    return Number.isFinite(age) && age >= 0 && age < 4 * 60 * 60 * 1000
}

export function SokolTemperature({ reading }: { reading: OutdoorTemperature | null }) {
    const available = reading && Number.isFinite(reading.temperature) && fresh(reading.time)
    return <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm" aria-live="polite">
        {available ? `На улице ${reading.temperature.toFixed(1).replace('.', ',')} °C` : "Температура недоступна"}
    </div>
}

export function PavilionTemperatureDelta({ indoor, measuredAt, outdoor }: {
    indoor: number | undefined
    measuredAt: string | null | undefined
    outdoor: OutdoorTemperature | null
}) {
    if (!Number.isFinite(indoor) || !outdoor || !Number.isFinite(outdoor.temperature) || !fresh(measuredAt) || !fresh(outdoor.time)) return null
    const delta = Number((indoor! - outdoor.temperature).toFixed(1))
    return <span>{delta === 0 ? "Как на улице" : `На ${Math.abs(delta).toFixed(1).replace('.', ',')} °C ${delta > 0 ? "теплее" : "холоднее"} улицы`}</span>
}
