import { supabase } from '../supabase'
import { ALERT_CATEGORIES } from './alerts'

export interface BusStopHeatmapEntry {
    busStopId: number
    alertCount: number
    byType: Record<string, number>
    maxSeverity: number
}

export interface BusStopHeatmapResult {
    entries: BusStopHeatmapEntry[]
    maxAlertCount: number
    totalAlerts: number
}

/**
 * Fetch alert counts aggregated by bus stop.
 *
 * 1. Get all cameras that have a bus_stop_id
 * 2. Count alerts from those cameras within the given time window
 * 3. Aggregate by bus_stop_id
 */
export async function fetchBusStopHeatmapData(
    hoursBack: number = 24,
    alertTypes?: string[]
): Promise<BusStopHeatmapResult> {
    // 1. Get camera -> busStopId mapping
    const { data: cameraRows, error: camError } = await supabase
        .from('cameras')
        .select('camera_index, bus_stop_id')
        .not('bus_stop_id', 'is', null)

    if (camError || !cameraRows || cameraRows.length === 0) {
        console.error('Error fetching cameras for heatmap:', camError)
        return { entries: [], maxAlertCount: 0, totalAlerts: 0 }
    }

    // Build lookup: cameraIndex -> busStopId
    const cameraToBusStop = new Map<number, number>()
    const busStopCameraIndexes: number[] = []
    for (const row of cameraRows) {
        cameraToBusStop.set(row.camera_index, row.bus_stop_id)
        busStopCameraIndexes.push(row.camera_index)
    }

    // 2. Get alert types for bus stop monitoring
    const busStopAlertTypes = (alertTypes && alertTypes.length > 0) 
        ? alertTypes 
        : ALERT_CATEGORIES.bus_stop_monitoring.types

    // 3. Fetch alerts from those cameras within the time window
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

    const { data: alerts, error: alertError } = await supabase
        .from('alerts')
        .select('camera_index, alert_type, severity')
        .in('camera_index', busStopCameraIndexes)
        .in('alert_type', busStopAlertTypes)
        .gte('timestamp', since)

    if (alertError) {
        console.error('Error fetching alerts for heatmap:', alertError)
        return { entries: [], maxAlertCount: 0, totalAlerts: 0 }
    }

    // 4. Aggregate by bus_stop_id
    const aggregation = new Map<number, { count: number; byType: Record<string, number>; maxSeverity: number }>()

    // Initialize all bus stops (even those with 0 alerts)
    const uniqueBusStopIds = new Set(cameraToBusStop.values())
    for (const id of uniqueBusStopIds) {
        aggregation.set(id, { count: 0, byType: {}, maxSeverity: 0 })
    }

    for (const alert of (alerts || [])) {
        const busStopId = cameraToBusStop.get(alert.camera_index)
        if (busStopId === undefined) continue

        const entry = aggregation.get(busStopId)!
        entry.count += 1
        entry.byType[alert.alert_type] = (entry.byType[alert.alert_type] || 0) + 1
        if (alert.severity != null && alert.severity > entry.maxSeverity) {
            entry.maxSeverity = alert.severity
        }
    }

    // 5. Build result
    const entries: BusStopHeatmapEntry[] = []
    let maxAlertCount = 0
    let totalAlerts = 0

    for (const [busStopId, data] of aggregation) {
        entries.push({
            busStopId,
            alertCount: data.count,
            byType: data.byType,
            maxSeverity: data.maxSeverity,
        })
        if (data.count > maxAlertCount) maxAlertCount = data.count
        totalAlerts += data.count
    }

    return { entries, maxAlertCount, totalAlerts }
}

export interface BusStopOccupancyHeatmapEntry {
    busStopId: number
    averagePeople: number
    peakPeople: number
    sampleCount: number
}

export interface BusStopOccupancyHeatmapResult {
    entries: BusStopOccupancyHeatmapEntry[]
    maxAveragePeople: number
    totalPeople: number
}

/**
 * Fetch passenger load (busyness windows) aggregated by bus stop.
 *
 * 1. Fetch busyness windows within the given time window (with fallback to latest window if none).
 * 2. Aggregate average and peak people by bus_stop_id (derived from location_id).
 */
export async function fetchBusStopOccupancyHeatmapData(
    hoursBack: number = 24
): Promise<BusStopOccupancyHeatmapResult> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()
    let queryDate = since

    const { data: initialCheck, error: checkError } = await supabase
        .from('busyness_windows')
        .select('window_start')
        .gte('window_start', since)
        .limit(1)

    if (checkError) {
        console.error('Error checking busyness windows:', checkError)
    }

    if (!initialCheck || initialCheck.length === 0) {
        // Fallback to latest available window_start day
        const { data: latestWindow, error: latestError } = await supabase
            .from('busyness_windows')
            .select('window_start')
            .order('window_start', { ascending: false })
            .limit(1)

        if (!latestError && latestWindow && latestWindow.length > 0) {
            const latestDate = new Date(latestWindow[0].window_start)
            // Go back hoursBack from the latest date
            const fallbackSince = new Date(latestDate.getTime() - hoursBack * 60 * 60 * 1000).toISOString()
            queryDate = fallbackSince
        }
    }

    const { data: rows, error } = await supabase
        .from('busyness_windows')
        .select('location_id, person_count_avg, person_count_max, sample_count')
        .gte('window_start', queryDate)

    if (error) {
        console.error('Error fetching busyness windows for heatmap:', error)
        return { entries: [], maxAveragePeople: 0, totalPeople: 0 }
    }

    // Aggregate by busStopId
    const aggregation = new Map<number, { sum: number; count: number; maxPeak: number }>()

    for (const row of (rows || [])) {
        const [rawId] = row.location_id.split("-")
        const busStopId = Number(rawId)
        if (!Number.isInteger(busStopId)) continue

        const entry = aggregation.get(busStopId) ?? { sum: 0, count: 0, maxPeak: 0 }
        
        const avg = row.person_count_avg ?? 0
        const maxVal = row.person_count_max ?? 0
        
        entry.sum += avg
        entry.count += 1
        if (maxVal > entry.maxPeak) {
            entry.maxPeak = maxVal
        }
        aggregation.set(busStopId, entry)
    }

    const entries: BusStopOccupancyHeatmapEntry[] = []
    let maxAveragePeople = 0
    let totalPeople = 0

    for (const [busStopId, data] of aggregation) {
        const avgPeople = data.count > 0 ? data.sum / data.count : 0
        entries.push({
            busStopId,
            averagePeople: avgPeople,
            peakPeople: data.maxPeak,
            sampleCount: data.count
        })
        if (avgPeople > maxAveragePeople) {
            maxAveragePeople = avgPeople
        }
        totalPeople += avgPeople
    }

    return { entries, maxAveragePeople, totalPeople }
}
