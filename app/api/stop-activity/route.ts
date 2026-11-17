import { NextResponse } from 'next/server'

import {
    buildStopActivity,
    type BusStopStatusRow,
    type CameraStatusRow,
    type SensorStateRow,
    type StopActivityResponse,
} from '@/lib/api/stop-activity'
import type { EquipmentStatusRow } from '@/lib/equipment-status'
import { getAuthenticatedUser, jsonError } from '@/lib/notifications/http'
import { createClient } from '@/lib/supabase/server'
import { createNotificationAdminClient } from '@/lib/notifications/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Карту опрашивают все открытые вкладки каждые несколько секунд. Один общий
// результат на короткое окно снимает с БД повторные запросы на каждый опрос,
// а свежесть при этом остаётся в пределах тика поллера датчиков (~2–3 с).
const SHARED_CACHE_MS = 2000
let sharedCache: { at: number; body: StopActivityResponse } | null = null
let inflight: Promise<StopActivityResponse> | null = null

async function freshnessMs() {
    const admin = createNotificationAdminClient()
    // Env-only startup value, published by monitor itself; not an editable override.
    const { data, error } = await admin.from('pipeline_settings_agents')
        .select('applied')
        .eq('service', 'equipment-monitor')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (error) throw new Error('Controller heartbeat TTL unavailable')
    const raw = (data?.applied as { equipment_stale_sec?: unknown } | null)?.equipment_stale_sec
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        throw new Error('Controller heartbeat TTL missing or invalid')
    }
    return raw * 1000
}

/** Missing heartbeat schema is unavailable data, never proof of an outage. */
async function loadBusStops(supabase: Awaited<ReturnType<typeof createClient>>): Promise<BusStopStatusRow[]> {
    const { data, error } = await supabase
        .from('bus_stops')
        .select('id,controller_status,last_ping_at,last_ok_at,ip_address,has_controller')
        .limit(10000)

    if (!error) return (data ?? []) as BusStopStatusRow[]

    console.error('Error fetching bus stop controller status:', error)
    throw new Error('Controller heartbeat unavailable')
}

async function buildBody(): Promise<StopActivityResponse> {
    const supabase = await createClient()
    const windowMs = await freshnessMs()

    const [busStops, sensorStates, cameras, equipment, outages, binEpisodes] = await Promise.all([
        loadBusStops(supabase),
        supabase
            .from('stop_sensor_states')
            .select('bus_stop_id,element,category,alarm,updated_at')
            .limit(10000),
        supabase.from('cameras').select('camera_index,bus_stop_id,status').limit(10000),
        // Тот же статус, что на вкладке «Оборудование».
        supabase.from('equipment_state').select('equipment_type,equipment_id,status').limit(10000),
        supabase.from('equipment_outages').select('equipment_id').eq('equipment_type', 'controller').is('ended_at', null).limit(10000),
        // Открытые эпизоды переполнения урн: переполненная урна — инцидент остановки.
        supabase.from('alerts').select('camera_index').eq('alert_type', 'bin_full')
            .eq('metadata->bin_episode->>status', 'open').limit(10000),
    ])

    if (sensorStates.error) throw new Error('Sensor state unavailable')
    if (cameras.error) throw new Error('Camera connectivity unavailable')
    if (equipment.error || outages.error) throw new Error('Equipment connectivity unavailable')
    // Урны дополняют инциденты; если запрос не прошёл, статусы всё равно отдаём.
    if (binEpisodes.error) console.error('Open bin episodes unavailable:', binEpisodes.error)

    return {
        freshnessMs: windowMs,
        stops: buildStopActivity({
            busStops,
            sensorRows: (sensorStates.data ?? []) as SensorStateRow[],
            cameraRows: (cameras.data ?? []) as CameraStatusRow[],
            equipmentRows: (equipment.data ?? []) as EquipmentStatusRow[],
            controllerOutageIds: (outages.data ?? []).map(row => row.equipment_id),
            binFullCameraIndexes: (binEpisodes.data ?? []).map(row => row.camera_index).filter((index): index is number => typeof index === 'number'),
            windowMs,
        }),
    }
}

export async function GET() {
    // Живой статус датчиков и камер по остановкам — только для вошедших.
    const user = await getAuthenticatedUser()
    if (!user) return jsonError('Требуется авторизация', 401)

    const now = Date.now()
    if (sharedCache && now - sharedCache.at < SHARED_CACHE_MS) {
        return NextResponse.json(sharedCache.body, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Параллельные запросы в одно окно ждут один и тот же расчёт.
    if (!inflight) {
        inflight = buildBody()
            .then((body) => {
                sharedCache = { at: Date.now(), body }
                return body
            })
            .finally(() => { inflight = null })
    }
    try {
        const body = await inflight
        return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
        console.error('Stop activity unavailable:', error)
        return jsonError('Статус оборудования временно недоступен', 503)
    }
}
