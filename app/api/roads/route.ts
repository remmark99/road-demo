import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ALLOWED_HIGHWAYS, type RoadsGeoJSON } from '@/lib/api/roads'

// Server-side cache — survives across requests as long as the process is alive
let serverCache: RoadsGeoJSON | null = null

// Deterministic pseudo-random based on osm_id so each road gets a consistent status
function getSimulatedStatus(osmId: number): string {
    // Simple hash: mix bits of osmId
    const hash = Math.abs(((osmId * 2654435761) >>> 0) % 100)
    if (hash < 55) return 'clean'     // 55% clean
    if (hash < 80) return 'warning'   // 25% warning
    return 'dirty'                    // 20% dirty/snowed
}

export async function GET(request: Request) {
    // Force refresh if query param ?refresh is present, otherwise use cache
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.has('refresh')

    if (serverCache && !forceRefresh) {
        return NextResponse.json(serverCache, {
            headers: {
                'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
            },
        })
    }

    const { data, error } = await supabase.rpc('get_roads_geojson')

    if (error) {
        console.error('Error fetching roads:', error)
        return NextResponse.json(
            { type: 'FeatureCollection', features: [] },
            { status: 500 }
        )
    }

    // Filter out unwanted highway types and add simulated snow status
    const geojson = data as RoadsGeoJSON
    const filtered: RoadsGeoJSON = {
        type: 'FeatureCollection',
        features: geojson.features
            .filter(f => ALLOWED_HIGHWAYS.includes(f.properties.highway))
            .map(f => ({
                ...f,
                properties: {
                    ...f.properties,
                    status: getSimulatedStatus(f.properties.osm_id),
                },
            })),
    }

    // Cache for future requests
    serverCache = filtered

    return NextResponse.json(filtered, {
        headers: {
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
    })
}
