import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BusStopsGeoJSON } from '@/lib/api/bus-stops'

// Остановки правятся слиянием с «Умным транспортом» и вручную — держим не дольше 5 минут.
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }
let serverCache: { data: BusStopsGeoJSON; at: number } | null = null

export async function GET(request: Request) {
    const supabase = await createClient()
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.has('refresh')

    if (serverCache && !forceRefresh && Date.now() - serverCache.at < CACHE_TTL_MS) {
        return NextResponse.json(serverCache.data, { headers: CACHE_HEADERS })
    }

    const { data, error } = await supabase.rpc('get_bus_stops_geojson')

    if (error) {
        console.error('Error fetching bus stops:', error)
        return NextResponse.json(
            { type: 'FeatureCollection', features: [] },
            { status: 500 }
        )
    }

    const [inventory, cameras] = await Promise.all([
        supabase.from('bus_stops').select('id,has_controller,ip_address').limit(10000),
        supabase.from('cameras').select('bus_stop_id').limit(10000),
    ])
    if (inventory.error || cameras.error) {
        return NextResponse.json({ error: 'Equipment inventory unavailable' }, { status: 503 })
    }
    const controllers = new Map((inventory.data ?? []).map(stop => [stop.id, stop.has_controller === true || Boolean(stop.ip_address?.trim())]))
    const cameraCounts = new Map<number, number>()
    for (const camera of cameras.data ?? []) {
        if (camera.bus_stop_id != null) cameraCounts.set(camera.bus_stop_id, (cameraCounts.get(camera.bus_stop_id) ?? 0) + 1)
    }
    const geometry = data as BusStopsGeoJSON
    const enriched: BusStopsGeoJSON = {
        ...geometry,
        features: geometry.features.map(feature => {
            const id = feature.properties.id
            const hasController = controllers.get(id) ?? false
            const cameraCount = cameraCounts.get(id) ?? 0
            return { ...feature, properties: { ...feature.properties, sensor_data: {
                activity_status: 'unknown', sensors_online: false, cameras_online: false,
                online_camera_count: 0, total_camera_count: cameraCount,
                has_controller: hasController, has_equipment: hasController || cameraCount > 0,
                is_online: false, is_partly_equipped: false,
            } } }
        }),
    }
    serverCache = { data: enriched, at: Date.now() }

    return NextResponse.json(serverCache.data, { headers: CACHE_HEADERS })
}
