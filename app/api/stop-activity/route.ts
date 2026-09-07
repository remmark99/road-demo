import { NextResponse } from 'next/server'

import {
    STOP_ACTIVITY_FRESHNESS_MS,
    buildStopActivity,
    type BusStopStatusRow,
    type CameraStatusRow,
    type SensorStateRow,
    type StopActivityResponse,
} from '@/lib/api/stop-activity'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MISSING_COLUMN = '42703'

function freshnessMs() {
    const raw = Number(process.env.STOP_ACTIVITY_FRESHNESS_MINUTES)
    return Number.isFinite(raw) && raw > 0 ? raw * 60 * 1000 : STOP_ACTIVITY_FRESHNESS_MS
}

/**
 * `controller_status` / `last_ping_at` / `ip_address` are written by the external
 * controller worker and may be absent on older deployments — fall back to ids only.
 */
async function loadBusStops(supabase: Awaited<ReturnType<typeof createClient>>): Promise<BusStopStatusRow[]> {
    const { data, error } = await supabase
        .from('bus_stops')
        .select('id,controller_status,last_ping_at,ip_address')
        .limit(10000)

    if (!error) return (data ?? []) as BusStopStatusRow[]

    if (error.code === MISSING_COLUMN) {
        console.warn('bus_stops is missing controller columns, falling back to ids only')
        const fallback = await supabase.from('bus_stops').select('id').limit(10000)
        if (!fallback.error) return (fallback.data ?? []) as BusStopStatusRow[]
    }

    console.error('Error fetching bus stop controller status:', error)
    return []
}

export async function GET() {
    const supabase = await createClient()
    const windowMs = freshnessMs()

    const [busStops, sensorStates, cameras] = await Promise.all([
        loadBusStops(supabase),
        supabase
            .from('stop_sensor_states')
            .select('bus_stop_id,element,category,alarm,updated_at')
            .limit(10000),
        supabase.from('cameras').select('bus_stop_id,status').limit(10000),
    ])

    if (sensorStates.error) console.error('Error fetching sensor states:', sensorStates.error)
    if (cameras.error) console.error('Error fetching cameras:', cameras.error)

    const body: StopActivityResponse = {
        freshnessMs: windowMs,
        stops: buildStopActivity({
            busStops,
            sensorRows: (sensorStates.data ?? []) as SensorStateRow[],
            cameraRows: (cameras.data ?? []) as CameraStatusRow[],
            windowMs,
        }),
    }

    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
