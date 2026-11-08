import { cityDayStart } from "@/lib/analytics/city-time"
import { NextResponse } from "next/server"

import { getStopComplexByLocationId } from "@/lib/stop-analytics-config"
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
}

/** Ответ get_stop_load_hourly: компактные строки вместо объектов. */
type HourTuple = [locationId: string, hourStart: string, weightedSum: number, weight: number, peak: number, windows: number]
type LatestTuple = [locationId: string, windowStart: string, personCountAvg: number]

interface HourlyAggregate {
    hours: HourTuple[]
    latest: LatestTuple[]
}

interface CacheEntry {
    expiresAt: number
    payload: StopLoadAnalyticsResponse
}

const CACHE_TTL_MS = 45_000
const SUPABASE_QUERY_TIMEOUT_MS = 8_000
const SUPABASE_QUERY_ATTEMPTS = 3
const SUPABASE_RETRY_DELAY_MS = 250
const BUSYNESS_COLUMNS = "location_id,window_start,window_end,person_count_avg,person_count_max,sample_count"

const responseCache = new Map<string, CacheEntry>()
let stopsCache: Promise<Map<number, StopInfo>> | null = null

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
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
    factory: () => PromiseLike<T>,
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
    const complex = getStopComplexByLocationId(locationId)
    const stopId = /^\d+$/.test(locationId) ? Number(locationId) : null
    const stop = [...stopsLookup.values()].find(s => s.shortName === locationId) ?? (stopId !== null ? stopsLookup.get(stopId) : undefined)
    const label = stop?.name?.trim() || complex?.stopName || stop?.shortName?.trim()
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

async function fetchHourlyAggregate(from: Date, to: Date) {
    const supabase = await createClient()
    const { data, error } = await runSupabaseQuery(
        () => supabase.rpc("get_stop_load_hourly", {
            p_from: from.toISOString(),
            p_to: to.toISOString(),
        }),
        "busyness hourly aggregate",
    )

    if (error) {
        throw new Error(error.message)
    }

    return (data ?? { hours: [], latest: [] }) as HourlyAggregate
}

function aggregateRows(
    { hours, latest }: HourlyAggregate,
    stopsLookup: Map<number, StopInfo>,
) {
    const locationMap = new Map<string, { weightedSum: number; weight: number; peakPeople: number; windows: number }>()

    for (const [locationId, , weightedSum, weight, peak, windows] of hours) {
        const location = locationMap.get(locationId) ?? { weightedSum: 0, weight: 0, peakPeople: 0, windows: 0 }
        location.weightedSum += weightedSum
        location.weight += weight
        location.peakPeople = Math.max(location.peakPeople, peak)
        location.windows += windows
        locationMap.set(locationId, location)
    }

    const latestByLocation = new Map(latest.map(([locationId, windowStart, avg]) => [locationId, { windowStart, avg }]))

    const locationHours = hours
        .map<StopLoadLocationHourRow>(([locationId, hourStart, weightedSum, weight, peak, windows]) => ({
            locationId,
            hourKey: new Date(hourStart).toISOString(),
            avgPeople: weight > 0 ? weightedSum / weight : 0,
            peakPeople: Number(peak.toFixed(1)),
            windows,
            sampleCount: weight,
        }))
        .sort((a, b) => a.hourKey.localeCompare(b.hourKey) || compareLocationId(a.locationId, b.locationId))

    const locations = Array.from(locationMap.entries())
        .map<StopLoadLocationSummary>(([locationId, value]) => {
            const display = buildStopDisplay(locationId, stopsLookup)
            const newest = latestByLocation.get(locationId)

            return {
                locationId,
                label: display.label,
                detail: display.detail,
                currentPeople: Math.round(newest?.avg ?? 0),
                averagePeople: value.weight > 0 ? Number((value.weightedSum / value.weight).toFixed(1)) : 0,
                peakPeople: Math.round(value.peakPeople),
                windows: value.windows,
                latestAt: newest ? new Date(newest.windowStart).toISOString() : null,
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
    let result = await fetchHourlyAggregate(from, to)

    if (result.hours.length === 0) {
        const latestWindow = await fetchLatestWindow()

        if (latestWindow) {
            const latestDate = new Date(latestWindow.window_start)
            displayedFrom = cityDayStart(latestDate)
            displayedTo = new Date(cityDayStart(latestDate).getTime() + 86_400_000 - 1)
            fallbackRange = toRangeResponse(displayedFrom, displayedTo)
            result = await fetchHourlyAggregate(displayedFrom, displayedTo)
        }
    }

    const aggregated = aggregateRows(result, stopsLookup)

    return {
        displayedRange: toRangeResponse(displayedFrom, displayedTo),
        fallbackRange,
        locationHours: aggregated.locationHours,
        locations: aggregated.locations,
    }
}

function buildEmptyPayload(from: Date, to: Date): StopLoadAnalyticsResponse {
    return {
        displayedRange: toRangeResponse(from, to),
        fallbackRange: null,
        locationHours: [],
        locations: [],
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

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "private, max-age=30",
            },
        })
    } catch (error) {
        console.error("Error fetching stop load analytics:", error)

        return NextResponse.json(
            { error: 'Не удалось загрузить пассажирскую аналитику. Попробуйте ещё раз.' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        )
    }
}
