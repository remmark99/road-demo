import type { StopLoadLocationHourRow, StopLoadLocationSummary } from '../api/stop-load-analytics'
interface HeatmapRow {
    locationId: string
    label: string
    detail: string
    cells: Array<{
        hourKey: string
        hourLabel: string
        hourTitle: string
        value: number | null
    }>
}

interface HeatmapHourColumn {
    hourKey: string
    hourLabel: string
    hourTitle: string
}

export const HEATMAP_HOUR_COLUMNS: HeatmapHourColumn[] = Array.from({ length: 24 }, (_, index) => {
    const hour = String(index).padStart(2, "0")

    return {
        hourKey: hour,
        hourLabel: hour,
        hourTitle: `${hour}:00-${hour}:59`,
    }
})

export function buildHeatmapRows(
    locationHours: StopLoadLocationHourRow[],
    hours: HeatmapHourColumn[],
    locations: StopLoadLocationSummary[],
): HeatmapRow[] {
    const hourSet = new Set(hours.map((hour) => hour.hourKey))
    const cellMap = new Map<string, Map<string, { sum: number; count: number }>>()

    for (const row of locationHours) {
        const weight = row.sampleCount ?? row.windows
        if (!Number.isFinite(row.avgPeople) || !Number.isFinite(weight) || weight <= 0) continue
        const hourOfDay = new Date(Date.parse(row.hourKey) + 5 * 3600_000).getUTCHours()
        const hour = HEATMAP_HOUR_COLUMNS[hourOfDay]
        if (!hour) continue

        const hourKey = hour.hourKey
        if (!hourSet.has(hourKey)) continue

        const locationCells = cellMap.get(row.locationId) ?? new Map<string, { sum: number; count: number }>()
        const cell = locationCells.get(hourKey) ?? { sum: 0, count: 0 }
        cell.sum += row.avgPeople * weight
        cell.count += weight
        locationCells.set(hourKey, cell)
        cellMap.set(row.locationId, locationCells)
    }

    return locations.map((location) => {
        const locationCells = cellMap.get(location.locationId)

        return {
            locationId: location.locationId,
            label: location.label,
            detail: location.detail,
            cells: hours.map((hour) => {
                const cell = locationCells?.get(hour.hourKey)
                return {
                    hourKey: hour.hourKey,
                    hourLabel: hour.hourLabel,
                    hourTitle: hour.hourTitle,
                    value: cell && cell.count > 0 ? Number((cell.sum / cell.count).toFixed(1)) : null,
                }
            }),
        }
    })
}
