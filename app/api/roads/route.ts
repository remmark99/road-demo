import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ALLOWED_HIGHWAYS, type RoadsGeoJSON } from '@/lib/api/roads'

// Server-side cache — survives across requests as long as the process is alive
let serverCache: RoadsGeoJSON | null = null

export async function GET() {
    // Return cached result if available
    if (serverCache) {
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

    // Filter out unwanted highway types server-side
    const geojson = data as RoadsGeoJSON
    const filtered: RoadsGeoJSON = {
        type: 'FeatureCollection',
        features: geojson.features.filter(f =>
            ALLOWED_HIGHWAYS.includes(f.properties.highway)
        ),
    }

    // Cache for future requests
    serverCache = filtered

    return NextResponse.json(filtered, {
        headers: {
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
    })
}
