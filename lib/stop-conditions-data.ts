import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { getBinEpisode } from '@/lib/bin-episodes'
import type { Alert } from '@/lib/types'
import {
    CONDITION_GLASS_CATEGORIES,
    CONDITION_INCIDENT_ALERT_TYPES,
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
// Эпизод урны записан на время своего начала: ищем начавшиеся до окна.
const BIN_LOOKBACK = 30 * DAY
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

async function readClimate(db: Db, stopIds: number[], start: number, end: number) {
    const step = climateSampleHours(end - start) * HOUR
    const windows: [number, number][] = []
    for (let t = start; t < end; t += step) windows.push([t, Math.min(t + HOUR, end)])
    const byStop = new Map<number, ClimatePoint[]>()
    for (let i = 0; i < windows.length; i += QUERY_CONCURRENCY) {
        const pages = await Promise.all(windows.slice(i, i + QUERY_CONCURRENCY).map(([a, b]) => db
            .from('stop_sensor_history')
            .select('bus_stop_id,category,value,recorded_at')
            // По остановкам: на сервере заказчика есть индекс только (bus_stop_id, recorded_at).
            .in('bus_stop_id', stopIds)
            .in('category', ['temperature', 'humidity'])
            .gte('recorded_at', new Date(a).toISOString())
            .lt('recorded_at', new Date(b).toISOString())
            .order('recorded_at', { ascending: false })
            .limit(CLIMATE_ROWS_PER_SAMPLE)))
        for (const page of pages) {
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
    const [stops, cameras, thresholds] = await Promise.all([
        readAll<{ id: number; short_name: string | null; ip_address: string | null }>((a, b) => db.from('bus_stops').select('id,short_name,ip_address').order('id').range(a, b)),
        readAll<{ camera_index: number; bus_stop_id: number | null }>((a, b) => db.from('cameras').select('camera_index,bus_stop_id').eq('module', 'stops').order('camera_index').range(a, b)),
        readConditionThresholds(),
    ])
    const stopByCamera = new Map<number, number>()
    // В событиях камера записана тем же camera_index, что и в справочнике (проверено на 125).
    for (const camera of cameras) if (camera.bus_stop_id !== null) stopByCamera.set(camera.camera_index, camera.bus_stop_id)
    const stopByLocation = new Map(stops.filter(s => s.short_name).map(s => [s.short_name!, s.id]))
    const stopOf = (cameraIndex: number | null, locationId: unknown) =>
        (cameraIndex !== null ? stopByCamera.get(cameraIndex) : undefined)
        ?? (typeof locationId === 'string' ? stopByLocation.get(locationId) : undefined)

    const iso = (time: number) => new Date(time).toISOString()
    const [climate, bins, safety, glass] = await Promise.all([
        readClimate(db, stops.filter(s => s.ip_address).map(s => s.id), start, end),
        readAll<Pick<Alert, 'alert_type' | 'metadata'> & { camera_index: number | null; timestamp: string }>((a, b) => db.from('alerts')
            .select('alert_type,camera_index,timestamp,metadata').eq('alert_type', 'bin_full')
            .gte('timestamp', iso(start - BIN_LOOKBACK)).lt('timestamp', iso(end)).order('id').range(a, b)),
        readAll<{ camera_index: number | null; timestamp: string; location_id: string | null }>((a, b) => db.from('alerts')
            .select('camera_index,timestamp,location_id:metadata->>location_id').in('alert_type', [...CONDITION_INCIDENT_ALERT_TYPES])
            .gte('timestamp', iso(start - INCIDENT_WINDOW_MS)).lt('timestamp', iso(end)).order('id').range(a, b)),
        readAll<{ bus_stop_id: number | null; created_at: string; alarm: string | null }>((a, b) => db.from('controller_alerts')
            .select('bus_stop_id,created_at,alarm').in('category', [...CONDITION_GLASS_CATEGORIES])
            .gte('created_at', iso(start - INCIDENT_WINDOW_MS)).lt('created_at', iso(end)).order('id').range(a, b)),
    ])

    const series: Record<string, StopConditionSeries> = {}
    const of = (stopId: number) => (series[stopId] ??= { climate: [], bins: [], incidents: [] })
    for (const [stopId, points] of climate) of(stopId).climate = points
    for (const alert of bins) {
        const episode = getBinEpisode(alert)
        const stopId = stopOf(alert.camera_index, alert.metadata?.location_id)
        if (!episode || stopId === undefined) continue
        const begin = Date.parse(episode.started_at), finish = episode.ended_at ? Date.parse(episode.ended_at) : null
        if (begin < end && (finish === null || finish > start)) of(stopId).bins.push([begin, finish])
    }
    for (const alert of safety) {
        const stopId = stopOf(alert.camera_index, alert.location_id)
        if (stopId !== undefined) of(stopId).incidents.push(Date.parse(alert.timestamp))
    }
    for (const alert of glass) {
        if (alert.bus_stop_id === null || !alert.alarm || alert.alarm === 'normal') continue
        of(alert.bus_stop_id).incidents.push(Date.parse(alert.created_at))
    }
    for (const value of Object.values(series)) value.incidents.sort((a, b) => a - b)

    return { from: iso(start), to: iso(liveEnd), generatedAt: iso(Date.now()), thresholds, stops: series }
}

