/**
 * Слой «Состояние остановок» на карте: зелёный — всё в норме, оранжевый — одно
 * нарушение, красный — два и больше, серый — данных нет.
 *
 * Критерии: температура и влажность в пределах норм из настроек анализа,
 * урна не переполнена, за последний час не было событий безопасности и
 * разбития стекла. Всё считается на выбранный момент слайдера, поэтому модуль
 * чистый и работает в браузере на заранее загруженной истории.
 */

export type ConditionLevel = 'ok' | 'warn' | 'bad' | 'unknown'

export interface ConditionThresholds {
    tempEnabled: boolean
    tempMin: number
    tempMax: number
    humidityEnabled: boolean
    humidityMin: number
    humidityMax: number
}

/** Значения по умолчанию из бэкенда (src/shared/config.py) — на случай пустого каталога. */
export const DEFAULT_CONDITION_THRESHOLDS: ConditionThresholds = {
    tempEnabled: true, tempMin: -5, tempMax: 30,
    humidityEnabled: true, humidityMin: 0, humidityMax: 85,
}

export const THRESHOLD_SETTING_KEYS: Record<keyof ConditionThresholds, string> = {
    tempEnabled: 'sensor_temp_alerts_enabled',
    tempMin: 'sensor_temp_min',
    tempMax: 'sensor_temp_max',
    humidityEnabled: 'sensor_humidity_alerts_enabled',
    humidityMin: 'sensor_humidity_min',
    humidityMax: 'sensor_humidity_max',
}

/** События безопасности, которые делают остановку «с инцидентом». */
export const CONDITION_INCIDENT_ALERT_TYPES = ['lying_person', 'smoking', 'abandoned_object', 'dogs_without_people'] as const
export const CONDITION_GLASS_CATEGORIES = ['incident', 'glass_break'] as const

/** Сколько после события остановка считается «с инцидентом». */
export const INCIDENT_WINDOW_MS = 60 * 60_000
/** Насколько старое показание климата ещё описывает момент. */
export const CLIMATE_MAX_AGE_MS = 2 * 60 * 60_000

/** [время показания, температура, влажность]; null — этого показания в срезе не было. */
export type ClimatePoint = [number, number | null, number | null]

export interface StopConditionSeries {
    /** Почасовые срезы показаний, по возрастанию времени. */
    climate: ClimatePoint[]
    /** Эпизоды переполнения урны: [начало, конец или null, если ещё открыт]. */
    bins: [number, number | null][]
    /** Время событий безопасности и разбития стекла. */
    incidents: number[]
}

export interface StopConditionsResponse {
    from: string
    to: string
    generatedAt: string
    thresholds: ConditionThresholds
    stops: Record<string, StopConditionSeries>
}

export interface StopCondition {
    level: ConditionLevel
    issues: string[]
    temperature: number | null
    humidity: number | null
}

export const CONDITION_COLORS: Record<ConditionLevel, string> = {
    ok: '#22c55e',
    warn: '#f97316',
    bad: '#ef4444',
    unknown: '#9ca3af',
}

export const CONDITION_LABELS: Record<ConditionLevel, string> = {
    ok: 'Всё в норме',
    warn: 'Одно нарушение',
    bad: 'Два и больше',
    unknown: 'Нет данных',
}

function climateAt(points: ClimatePoint[], at: number): ClimatePoint | null {
    let best: ClimatePoint | null = null
    for (const point of points) {
        if (point[0] > at) break
        best = point
    }
    return best && at - best[0] <= CLIMATE_MAX_AGE_MS ? best : null
}

function outside(value: number, min: number, max: number) {
    return value < min || value > max
}

export function stopConditionAt(
    series: StopConditionSeries | undefined,
    thresholds: ConditionThresholds,
    at: number,
    { hasCameras }: { hasCameras: boolean },
): StopCondition {
    const issues: string[] = []
    let known = 0
    const climate = series ? climateAt(series.climate, at) : null
    const temperature = climate?.[1] ?? null
    const humidity = climate?.[2] ?? null

    if (thresholds.tempEnabled && temperature !== null) {
        known++
        if (outside(temperature, thresholds.tempMin, thresholds.tempMax)) issues.push('Температура вне нормы')
    }
    if (thresholds.humidityEnabled && humidity !== null) {
        known++
        if (outside(humidity, thresholds.humidityMin, thresholds.humidityMax)) issues.push('Влажность вне нормы')
    }
    if (hasCameras) {
        known++
        if (series?.bins.some(([start, end]) => start <= at && (end === null || at < end))) issues.push('Урна переполнена')
    }
    if (hasCameras || climate) {
        known++
        if (series?.incidents.some(time => time <= at && at - time < INCIDENT_WINDOW_MS)) issues.push('Инцидент')
    }

    const level: ConditionLevel = known === 0 ? 'unknown' : issues.length === 0 ? 'ok' : issues.length === 1 ? 'warn' : 'bad'
    return { level, issues, temperature, humidity }
}

/** Значение порога: правка в настройках, иначе значение бэкенда из каталога, иначе встроенное. */
export function resolveThresholds(
    overrides: Record<string, unknown>,
    catalogDefaults: Record<string, unknown>,
): ConditionThresholds {
    const result = { ...DEFAULT_CONDITION_THRESHOLDS }
    for (const [field, key] of Object.entries(THRESHOLD_SETTING_KEYS) as [keyof ConditionThresholds, string][]) {
        const raw = key in overrides ? overrides[key] : catalogDefaults[key]
        const fallback = DEFAULT_CONDITION_THRESHOLDS[field]
        if (typeof fallback === 'boolean') {
            if (typeof raw === 'boolean') (result[field] as boolean) = raw
        } else {
            const value = typeof raw === 'string' ? Number(raw) : raw
            if (typeof value === 'number' && Number.isFinite(value)) (result[field] as number) = value
        }
    }
    return result
}

/** Шаг срезов климата: почасово для недели, реже для длинных периодов, не больше 192 срезов. */
export function climateSampleHours(spanMs: number) {
    return Math.max(1, Math.ceil(spanMs / 3_600_000 / 192))
}
