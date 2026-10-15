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

    serverCache = { data: data as BusStopsGeoJSON, at: Date.now() }

    return NextResponse.json(serverCache.data, { headers: CACHE_HEADERS })
}
