export const SENSOR_HISTORY_PERIODS = [1, 6, 24, 168] as const

export type SensorHistoryHours = (typeof SENSOR_HISTORY_PERIODS)[number]

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

export interface StopSensorHistoryResponse {
    range: { from: string; to: string }
    bucketMinutes: number
    totalRows: number
    sourceRows: number
    truncated: boolean
    lastRecordedAt: string | null
    stops: SensorHistoryStop[]
    sensors: StopSensorOption[]
    series: StopSensorSeriesPoint[]
    recent: StopSensorHistoryRow[]
}

interface FetchSensorHistoryOptions {
    hours: SensorHistoryHours
    busStopId?: number
    category?: string
}

export async function fetchStopSensorHistory({
    hours,
    busStopId,
    category,
}: FetchSensorHistoryOptions): Promise<StopSensorHistoryResponse> {
    const params = new URLSearchParams({ hours: String(hours) })

    if (busStopId !== undefined) params.set("busStopId", String(busStopId))
    if (category) params.set("category", category)

    const response = await fetch(`/api/stop-sensor-history?${params.toString()}`, {
        cache: "no-store",
    })

    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || `Не удалось загрузить историю датчиков (${response.status})`)
    }

    return response.json() as Promise<StopSensorHistoryResponse>
}
