import { createClient } from "@/lib/supabase/client"

export interface StopConditionWindowRow {
    location_id: string
    window_start: string
    window_end: string | null
    trash_fill_avg: number | null
    trash_fill_max: number | null
    sample_count: number | null
    created_at: string | null
}

export interface FetchStopConditionWindowsOptions {
    from: Date
    to: Date
    locationIds?: string[]
    limit?: number
}

export interface FetchStopConditionWindowsResult {
    rows: StopConditionWindowRow[]
    truncated: boolean
    limit: number
}

const DEFAULT_LIMIT = 50000
const PAGE_SIZE = 1000

export async function fetchStopConditionWindows({
    from,
    to,
    locationIds,
    limit = DEFAULT_LIMIT,
}: FetchStopConditionWindowsOptions): Promise<FetchStopConditionWindowsResult> {
    const supabase = createClient()
    const rows: StopConditionWindowRow[] = []

    while (rows.length < limit) {
        const pageLimit = Math.min(PAGE_SIZE, limit - rows.length)
        const fromIndex = rows.length
        const toIndex = fromIndex + pageLimit - 1

        let query = supabase
            .from("stop_condition_windows")
            .select("location_id,window_start,window_end,trash_fill_avg,trash_fill_max,sample_count,created_at")
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

        const page = (data ?? []) as StopConditionWindowRow[]
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

export async function fetchLatestStopConditionWindow(): Promise<StopConditionWindowRow | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from("stop_condition_windows")
        .select("location_id,window_start,window_end,trash_fill_avg,trash_fill_max,sample_count,created_at")
        .order("window_start", { ascending: false })
        .limit(1)

    if (error) {
        throw new Error(error.message)
    }

    return ((data ?? [])[0] ?? null) as StopConditionWindowRow | null
}
