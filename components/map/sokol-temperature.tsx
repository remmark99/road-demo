import { temperatureDelta, type OutdoorTemperature } from "@/lib/sokol-temperature"

export function SokolTemperature({ reading }: { reading: OutdoorTemperature | null }) {
    return (
        <div className="rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-sm" aria-live="polite">
            <div>Сокол: {reading ? `${reading.temperature.toFixed(1)} °C` : "нет данных"}</div>
            {reading && <div className="text-muted-foreground">
                Последнее измерение: <time dateTime={reading.time}>{new Date(reading.time).toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}</time> (UTC+5)
            </div>}
        </div>
    )
}

export function PavilionTemperatureDelta({ indoor, measuredAt, outdoor }: {
    indoor: number | undefined
    measuredAt: string | null | undefined
    outdoor: OutdoorTemperature | null
}) {
    const validTime = typeof measuredAt === "string" && Number.isFinite(Date.parse(measuredAt)) && Date.parse(measuredAt) <= Date.now()
    const delta = validTime ? temperatureDelta(indoor, outdoor?.temperature) : null
    return <>
        <div>Δ к Соколу по последним измерениям: {delta ?? "—"}</div>
        {delta && <div>{indoor! > outdoor!.temperature ? "В павильоне теплее" : indoor! < outdoor!.temperature ? "В павильоне холоднее" : "Температура одинаковая"}</div>}
        {validTime && <div>Измерение в павильоне: <time dateTime={measuredAt}>{new Date(measuredAt).toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}</time> (UTC+5)</div>}
    </>
}
