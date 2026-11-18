/**
 * Одно уличное показание Сокола: температура (индикатор 4) и относительная
 * влажность (индикатор 6) приходят из одного ответа метеомониторинга города.
 * У каждого значения своё время выборки — точки могут отдать их с разным `time`,
 * поэтому свежесть проверяется по своему полю, а не по общему.
 */
export interface OutdoorTemperature {
    temperature: number | null
    temperatureTime: string | null
    humidity: number | null
    humidityTime: string | null
}

const TEMPERATURE_INDICATOR = 4
const HUMIDITY_INDICATOR = 6
const SOKOL_POINT = 1

function readSokolSample(data: unknown, indicatorId: number): { value: number; time: string } | null {
    if (!Array.isArray(data)) return null
    const indicator = data.find(item => item?.id === indicatorId)
    if (!Array.isArray(indicator?.current_values)) return null
    const sample = indicator.current_values.find((item: { pointId?: number } | null) => item?.pointId === SOKOL_POINT)
    if (!sample || !['string', 'number'].includes(typeof sample.value) || String(sample.value).trim() === '') return null
    const value = Number(sample.value)
    const time = typeof sample.time === 'string' ? Date.parse(sample.time) : NaN
    if (!Number.isFinite(value) || !Number.isFinite(time)) return null
    return { value, time: new Date(time).toISOString() }
}

export function parseSokolTemperature(data: unknown): OutdoorTemperature | null {
    const temperature = readSokolSample(data, TEMPERATURE_INDICATOR)
    const humidity = readSokolSample(data, HUMIDITY_INDICATOR)
    // Пусто по обоим значениям — недоступен сам метеомониторинг; одно отсутствующее значение не гасит второе.
    if (!temperature && !humidity) return null
    return {
        temperature: temperature?.value ?? null,
        temperatureTime: temperature?.time ?? null,
        humidity: humidity?.value ?? null,
        humidityTime: humidity?.time ?? null,
    }
}

export function temperatureDelta(indoor: number | null | undefined, outdoor: number | undefined): string | null {
    if (typeof indoor !== 'number' || !Number.isFinite(indoor) || typeof outdoor !== 'number' || !Number.isFinite(outdoor)) return null
    const delta = Number((indoor - outdoor).toFixed(1))
    return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)} °C`
}
