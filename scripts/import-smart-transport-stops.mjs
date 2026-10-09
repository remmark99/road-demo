#!/usr/bin/env node
// Imports stops from the «Умный транспорт» dispatcher API into
// public.smart_transport_stops (sql/smart_transport_stops_schema.sql).
// bus_stops is only read, to record the nearest stop and the same-id stop.
//
// Env: SMART_TRANSPORT_LOGIN, SMART_TRANSPORT_PASSWORD,
//      SMART_TRANSPORT_API_URL (default http://194.169.247.205/v12/86002),
//      NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Usage: node scripts/import-smart-transport-stops.mjs [--dry-run]

const dryRun = process.argv.includes('--dry-run')
const api = (process.env.SMART_TRANSPORT_API_URL || 'http://194.169.247.205/v12/86002').replace(/\/$/, '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
for (const [name, value] of Object.entries({
    SMART_TRANSPORT_LOGIN: process.env.SMART_TRANSPORT_LOGIN,
    SMART_TRANSPORT_PASSWORD: process.env.SMART_TRANSPORT_PASSWORD,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
})) {
    if (!value) throw new Error(`${name} is not set`)
}

async function postJson(url, body, token) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`${url.replace(api, '')}: HTTP ${res.status}`)
    return res.json()
}

async function loadStations() {
    const auth = await postJson(`${api}/authorization/token`, {
        login: process.env.SMART_TRANSPORT_LOGIN,
        password: process.env.SMART_TRANSPORT_PASSWORD,
    })
    if (!auth?.token) throw new Error('Smart Transport login failed')
    const stations = []
    for (let skip = 0; ; ) {
        const page = await postJson(`${api}/stations/load`, { skip, take: 500, requireTotalCount: true }, auth.token)
        stations.push(...page.entities)
        skip += page.entities.length
        if (skip >= page.totalCount) break
        if (!page.entities.length) throw new Error('Station pagination did not advance')
    }
    return stations
}

async function supabase(path, init = {}) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]}: HTTP ${res.status} ${await res.text()}`)
    const body = await res.text()
    return body ? JSON.parse(body) : null
}

async function loadBusStops() {
    const rows = []
    for (let offset = 0; ; offset += 1000) {
        const page = await supabase(`bus_stops?select=id,geom&order=id&offset=${offset}&limit=1000`)
        rows.push(...page)
        if (page.length < 1000) return rows.filter(row => row.geom?.coordinates)
    }
}

function distanceM(lat1, lng1, lat2, lng2) {
    const R = 6371000
    const toRad = Math.PI / 180
    const dLat = (lat2 - lat1) * toRad
    const dLng = (lng2 - lng1) * toRad
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(a))
}

const round = value => (value == null ? null : Math.round(value * 10) / 10)
const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null)

const [stations, busStops] = await Promise.all([loadStations(), loadBusStops()])
const byId = new Map(busStops.map(stop => [stop.id, stop]))
const fetchedAt = new Date().toISOString()
const rows = stations.map(station => {
    let nearest = null
    for (const stop of busStops) {
        const [lng, lat] = stop.geom.coordinates
        const d = distanceM(station.lat, station.lng, lat, lng)
        if (!nearest || d < nearest.d) nearest = { id: stop.id, d }
    }
    const sameId = byId.get(station.id)
    return {
        id: station.id,
        name: text(station.name) || `Остановка №${station.id}`,
        short_name: text(station.shortName),
        description: text(station.description),
        address: text(station.address),
        note: text(station.note),
        transport_type_flags: station.transportTypeFlags ?? null,
        direction: station.direction ?? null,
        is_active: station.isActive !== false,
        station_owner_id: station.stationOwnerId ?? null,
        lat: station.lat,
        lng: station.lng,
        geo_zone: station.geoZoneNodes ?? null,
        nearest_bus_stop_id: nearest?.id ?? null,
        nearest_distance_m: round(nearest?.d),
        same_id_distance_m: sameId ? round(distanceM(station.lat, station.lng, sameId.geom.coordinates[1], sameId.geom.coordinates[0])) : null,
        fetched_at: fetchedAt,
    }
})

const near = rows.filter(row => row.nearest_distance_m != null && row.nearest_distance_m <= 30).length
console.log(`Smart Transport stops: ${rows.length}; bus_stops: ${busStops.length}; matched within 30 m: ${near}; unmatched: ${rows.length - near}`)
if (dryRun) process.exit(0)

await supabase('smart_transport_stops?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
})
// Stops removed from Smart Transport disappear from the snapshot too.
const stale = await supabase(`smart_transport_stops?select=id&fetched_at=lt.${encodeURIComponent(fetchedAt)}`)
if (stale.length) {
    await supabase(`smart_transport_stops?fetched_at=lt.${encodeURIComponent(fetchedAt)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}
console.log(`Upserted ${rows.length}, removed ${stale.length}`)
