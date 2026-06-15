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
