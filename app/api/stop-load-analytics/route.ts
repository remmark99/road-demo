import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import type {
    StopLoadLocationHourRow,
    StopLoadLocationSummary,
} from "@/lib/api/stop-load-analytics"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface BusynessWindowRow {
    location_id: string
    window_start: string
    window_end: string | null
    person_count_avg: number | null
    person_count_max: number | null
    sample_count: number | null
}

interface BusStopFeature {
    properties?: {
        id?: number
        name?: string | null
        short_name?: string | null
        description?: string | null
        address?: string | null
    }
}

interface BusStopsFeatureCollection {
    features?: BusStopFeature[]
}

interface StopInfo {
    id: number
    name: string | null
    shortName: string | null
    description: string | null
}

interface StopLoadRangeResponse {
    from: string
    to: string
}

interface StopLoadAnalyticsResponse {
    displayedRange: StopLoadRangeResponse
    fallbackRange: StopLoadRangeResponse | null
    locationHours: StopLoadLocationHourRow[]
    locations: StopLoadLocationSummary[]
    truncated: boolean
    limit: number
    sourceRows: number
    totalRows: number | null
}

interface CacheEntry {
    expiresAt: number
    payload: StopLoadAnalyticsResponse
}

const PAGE_SIZE = 1000
const MAX_RAW_ROWS = 60000
const PARALLEL_PAGE_REQUESTS = 8
const CACHE_TTL_MS = 45_000
const SUPABASE_QUERY_TIMEOUT_MS = 8_000
const SUPABASE_QUERY_ATTEMPTS = 3
const SUPABASE_RETRY_DELAY_MS = 250
const BUSYNESS_COLUMNS = "location_id,window_start,window_end,person_count_avg,person_count_max,sample_count"

const responseCache = new Map<string, CacheEntry>()
let stopsCache: Promise<Map<number, StopInfo>> | null = null
let lastSuccessfulPayload: StopLoadAnalyticsResponse | null = null

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms)
        }),
    ])
}

function isRetryableSupabaseMessage(message: string) {
    return /fetch failed|network|timeout|terminated|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message)
}

async function runSupabaseQuery<T extends { error: { message: string } | null }>(
    factory: () => Promise<T>,
    label: string,
) {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= SUPABASE_QUERY_ATTEMPTS; attempt += 1) {
        try {
            const result = await withTimeout(
                factory(),
                SUPABASE_QUERY_TIMEOUT_MS,
                `${label} timeout`,
            )

            if (!result.error || !isRetryableSupabaseMessage(result.error.message) || attempt === SUPABASE_QUERY_ATTEMPTS) {
                return result
            }

            lastError = new Error(result.error.message)
        } catch (error) {
            lastError = error
            if (attempt === SUPABASE_QUERY_ATTEMPTS) {
                throw error
            }
        }

        await wait(SUPABASE_RETRY_DELAY_MS * attempt)
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} failed`)
}

function startOfLocalDay(date: Date) {
    const result = new Date(date)
    result.setHours(0, 0, 0, 0)
    return result
}

function endOfLocalDay(date: Date) {
    const result = new Date(date)
    result.setHours(23, 59, 59, 999)
    return result
}

function floorToHour(iso: string) {
    const date = new Date(iso)
    date.setMinutes(0, 0, 0)
    return date.toISOString()
}

function toFiniteNumber(value: number | null | undefined) {
    return Number.isFinite(value) ? Number(value) : 0
}

function compareLocationId(a: string, b: string) {
    return a.localeCompare(b, "ru", { numeric: true })
}

function getBusStopIdFromLocationId(locationId: string): number | null {
    const [rawId] = locationId.split("-")
    const id = Number(rawId)

    return Number.isInteger(id) ? id : null
}

function parseDateParam(value: string | null) {
    if (!value) return null

    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function toRangeResponse(from: Date, to: Date): StopLoadRangeResponse {
    return {
        from: from.toISOString(),
        to: to.toISOString(),
    }
}

async function loadStops() {
    const supabase = await createClient()
    const { data, error } = await runSupabaseQuery(
        () => supabase.rpc("get_bus_stops_geojson"),
        "bus stops lookup",
    )

    if (error) {
        throw new Error(error.message)
    }

    const featureCollection = data as BusStopsFeatureCollection

    return (featureCollection.features ?? []).reduce<Map<number, StopInfo>>((lookup, feature) => {
        const properties = feature.properties

        if (typeof properties?.id !== "number") {
            return lookup
        }

        lookup.set(properties.id, {
            id: properties.id,
            name: properties.name ?? null,
            shortName: properties.short_name ?? null,
            description: properties.description ?? null,
        })

        return lookup
    }, new Map<number, StopInfo>())
}

function getStopsLookup() {
    if (!stopsCache) {
        stopsCache = loadStops().catch((error: unknown) => {
            stopsCache = null
            throw error
        })
    }

    return stopsCache
}

function buildStopDisplay(locationId: string, stopsLookup: Map<number, StopInfo>) {
    const stopId = getBusStopIdFromLocationId(locationId)
    const stop = stopId !== null ? stopsLookup.get(stopId) : undefined
    const label = stop?.shortName?.trim() || stop?.name?.trim()
    const direction = stop?.description?.trim()

    return {
        label: label || (stopId !== null ? `Остановка ${stopId}` : `Остановочное направление ${locationId}`),
        detail: direction ? `${direction} · № ${locationId}` : `№ ${locationId}`,
    }
}

async function fetchLatestWindow() {
    const supabase = await createClient()
    const { data, error } = await runSupabaseQuery(
        () => supabase
            .from("busyness_windows")
            .select(BUSYNESS_COLUMNS)
            .order("window_start", { ascending: false })
            .limit(1),
        "latest busyness window",
    )

    if (error) {
        throw new Error(error.message)
    }

    return ((data ?? [])[0] ?? null) as BusynessWindowRow | null
}

async function fetchBusynessRows(from: Date, to: Date) {
    const supabase = await createClient()
    const countQuery = await runSupabaseQuery(
        () => supabase
            .from("busyness_windows")
            .select("location_id", { count: "exact", head: true })
            .gte("window_start", from.toISOString())
            .lte("window_start", to.toISOString()),
        "busyness count",
    )

    if (countQuery.error) {
        throw new Error(countQuery.error.message)
    }

    const totalRows = countQuery.count ?? 0
    const limitedRows = Math.min(totalRows, MAX_RAW_ROWS)

    if (limitedRows === 0) {
        return {
            rows: [] as BusynessWindowRow[],
            totalRows,
            truncated: false,
        }
    }

    const ranges = Array.from(
        { length: Math.ceil(limitedRows / PAGE_SIZE) },
        (_, index) => {
            const fromIndex = index * PAGE_SIZE
            const toIndex = Math.min(limitedRows - 1, fromIndex + PAGE_SIZE - 1)

            return { fromIndex, toIndex }
        },
    )
    const rows: BusynessWindowRow[] = []

    for (let index = 0; index < ranges.length; index += PARALLEL_PAGE_REQUESTS) {
        const chunk = ranges.slice(index, index + PARALLEL_PAGE_REQUESTS)
        const results = await Promise.all(chunk.map(({ fromIndex, toIndex }) => (
            runSupabaseQuery(
                () => supabase
                    .from("busyness_windows")
                    .select(BUSYNESS_COLUMNS)
                    .gte("window_start", from.toISOString())
                    .lte("window_start", to.toISOString())
                    .order("window_start", { ascending: false })
                    .range(fromIndex, toIndex),
                `busyness range ${fromIndex}-${toIndex}`,
            )
        )))

        for (const result of results) {
            if (result.error) {
                throw new Error(result.error.message)
            }

            rows.push(...((result.data ?? []) as BusynessWindowRow[]))
        }
    }

    return {
        rows,
        totalRows,
        truncated: totalRows > MAX_RAW_ROWS,
    }
}

function aggregateRows(
    rows: BusynessWindowRow[],
    stopsLookup: Map<number, StopInfo>,
) {
    const hourMap = new Map<
        string,
        {
            locationId: string
            hourKey: string
            weightedSum: number
            weight: number
            peakPeople: number
            windows: number
        }
    >()
    const locationMap = new Map<
        string,
        {
            latestRow: BusynessWindowRow | null
            weightedSum: number
            weight: number
            peakPeople: number
            windows: number
        }
    >()

    for (const row of rows) {
        const sampleWeight = Math.max(1, toFiniteNumber(row.sample_count))
        const avgPeople = toFiniteNumber(row.person_count_avg)
        const peakPeople = toFiniteNumber(row.person_count_max)
        const hourKey = floorToHour(row.window_start)
        const locationHourKey = `${row.location_id}|${hourKey}`
        const hour = hourMap.get(locationHourKey) ?? {
            locationId: row.location_id,
            hourKey,
            weightedSum: 0,
            weight: 0,
            peakPeople: 0,
            windows: 0,
        }
        const location = locationMap.get(row.location_id) ?? {
            latestRow: null,
            weightedSum: 0,
            weight: 0,
            peakPeople: 0,
            windows: 0,
        }

        hour.weightedSum += avgPeople * sampleWeight
        hour.weight += sampleWeight
        hour.peakPeople = Math.max(hour.peakPeople, peakPeople)
        hour.windows += 1
        hourMap.set(locationHourKey, hour)

        location.weightedSum += avgPeople * sampleWeight
        location.weight += sampleWeight
        location.peakPeople = Math.max(location.peakPeople, peakPeople)
        location.windows += 1

        if (!location.latestRow || row.window_start > location.latestRow.window_start) {
            location.latestRow = row
        }

        locationMap.set(row.location_id, location)
    }

    const locationHours = Array.from(hourMap.values())
        .sort((a, b) => a.hourKey.localeCompare(b.hourKey) || compareLocationId(a.locationId, b.locationId))
        .map<StopLoadLocationHourRow>((row) => ({
            locationId: row.locationId,
            hourKey: row.hourKey,
            avgPeople: row.weight > 0 ? Number((row.weightedSum / row.weight).toFixed(1)) : 0,
            peakPeople: Number(row.peakPeople.toFixed(1)),
            windows: row.windows,
        }))

    const locations = Array.from(locationMap.entries())
        .map<StopLoadLocationSummary>(([locationId, value]) => {
            const display = buildStopDisplay(locationId, stopsLookup)

            return {
                locationId,
                label: display.label,
                detail: display.detail,
                currentPeople: Math.round(toFiniteNumber(value.latestRow?.person_count_avg)),
                averagePeople: value.weight > 0 ? Number((value.weightedSum / value.weight).toFixed(1)) : 0,
                peakPeople: Math.round(value.peakPeople),
                windows: value.windows,
                latestAt: value.latestRow?.window_start ?? null,
            }
        })
        .sort((a, b) => b.currentPeople - a.currentPeople || compareLocationId(a.locationId, b.locationId))

    return {
        locationHours,
        locations,
    }
}

async function buildPayload(from: Date, to: Date): Promise<StopLoadAnalyticsResponse> {
    let stopsLookup = new Map<number, StopInfo>()

    try {
        stopsLookup = await getStopsLookup()
    } catch (error) {
        console.warn("Stop load analytics using fallback stop labels.", error)
    }

    let displayedFrom = from
    let displayedTo = to
    let fallbackRange: StopLoadRangeResponse | null = null
    let result = await fetchBusynessRows(from, to)

    if (result.rows.length === 0) {
        const latestWindow = await fetchLatestWindow()

        if (latestWindow) {
            const latestDate = new Date(latestWindow.window_start)
            displayedFrom = startOfLocalDay(latestDate)
            displayedTo = endOfLocalDay(latestDate)
            fallbackRange = toRangeResponse(displayedFrom, displayedTo)
            result = await fetchBusynessRows(displayedFrom, displayedTo)
        }
    }

    const aggregated = aggregateRows(result.rows, stopsLookup)

    return {
        displayedRange: toRangeResponse(displayedFrom, displayedTo),
        fallbackRange,
        locationHours: aggregated.locationHours,
        locations: aggregated.locations,
        truncated: result.truncated,
        limit: MAX_RAW_ROWS,
        sourceRows: result.rows.length,
        totalRows: result.totalRows,
    }
}

function buildEmptyPayload(from: Date, to: Date): StopLoadAnalyticsResponse {
    return {
        displayedRange: toRangeResponse(from, to),
        fallbackRange: null,
        locationHours: [],
        locations: [],
        truncated: false,
        limit: MAX_RAW_ROWS,
        sourceRows: 0,
        totalRows: 0,
    }
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    const from = parseDateParam(url.searchParams.get("from"))
    const to = parseDateParam(url.searchParams.get("to"))

    if (!from || !to || from.getTime() > to.getTime()) {
        return NextResponse.json(
            { error: "Expected valid from/to ISO date parameters." },
            { status: 400 },
        )
    }

    const cacheKey = `${from.toISOString()}|${to.toISOString()}`
    const cached = responseCache.get(cacheKey)

    if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload, {
            headers: {
                "Cache-Control": "private, max-age=30",
            },
        })
    }

    try {
        const payload = await buildPayload(from, to)
        responseCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            payload,
        })
        lastSuccessfulPayload = payload

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "private, max-age=30",
            },
        })
    } catch (error) {
        console.error("Error fetching stop load analytics:", error)

        return NextResponse.json(lastSuccessfulPayload ?? buildEmptyPayload(from, to), {
            headers: {
                "Cache-Control": "no-store",
                "X-Data-Status": lastSuccessfulPayload ? "stale-fallback" : "empty-fallback",
            },
        })
    }
}
