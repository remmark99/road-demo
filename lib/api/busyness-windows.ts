import { createClient } from "@/lib/supabase/client"

export interface BusynessWindowRow {
    location_id: string
    window_start: string
    window_end: string | null
    person_count_avg: number | null
    person_count_max: number | null
    sample_count: number | null
}

export interface BusynessStopInfo {
    id: number
    name: string | null
    short_name: string | null
    description: string | null
    address: string | null
}

export type BusynessStopLookup = Record<number, BusynessStopInfo>

export interface FetchBusynessWindowsOptions {
    from: Date
    to: Date
    locationIds?: string[]
    limit?: number
}

export interface FetchBusynessWindowsResult {
    rows: BusynessWindowRow[]
    truncated: boolean
    limit: number
}

const DEFAULT_LIMIT = 50000
const PAGE_SIZE = 1000

export function getBusStopIdFromLocationId(locationId: string): number | null {
    const [rawId] = locationId.split("-")
    const id = Number(rawId)

    return Number.isInteger(id) ? id : null
}

export async function fetchBusynessWindows({
    from,
    to,
    locationIds,
    limit = DEFAULT_LIMIT,
}: FetchBusynessWindowsOptions): Promise<FetchBusynessWindowsResult> {
    const supabase = createClient()
    const rows: BusynessWindowRow[] = []

    while (rows.length < limit) {
        const pageLimit = Math.min(PAGE_SIZE, limit - rows.length)
        const fromIndex = rows.length
        const toIndex = fromIndex + pageLimit - 1

        let query = supabase
            .from("busyness_windows")
            .select("location_id,window_start,window_end,person_count_avg,person_count_max,sample_count")
            .gte("window_start", from.toISOString())
            .lte("window_start", to.toISOString())
            .order("window_start", { ascending: false })
            .range(fromIndex, toIndex)

        if (locationIds && locationIds.length > 0) {
            query = query.in("location_id", locationIds)
        }

        const { data, error } = await query

        if (error) {
            throw new Error(error.message)
        }

        const page = (data ?? []) as BusynessWindowRow[]
        rows.push(...page)

        if (page.length < pageLimit) {
            break
        }
    }

    return {
        rows: rows.sort((a, b) => a.window_start.localeCompare(b.window_start)),
        truncated: rows.length >= limit,
        limit,
    }
}

export async function fetchLatestBusynessWindow(): Promise<BusynessWindowRow | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from("busyness_windows")
        .select("location_id,window_start,window_end,person_count_avg,person_count_max,sample_count")
        .order("window_start", { ascending: false })
        .limit(1)

    if (error) {
        throw new Error(error.message)
    }

    return ((data ?? [])[0] ?? null) as BusynessWindowRow | null
}

export async function fetchBusStopsForLocations(locationIds: string[]): Promise<BusynessStopLookup> {
    const stopIds = Array.from(
        new Set(
            locationIds
                .map(getBusStopIdFromLocationId)
                .filter((id): id is number => id !== null)
        )
    )

    if (stopIds.length === 0) {
        return {}
    }

    const response = await fetch("/api/bus-stops")

    if (!response.ok) {
        throw new Error(`Failed to fetch bus stops: ${response.status}`)
    }

    const data = await response.json() as {
        features?: Array<{
            properties?: BusynessStopInfo
        }>
    }
    const wantedIds = new Set(stopIds)

    return (data.features ?? []).reduce<BusynessStopLookup>((lookup, feature) => {
        const properties = feature.properties

        if (properties && wantedIds.has(properties.id)) {
            lookup[properties.id] = properties
        }

        return lookup
    }, {})
}
