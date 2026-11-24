import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { sharedCached, sharedState } from '@/lib/server/shared-cache'
import {
    CONDITION_GLASS_CATEGORIES,
    INCIDENT_WINDOW_MS,
    THRESHOLD_SETTING_KEYS,
    climateSampleHours,
    resolveThresholds,
    type ClimatePoint,
    type StopConditionSeries,
    type StopConditionsResponse,
} from '@/lib/stop-conditions'

/**
 * Серверная часть слоя «Состояние остановок»: читает историю из базы.
 * Общая для API карты и для MCP-ассистента.
 */
export const HOUR = 3_600_000
const DAY = 24 * HOUR
const MAX_SPAN = 31 * DAY
const QUERY_CONCURRENCY = 8
// Все остановки пишут около 170 строк климата в минуту: 400 последних строк
// часа — это срез каждой работающей остановки на его конце.
const CLIMATE_ROWS_PER_SAMPLE = 400
const PAGE = 1000

type Db = SupabaseClient

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, limit = 50_000): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; offset < limit; offset += PAGE) {
        const result = await page(offset, offset + PAGE - 1)
        if (result.error) throw new Error('read failed')
        const batch = (result.data ?? []) as T[]
        rows.push(...batch)
        if (batch.length < PAGE) return rows
    }
    throw new Error('Слишком много данных за период')
}

export function parseConditionWindow(params: URLSearchParams, now: number) {
    const to = Math.min(params.get('to') ? Date.parse(params.get('to')!) : now, now)
    const from = params.get('from') ? Date.parse(params.get('from')!) : to - 7 * DAY
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Некорректный период')
    // Окно округляется до часа: соседние запросы слайдера попадают в один кэш.
    const start = Math.floor(Math.max(from, to - MAX_SPAN) / HOUR) * HOUR
    const end = Math.ceil(to / HOUR) * HOUR
    return { start, end, liveEnd: Math.min(end, now) }
}

// Срез часа, который уже закончился, не меняется: такие срезы держим в памяти процесса.
// Без кэша вкладка «Аналитика» делала ~770 запросов на каждое открытие (31 день по часам).
// Кэш общий для процесса: прогрев и маршруты собираются отдельно и иначе не видят друг друга.
const climateCache = sharedState('climate-hours', () => new Map<string, Map<number, ClimatePoint>>())
const CLIMATE_CACHE_LIMIT = 24 * 100
const CLIMATE_CONCURRENCY = 16

export async function readClimate(db: Db, stopIds: number[], start: number, end: number) {
    const step = climateSampleHours(end - start) * HOUR
    const windows: [number, number][] = []
    for (let t = start; t < end; t += step) windows.push([t, Math.min(t + HOUR, end)])
    const byStop = new Map<number, ClimatePoint[]>()
    const stopsKey = stopIds.slice().sort((a, b) => a - b).join(',')
    const settled = Date.now() - 5 * 60_000
    const missing = windows.filter(([a, b]) => !(b <= settled && climateCache.has(`${stopsKey}|${a}|${b}`)))
    for (const [a, b] of windows) {
        const cached = climateCache.get(`${stopsKey}|${a}|${b}`)
        if (cached && b <= settled) for (const [stopId, point] of cached) byStop.set(stopId, [...(byStop.get(stopId) ?? []), point])
    }
    for (let i = 0; i < missing.length; i += CLIMATE_CONCURRENCY) {
        const slice = missing.slice(i, i + CLIMATE_CONCURRENCY)
        const pages = await Promise.all(slice.map(([a, b]) => db
            .from('stop_sensor_history')
            .select('bus_stop_id,category,value,recorded_at')
            // По остановкам: на сервере заказчика есть индекс только (bus_stop_id, recorded_at).
            .in('bus_stop_id', stopIds)
            .in('category', ['temperature', 'humidity'])
            .gte('recorded_at', new Date(a).toISOString())
            .lt('recorded_at', new Date(b).toISOString())
            .order('recorded_at', { ascending: false })
            .limit(CLIMATE_ROWS_PER_SAMPLE)))
        for (const [index, page] of pages.entries()) {
            if (page.error) throw new Error('climate read failed')
            const latest = new Map<number, ClimatePoint>()
            for (const row of (page.data ?? []) as { bus_stop_id: number; category: string; value: number | null; recorded_at: string }[]) {
                if (row.value === null || !Number.isFinite(Number(row.value))) continue
                const point = latest.get(row.bus_stop_id) ?? [Date.parse(row.recorded_at), null, null]
                if (row.category === 'temperature' && point[1] === null) point[1] = Number(row.value)
                if (row.category === 'humidity' && point[2] === null) point[2] = Number(row.value)
                latest.set(row.bus_stop_id, point)
            }
            for (const [stopId, point] of latest) byStop.set(stopId, [...(byStop.get(stopId) ?? []), point])
            const [a, b] = slice[index]
            if (b <= settled) {
                if (climateCache.size >= CLIMATE_CACHE_LIMIT) climateCache.delete(climateCache.keys().next().value!)
                climateCache.set(`${stopsKey}|${a}|${b}`, latest)
            }
        }
    }
    for (const points of byStop.values()) points.sort((a, b) => a[0] - b[0])
    return byStop
}

export async function readConditionThresholds() {
    const admin = createNotificationAdminClient()
    const keys = Object.values(THRESHOLD_SETTING_KEYS)
    const [overrides, catalog] = await Promise.all([
        admin.from('pipeline_settings').select('key,value').in('key', keys),
        admin.from('pipeline_settings_catalog').select('catalog').limit(1).maybeSingle(),
    ])
    const values: Record<string, unknown> = {}
    for (const row of overrides.error ? [] : overrides.data ?? []) values[row.key] = row.value
    const defaults: Record<string, unknown> = {}
    const fields = ((catalog.data?.catalog as { fields?: { key: string; default: unknown }[] } | null)?.fields) ?? []
    for (const field of fields) if (keys.includes(field.key)) defaults[field.key] = field.default
    return resolveThresholds(values, defaults)
}

export async function buildStopConditions(db: Db, start: number, end: number, liveEnd: number): Promise<StopConditionsResponse> {
    const [stops, thresholds] = await Promise.all([
        readAll<{ id: number; ip_address: string | null }>((a, b) => db.from('bus_stops').select('id,ip_address').order('id').range(a, b)),
        readConditionThresholds(),
    ])

    const iso = (time: number) => new Date(time).toISOString()
    // Состояние остановки — только датчики: климат и стекло. Урны и видеоаналитика — инциденты.
    const [climate, glass] = await Promise.all([
        readClimate(db, stops.filter(s => s.ip_address).map(s => s.id), start, end),
        readAll<{ bus_stop_id: number | null; created_at: string; alarm: string | null }>((a, b) => db.from('controller_alerts')
            .select('bus_stop_id,created_at,alarm').in('category', [...CONDITION_GLASS_CATEGORIES])
            .gte('created_at', iso(start - INCIDENT_WINDOW_MS)).lt('created_at', iso(end)).order('id').range(a, b)),
    ])

    const series: Record<string, StopConditionSeries> = {}
    const of = (stopId: number) => (series[stopId] ??= { climate: [], incidents: [] })
    for (const [stopId, points] of climate) of(stopId).climate = points
    for (const alert of glass) {
        if (alert.bus_stop_id === null || !alert.alarm || alert.alarm === 'normal') continue
        of(alert.bus_stop_id).incidents.push(Date.parse(alert.created_at))
    }
    for (const value of Object.values(series)) value.incidents.sort((a, b) => a - b)

    return { from: iso(start), to: iso(liveEnd), generatedAt: iso(Date.now()), thresholds, stops: series }
}


/** Срок жизни готового ответа; прогрев пересобирает окна вкладки «Аналитика» чаще. */
export const CONDITIONS_TTL_MS = 6 * 60_000

/** Тот же ответ из общего кэша процесса: один на окно для карты, вкладки «Аналитика» и прогрева. */
export function getStopConditionsCached(db: Db, start: number, end: number, liveEnd: number, force = false): Promise<StopConditionsResponse> {
    return sharedCached(`stop-conditions:${start}:${end}`, CONDITIONS_TTL_MS, async () => {
        const started = Date.now()
        const payload = await buildStopConditions(db, start, end, liveEnd)
        // Время сборки — в лог, чтобы видеть, где тормозит вкладка «Аналитика».
        console.info(`stop-conditions ${new Date(start).toISOString()}..${new Date(end).toISOString()} built in ${Date.now() - started} ms`)
        return payload
    }, force)
}
