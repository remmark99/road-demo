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

export interface StopTrashOverflowAlertRow {
    id: string
    module_name: string | null
    alert_type: string
    severity: number | null
    message: string | null
    metadata: Record<string, unknown> | null
    timestamp: string
    source_video: string | null
    clip_path: string | null
    camera_index: number | null
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
    sourceUnavailable: boolean
}

const DEFAULT_LIMIT = 50000
const PAGE_SIZE = 1000
const DEFAULT_ALERT_LIMIT = 2000

export const STOP_TRASH_OVERFLOW_ALERT_TYPES = [
    "trash_overflow",
    "trash_bin_overflow",
    "bin_overflow",
    "bin_full",
    "garbage_overflow",
    "stop_trash_overflow",
    "stop_bin_overflow",
    "overflowing_trash",
    "overflowing_bin",
    "trash_full",
    "park_trash_overflow",
] as const

const STOP_ALERT_MODULE_NAMES = [
    "stops",
    "bus_stop_monitoring",
    "stop_monitoring",
]

interface SupabaseQueryError {
    code?: string
    message?: string
    details?: string | null
    hint?: string | null
}

function isStopConditionSchemaMissing(error: SupabaseQueryError) {
    const message = [
        error.message,
        error.details,
        error.hint,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

    return (
        error.code === "PGRST205" ||
        (
            message.includes("stop_condition_windows") &&
            (
                message.includes("schema cache") ||
                message.includes("could not find the table")
            )
        )
    )
}

function unavailableResult(limit: number): FetchStopConditionWindowsResult {
    return {
        rows: [],
        truncated: false,
        limit,
        sourceUnavailable: true,
    }
}

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
            if (isStopConditionSchemaMissing(error)) {
                return unavailableResult(limit)
            }

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
        sourceUnavailable: false,
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
        if (isStopConditionSchemaMissing(error)) {
            return null
        }

        throw new Error(error.message)
    }

    return ((data ?? [])[0] ?? null) as StopConditionWindowRow | null
}

export async function fetchStopTrashOverflowAlerts({
    from,
    to,
    limit = DEFAULT_ALERT_LIMIT,
}: {
    from: Date
    to: Date
    limit?: number
}): Promise<StopTrashOverflowAlertRow[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from("alerts")
        .select("id,module_name,alert_type,severity,message,metadata,timestamp,source_video,clip_path,camera_index")
        .in("module_name", STOP_ALERT_MODULE_NAMES)
        .in("alert_type", [...STOP_TRASH_OVERFLOW_ALERT_TYPES])
        .gte("timestamp", from.toISOString())
        .lte("timestamp", to.toISOString())
        .order("timestamp", { ascending: false })
        .limit(limit)

    if (error) {
        throw new Error(error.message)
    }

    return (data ?? []) as StopTrashOverflowAlertRow[]
}

export async function fetchLatestStopTrashOverflowAlert(): Promise<StopTrashOverflowAlertRow | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from("alerts")
        .select("id,module_name,alert_type,severity,message,metadata,timestamp,source_video,clip_path,camera_index")
        .in("module_name", STOP_ALERT_MODULE_NAMES)
        .in("alert_type", [...STOP_TRASH_OVERFLOW_ALERT_TYPES])
        .order("timestamp", { ascending: false })
        .limit(1)

    if (error) {
        throw new Error(error.message)
    }

    return ((data ?? [])[0] ?? null) as StopTrashOverflowAlertRow | null
}
