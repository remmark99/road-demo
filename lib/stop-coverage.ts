import type { Polygon, MultiPolygon, Position } from 'geojson'
import type { BusStopsGeoJSON } from './api/bus-stops'
import type { StopActivityResponse } from './api/stop-activity'

export interface StopDistrict { id: number; name: string; geom: Polygon | MultiPolygon }

// Ray casting, with an explicit boundary result. Holes are excluded.
function inRing(point: Position, ring: Position[]): 'inside' | 'outside' | 'boundary' {
    const [x, y] = point
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j], [bx, by] = ring[i]
        const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
        if (Math.abs(cross) < 1e-14 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return 'boundary'
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
    }
    return inside ? 'inside' : 'outside'
}
function inPolygon(point: Position, rings: Position[][]) {
    if (!rings.length || inRing(point, rings[0]) === 'outside') return false
    return !rings.slice(1).some(ring => inRing(point, ring) === 'inside')
}
function covers(point: Position, geometry: StopDistrict['geom']) {
    if (geometry?.type === 'Polygon') return inPolygon(point, geometry.coordinates)
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some(polygon => inPolygon(point, polygon))
    return false
}

/** Exact containment in stored district polygons; never nearest-centre estimates. */
export function exactStopCoverage(geometry: BusStopsGeoJSON, districts: StopDistrict[], activity: StopActivityResponse | null) {
    const rows = districts.map(d => ({ districtId: d.id, districtName: d.name, total: 0, equipped: 0, coveragePct: 0 }))
    let unassigned = 0, ambiguous = 0
    for (const stop of geometry.features) {
        const point = stop.geometry?.coordinates
        const matches = point?.length >= 2 && point.every(Number.isFinite) ? districts.flatMap((district, i) => covers(point, district.geom) ? [i] : []) : []
        if (matches.length === 0) { unassigned++; continue }
        if (matches.length > 1) { ambiguous++; continue }
        const row = rows[matches[0]]
        row.total++
        if (activity?.stops[stop.properties.id]?.has_equipment) row.equipped++
    }
    for (const row of rows) row.coveragePct = row.total ? 100 * row.equipped / row.total : 0
    return { unassigned, ambiguous, rows: rows.sort((a, b) => a.districtName.localeCompare(b.districtName, 'ru', { numeric: true })) }
}
