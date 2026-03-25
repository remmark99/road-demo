import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { AnchorsGeoJSON } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: anchors, error } = await supabase
        .from('anchors')
        .select('*')
        .eq('status', 'active')

    console.log(`[API] Fetching anchors, found ${anchors?.length || 0} active anchors`)
    if (anchors && anchors.length > 0) {
        console.log(`[API] First anchor radius: ${anchors[0].detection_radius}`)
    }

    if (error) {
        console.error('Error fetching anchors:', error)
        return NextResponse.json(
            { type: 'FeatureCollection', features: [] },
            { status: 500 }
        )
    }

    const geojson: AnchorsGeoJSON = {
        type: 'FeatureCollection',
        features: (anchors || []).map(anchor => ({
            type: 'Feature',
            properties: {
                ...anchor,
                // Ensure detection_radius is definitely a number
                detection_radius: Number(anchor.detection_radius)
            },
            geometry: {
                type: 'Point',
                coordinates: [anchor.lng, anchor.lat]
            }
        }))
    }

    return NextResponse.json(geojson, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        },
    })
}
