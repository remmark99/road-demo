export interface StopSensorHistoryRow {
    id: number
    busStopId: number
    element: number
    address: number
    category: string
    name: string
    value: number | null
    alarm: string
    recordedAt: string
}

export interface StopSensorSeriesPoint {
    bucket: string
    busStopId: number
    element: number
    address: number
    category: string
    name: string
    average: number | null
    minimum: number | null
    maximum: number | null
    alarm: string
    samples: number
}

export interface StopSensorOption {
    key: string
    busStopId: number
    element: number
    address: number
    category: string
    name: string
}

export interface SensorHistoryStop {
    id: number
    label: string
    detail: string | null
}

export interface GlassEvent {
    id: string
    busStopId: number | null
    busStopLabel: string
    message: string
    alarm: string
    recordedAt: string
}

/** Датчик стекла, который поллер вывел из тревог до проверки на месте. */
export interface GlassSensorIssue {
    busStopId: number
    busStopLabel: string
    /** noisy — срабатывает слишком часто, stuck — вход замкнут дольше получаса. */
    status: "noisy" | "stuck"
    /** Импульсов за последние сутки. */
    pulses24h: number | null
    updatedAt: string | null
}

export interface StopSensorHistoryResponse {
    range: { from: string; to: string }
    generatedAt: string
    bucketMinutes: number
    totalRows: number
    sourceRows: number
    truncated: boolean
    lastRecordedAt: string | null
    stops: SensorHistoryStop[]
    sensors: StopSensorOption[]
    series: StopSensorSeriesPoint[]
    recent: StopSensorHistoryRow[]
    events: GlassEvent[]
    /** В периоде больше срабатываний, чем вернулось в events. */
    eventsTruncated: boolean
    glassIssues?: GlassSensorIssue[]
}

interface FetchSensorHistoryOptions {
    /** Календарные дни по Сургуту, YYYY-MM-DD, включительно. */
    from: string
    to: string
    /** Без значения — все остановки. */
    busStopIds?: number[]
}

export async function fetchStopSensorHistory({
    from,
    to,
    busStopIds,
}: FetchSensorHistoryOptions): Promise<StopSensorHistoryResponse> {
    const params = new URLSearchParams({ from, to })

    if (busStopIds) params.set("busStopIds", busStopIds.join(","))

    const response = await fetch(`/api/stop-sensor-history?${params.toString()}`, {
        cache: "no-store",
    })

    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || `Не удалось загрузить историю датчиков (${response.status})`)
    }

    return response.json() as Promise<StopSensorHistoryResponse>
}
