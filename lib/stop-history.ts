import type { EquipmentState, EquipmentOutage } from './api/equipment'
import type { BusStopsGeoJSON } from './api/bus-stops'
import type { Camera } from './types'
import { buildCameraTimelines } from './exports/equipment-hours'
import type { MonitoredStatus } from './equipment-status'

export interface StopHistory { now: string; states: EquipmentState[]; outages: EquipmentOutage[] }
export interface StopHistorySnapshot {
    at: string
    cameras: Record<string, MonitoredStatus>
    controllers: Record<string, MonitoredStatus>
}

export function stopHistoryAt(history: StopHistory | null, at: number): StopHistorySnapshot {
    const snapshot: StopHistorySnapshot = { at: new Date(at).toISOString(), cameras: {}, controllers: {} }
    if (!history) return snapshot
    for (const kind of ['camera', 'controller'] as const) {
        const timelines = buildCameraTimelines(
            history.states.filter(s => s.equipment_type === kind).map(s => ({ ...s, equipment_type: 'camera' })),
            history.outages.filter(s => s.equipment_type === kind).map(s => ({ ...s, equipment_type: 'camera' })),
            Date.parse(history.now) + 1,
        )
        for (const timeline of timelines) {
            const includes = ([a, b]: [number, number]) => a <= at && at < b
            const status = timeline.offline.some(includes) ? 'offline' : timeline.online.some(includes) ? 'online' : 'unknown'
            snapshot[kind === 'camera' ? 'cameras' : 'controllers'][timeline.camera] = status
        }
    }
    return snapshot
}

export function historicalCameras(cameras: Camera[], snapshot: StopHistorySnapshot | null): Camera[] {
    if (!snapshot) return cameras
    return cameras.map(camera => {
        if (camera.module !== 'stops' && camera.busStopId == null) return camera
        const id = camera.cameraIndex
        const status = snapshot.cameras[id] ?? (id >= 10000 ? snapshot.cameras[id - 10000] : undefined) ?? 'unknown'
        return { ...camera, status: status === 'online' ? 'online' : 'offline', historyStatus: status }
    })
}

/** Geometry/membership is current; only connectivity is reconstructed from recorded evidence. */
export function historicalStops(data: BusStopsGeoJSON | null, cameras: Camera[], snapshot: StopHistorySnapshot | null): BusStopsGeoJSON | null {
    if (!data || !snapshot) return data
    return { ...data, features: data.features.map(feature => {
        const old = feature.properties.sensor_data
        const bound = cameras.filter(c => c.busStopId === feature.properties.id)
        const controller = snapshot.controllers[feature.properties.id] ?? 'unknown'
        const hasController = old?.has_controller === true || String(feature.properties.id) in snapshot.controllers
        const cameraOnline = bound.some(c => c.historyStatus === 'online')
        const cameraKnown = bound.length === 0 || bound.every(c => c.historyStatus !== 'unknown') || cameraOnline
        const sensorOnline = hasController && controller === 'online'
        const unknown = (!cameraKnown || (hasController && controller === 'unknown')) && !cameraOnline && !sensorOnline
        return { ...feature, properties: { ...feature.properties, sensor_data: {
            activity_status: sensorOnline && cameraOnline ? 'active' : sensorOnline || cameraOnline ? 'partial' : unknown ? 'unknown' : 'inactive',
            sensors_online: sensorOnline, cameras_online: cameraOnline,
            sensors_history_known: !hasController || controller !== 'unknown',
            cameras_history_known: cameraKnown,
            online_camera_count: bound.filter(c => c.historyStatus === 'online').length,
            total_camera_count: bound.length, has_controller: hasController,
            has_equipment: hasController || bound.length > 0,
            is_online: sensorOnline || cameraOnline, is_partly_equipped: sensorOnline !== cameraOnline,
        } } }
    }) }
}
