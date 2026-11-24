// Серверная часть пассажирской аналитики: читает часовую загруженность из базы.
// Общая для маршрута /api/stop-load-analytics и для прогрева в instrumentation.ts.
import { cityDayStart } from "@/lib/analytics/city-time"
import { getStopComplexByLocationId } from "@/lib/stop-analytics-config"
import { sharedCached, sharedState } from "@/lib/server/shared-cache"
import { analyticsLoadRange } from "@/lib/stop-analytics-vision/chunks"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
    StopLoadLocationHourRow,
    StopLoadLocationSummary,
} from "@/lib/api/stop-load-analytics"

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

export interface StopLoadAnalyticsResponse {
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

const CACHE_TTL_MS = 45_000
/** Окно вкладки «Аналитика» прогревается на сервере и живёт дольше промежутка между прогревами. */
const ANALYTICS_TTL_MS = 6 * 60_000
const SUPABASE_QUERY_TIMEOUT_MS = 8_000
const SUPABASE_QUERY_ATTEMPTS = 3
const SUPABASE_RETRY_DELAY_MS = 250
const BUSYNESS_COLUMNS = "location_id,window_start,window_end,person_count_avg,person_count_max,sample_count"

// Справочник остановок — один на процесс: прогрев и маршрут собираются отдельно.
const stops = sharedState("stop-load-stops", () => ({ lookup: null as Promise<Map<number, StopInfo>> | null }))

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

function toRangeResponse(from: Date, to: Date): StopLoadRangeResponse {
    return {
        from: from.toISOString(),
        to: to.toISOString(),
    }
}

async function loadStops(supabase: SupabaseClient) {
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

function getStopsLookup(supabase: SupabaseClient) {
    if (!stops.lookup) {
        stops.lookup = loadStops(supabase).catch((error: unknown) => {
            stops.lookup = null
            throw error
        })
    }

    return stops.lookup
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

async function fetchLatestWindow(supabase: SupabaseClient) {
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

async function fetchHourlyAggregate(supabase: SupabaseClient, from: Date, to: Date) {
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

async function buildPayload(supabase: SupabaseClient, from: Date, to: Date): Promise<StopLoadAnalyticsResponse> {
    let stopsLookup = new Map<number, StopInfo>()

    try {
        stopsLookup = await getStopsLookup(supabase)
    } catch (error) {
        console.warn("Stop load analytics using fallback stop labels.", error)
    }

    let displayedFrom = from
    let displayedTo = to
    let fallbackRange: StopLoadRangeResponse | null = null
    let result = await fetchHourlyAggregate(supabase, from, to)

    if (result.hours.length === 0) {
        const latestWindow = await fetchLatestWindow(supabase)

        if (latestWindow) {
            const latestDate = new Date(latestWindow.window_start)
            displayedFrom = cityDayStart(latestDate)
            displayedTo = new Date(cityDayStart(latestDate).getTime() + 86_400_000 - 1)
            fallbackRange = toRangeResponse(displayedFrom, displayedTo)
            result = await fetchHourlyAggregate(supabase, displayedFrom, displayedTo)
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

/** Период вкладки «Аналитика»: совпадает с окном прогрева на сейчас или на ближайший час. */
function isAnalyticsRange(from: Date, to: Date) {
    const now = Date.now()
    return [now, now + 3_600_000].some((at) => {
        const [start, end] = analyticsLoadRange(at)
        return start === from.getTime() && end === to.getTime()
    })
}

/** Ответ из общего кэша процесса: один на период для всех пользователей и для прогрева. */
export function getStopLoadPayloadCached(supabase: SupabaseClient, from: Date, to: Date, force = false): Promise<StopLoadAnalyticsResponse> {
    const ttl = isAnalyticsRange(from, to) ? ANALYTICS_TTL_MS : CACHE_TTL_MS
    return sharedCached(`stop-load:${from.toISOString()}|${to.toISOString()}`, ttl, async () => {
        const started = Date.now()
        const payload = await buildPayload(supabase, from, to)
        console.info(`stop-load-analytics built in ${Date.now() - started} ms`)
        return payload
    }, force)
}
