import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ALLOWED_HIGHWAYS, type RoadsGeoJSON } from '@/lib/api/roads'

// Server-side cache — survives across requests as long as the process is alive
let serverCache: RoadsGeoJSON | null = null

// Упрощение линий: вершины ближе этого порога (в градусах, ≈3 м на широте Сургута)
// к прямой между соседями выбрасываются. На городском масштабе визуально не отличимо,
// а ответ худеет в разы — это самый тяжёлый запрос карты.
const SIMPLIFY_TOLERANCE_DEG = 0.00003
const COORD_DECIMALS = 6

type Position = [number, number]

// Deterministic pseudo-random based on osm_id so each road gets a consistent status
function getSimulatedStatus(osmId: number): string {
    // Simple hash: mix bits of osmId
    const hash = Math.abs(((osmId * 2654435761) >>> 0) % 100)
    if (hash < 55) return 'clean'     // 55% clean
    if (hash < 80) return 'warning'   // 25% warning
    return 'dirty'                    // 20% dirty/snowed
}

// Deterministic pseudo-random assigning of a contractor (1 to 5)
function getContractor(osmId: number): string {
    const hash = Math.abs(((osmId * 198491317) >>> 0) % 5) + 1
    return `Подрядчик ${hash}`
}

function round(value: number) {
    const factor = 10 ** COORD_DECIMALS
    return Math.round(value * factor) / factor
}

/** Perpendicular distance from `point` to the segment `start`–`end` (in degrees). */
function segmentDistance(point: Position, start: Position, end: Position) {
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1])
    const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy))
}

/** Douglas–Peucker, iterative to avoid deep recursion on long roads. */
function simplifyLine(points: Position[], tolerance: number): Position[] {
    if (points.length <= 2) return points
    const keep = new Uint8Array(points.length)
    keep[0] = 1
    keep[points.length - 1] = 1
    const stack: Array<[number, number]> = [[0, points.length - 1]]
    while (stack.length) {
        const [first, last] = stack.pop() as [number, number]
        let maxDistance = 0
        let index = -1
        for (let i = first + 1; i < last; i += 1) {
            const distance = segmentDistance(points[i], points[first], points[last])
            if (distance > maxDistance) {
                maxDistance = distance
                index = i
            }
        }
        if (index !== -1 && maxDistance > tolerance) {
            keep[index] = 1
            stack.push([first, index], [index, last])
        }
    }
    const result: Position[] = []
    for (let i = 0; i < points.length; i += 1) {
        if (keep[i]) result.push([round(points[i][0]), round(points[i][1])])
    }
    return result
}

function simplifyGeometry(geometry: RoadsGeoJSON['features'][number]['geometry']) {
    if (geometry.type === 'LineString') {
        return { ...geometry, coordinates: simplifyLine(geometry.coordinates as Position[], SIMPLIFY_TOLERANCE_DEG) }
    }
    if (geometry.type === 'MultiLineString') {
        return {
            ...geometry,
            coordinates: (geometry.coordinates as Position[][]).map((line) => simplifyLine(line, SIMPLIFY_TOLERANCE_DEG)),
        }
    }
    return geometry
}

export async function GET(request: Request) {
    const supabase = await createClient()
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

    // Filter out unwanted highway types, simplify geometry, keep only the
    // properties the map actually renders, and add simulated snow status.
    const geojson = data as RoadsGeoJSON
    const filtered: RoadsGeoJSON = {
        type: 'FeatureCollection',
        features: geojson.features
            .filter(f => ALLOWED_HIGHWAYS.includes(f.properties.highway))
            .map(f => ({
                ...f,
                geometry: simplifyGeometry(f.geometry),
                properties: {
                    osm_id: f.properties.osm_id,
                    name: f.properties.name,
                    highway: f.properties.highway,
                    status: getSimulatedStatus(f.properties.osm_id),
                    contractor: getContractor(f.properties.osm_id),
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
