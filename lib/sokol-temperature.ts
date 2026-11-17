export interface OutdoorTemperature {
    temperature: number
    time: string
}

export function parseSokolTemperature(data: unknown): OutdoorTemperature | null {
    if (!Array.isArray(data)) return null
    const indicator = data.find(item => item?.id === 4)
    if (!Array.isArray(indicator?.current_values)) return null
    const sample = indicator.current_values.find((item: { pointId?: number } | null) => item?.pointId === 1)
    if (!sample || !['string', 'number'].includes(typeof sample.value) || String(sample.value).trim() === '') return null
    const temperature = Number(sample.value)
    const time = typeof sample.time === 'string' ? Date.parse(sample.time) : NaN
    if (!Number.isFinite(temperature) || !Number.isFinite(time)) return null
    return { temperature, time: new Date(time).toISOString() }
}

export function temperatureDelta(indoor: number | null | undefined, outdoor: number | undefined): string | null {
    if (typeof indoor !== 'number' || !Number.isFinite(indoor) || typeof outdoor !== 'number' || !Number.isFinite(outdoor)) return null
    const delta = Number((indoor - outdoor).toFixed(1))
    return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)} °C`
}
