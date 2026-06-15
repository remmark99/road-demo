export interface StopLoadRange {
    from: Date
    to: Date
}

export interface StopLoadLocationHourRow {
    locationId: string
    hourKey: string
    avgPeople: number
    peakPeople: number
    windows: number
}

export interface StopLoadLocationSummary {
    locationId: string
    label: string
    detail: string
    currentPeople: number
    averagePeople: number
    peakPeople: number
    windows: number
    latestAt: string | null
}

export interface StopLoadAnalyticsData {
    displayedRange: StopLoadRange
    fallbackRange: StopLoadRange | null
    locationHours: StopLoadLocationHourRow[]
    locations: StopLoadLocationSummary[]
    truncated: boolean
    limit: number
    sourceRows: number
    totalRows: number | null
}

interface StopLoadAnalyticsResponse {
    displayedRange: {
        from: string
        to: string
    }
    fallbackRange: {
        from: string
        to: string
    } | null
    locationHours: StopLoadLocationHourRow[]
    locations: StopLoadLocationSummary[]
    truncated: boolean
    limit: number
    sourceRows: number
    totalRows: number | null
}

function toDateRange(range: StopLoadAnalyticsResponse["displayedRange"]): StopLoadRange {
    return {
        from: new Date(range.from),
        to: new Date(range.to),
    }
}

export async function fetchStopLoadAnalytics(range: StopLoadRange): Promise<StopLoadAnalyticsData> {
    const params = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
    })
    const response = await fetch(`/api/stop-load-analytics?${params.toString()}`)

    if (!response.ok) {
        throw new Error(`Failed to fetch stop load analytics: ${response.status}`)
    }

    const data = await response.json() as StopLoadAnalyticsResponse

    return {
        ...data,
        displayedRange: toDateRange(data.displayedRange),
        fallbackRange: data.fallbackRange ? toDateRange(data.fallbackRange) : null,
    }
}
