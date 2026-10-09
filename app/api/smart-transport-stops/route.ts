import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SmartTransportStopsGeoJSON } from '@/lib/api/smart-transport-stops'

export const dynamic = 'force-dynamic'

type Row = {
    id: number
    name: string
    description: string | null
    direction: number | null
    lat: number
    lng: number
    nearest_bus_stop_id: number | null
    nearest_distance_m: number | null
    same_id_distance_m: number | null
    fetched_at: string
}

export async function GET() {
    const headers = { 'Cache-Control': 'private, no-store' }
    const empty: SmartTransportStopsGeoJSON = { type: 'FeatureCollection', features: [] }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json(empty, { status: 401, headers })

    const { data, error } = await supabase
        .from('smart_transport_stops')
        .select('id,name,description,direction,lat,lng,nearest_bus_stop_id,nearest_distance_m,same_id_distance_m,fetched_at')
        .order('id')
        .limit(5000)
    if (error) {
        console.error('Error fetching Smart Transport stops:', error)
        return NextResponse.json(empty, { status: 500, headers })
    }
    const rows = (data || []) as Row[]

    const ids = [...new Set(rows.flatMap(row => [row.id, row.nearest_bus_stop_id]).filter((id): id is number => id != null))]
    const names = new Map<number, string>()
    for (let start = 0; start < ids.length; start += 500) {
        const { data: stops, error: stopsError } = await supabase.from('bus_stops').select('id,name').in('id', ids.slice(start, start + 500))
        if (stopsError) {
            console.error('Error fetching bus stop names:', stopsError)
            break
        }
        for (const stop of stops || []) names.set(stop.id, (stop.name || `Остановка №${stop.id}`).trim())
    }

    const result: SmartTransportStopsGeoJSON = {
        type: 'FeatureCollection',
        features: rows.map(row => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
            properties: {
                id: row.id,
                name: row.name,
                description: row.description,
                direction: row.direction,
                nearest_bus_stop_id: row.nearest_bus_stop_id,
                nearest_bus_stop_name: row.nearest_bus_stop_id != null ? names.get(row.nearest_bus_stop_id) ?? null : null,
                nearest_distance_m: row.nearest_distance_m,
                same_id_bus_stop_name: row.same_id_distance_m != null ? names.get(row.id) ?? null : null,
                same_id_distance_m: row.same_id_distance_m,
                fetched_at: row.fetched_at,
            },
        })),
    }
    return NextResponse.json(result, { headers })
}
