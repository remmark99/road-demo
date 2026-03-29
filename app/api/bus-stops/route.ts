import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BusStopsGeoJSON } from '@/lib/api/bus-stops'

let serverCache: BusStopsGeoJSON | null = null

export async function GET(request: Request) {
    const supabase = await createClient()
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.has('refresh')

    if (serverCache && !forceRefresh) {
        return NextResponse.json(serverCache, {
            headers: {
                'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
            },
        })
    }

    const { data, error } = await supabase.rpc('get_bus_stops_geojson')

    if (error) {
        console.error('Error fetching bus stops:', error)
        return NextResponse.json(
            { type: 'FeatureCollection', features: [] },
            { status: 500 }
        )
    }

    serverCache = data as BusStopsGeoJSON

    return NextResponse.json(serverCache, {
        headers: {
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
    })
}
