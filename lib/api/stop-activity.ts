import {
    indexEquipmentStatus,
    monitoredCameraOnline,
    monitoredOnline,
    type EquipmentStatusRow,
} from '../equipment-status'

/**
 * Activity status of a bus stop, derived strictly from real data:
 *
 *   sensors  — the controller behind the stop is polled by the external
 *              `bus_stop_analytics` worker, which upserts `stop_sensor_states`
 *              and stamps `bus_stops.controller_status` / `last_ping_at`.
 *   cameras  — rows in `cameras` linked to the stop via `bus_stop_id`.
 *
 * Online / offline of both comes from `equipment_state` (equipment-monitor) —
 * the same verdict the «Оборудование» tab shows. The legacy signals above are
 * only used for devices the monitor does not track.
 *
 *   active   — sensors AND at least one camera are working
 *   partial  — exactly one of the two is working
 *   inactive — neither is working
 */

export type StopActivityStatus = 'active' | 'partial' | 'inactive' | 'unknown'

/** How long a controller ping / sensor reading stays "fresh". */
export const STOP_ACTIVITY_FRESHNESS_MS = 15 * 60 * 1000

export interface StopActivityEntry {
    /** Controller readings are present and fresh. */
    sensors_online: boolean
    /** At least one camera bound to the stop reports `online`. */
    cameras_online: boolean
    online_camera_count: number
    total_camera_count: number
    /** Stop has a controller (sensors) attached at all. */
    has_controller: boolean
    /** Stop has a controller and/or cameras attached at all. */
    has_equipment: boolean
    activity_status: StopActivityStatus
    last_ping_at: string | null
    last_sensor_at: string | null
    /**
     * Что-то на остановке отклонилось от нормы.
     *
     * Один флаг вместо прежних «вандализм» и «отказ обогревателя». Датчик
     * фиксирует только само отклонение, но не причину: мокрый пакет, брошенный
     * в стекло, срабатывает так же, как удар. Поэтому событие не называет
     * причину — оператор смотрит снимок и решает сам.
     *
     * Обогревателя на остановках нет и не планируется, так что прежний
     * оранжевый статус был выведен из того же дискретного входа 1, что и
     * «вандализм», — то есть из одного и того же срабатывания.
     */
    incident: boolean
}

export interface StopActivityResponse {
    freshnessMs: number
    stops: Record<string, StopActivityEntry>
}

export function resolveActivityStatus(
    sensorsOnline: boolean,
    camerasOnline: boolean,
): StopActivityStatus {
    if (sensorsOnline && camerasOnline) return 'active'
    if (sensorsOnline || camerasOnline) return 'partial'
    return 'inactive'
}

export function isFresh(
    timestamp: string | null | undefined,
    freshnessMs = STOP_ACTIVITY_FRESHNESS_MS,
    now = Date.now(),
) {
    if (!timestamp) return false
    const parsed = Date.parse(timestamp)
    if (Number.isNaN(parsed)) return false
    return now - parsed <= freshnessMs
}

/** Любое состояние тревоги, кроме «норма», считается отклонением. */
export function isDeviation(alarm: string | null | undefined): boolean {
    return Boolean(alarm) && alarm !== 'normal'
}

export const ACTIVITY_STATUS_LABELS: Record<StopActivityStatus, string> = {
    unknown: 'Нет истории',
    active: 'Активна',
    partial: 'Частично активна',
    inactive: 'Неактивна',
}

export const ACTIVITY_STATUS_COLORS: Record<StopActivityStatus, string> = {
    unknown: '#a78bfa',
    active: '#22c55e',
    partial: '#eab308',
    inactive: '#9ca3af',
}

/** Colour used for stops with no controller and no cameras at all. */
export const NO_EQUIPMENT_COLOR = '#3b82f6'

export function describeActivity(entry: Pick<StopActivityEntry, 'sensors_online' | 'cameras_online' | 'online_camera_count'>) {
    const parts: string[] = []
    parts.push(entry.sensors_online ? 'датчики в сети' : 'датчики не в сети')
    parts.push(
        entry.cameras_online
            ? `камеры в сети (${entry.online_camera_count})`
            : 'камеры не в сети',
    )
    return parts.join(', ')
}

export interface BusStopStatusRow {
    id: number
    controller_status?: string | null
    last_ping_at?: string | null
    ip_address?: string | null
    /** Контроллер смонтирован; собственный адрес может быть ещё не выдан. */
    has_controller?: boolean | null
}

export interface SensorStateRow {
    bus_stop_id: number
    element: number | null
    category: string | null
    alarm: string | null
    updated_at: string | null
}

export interface CameraStatusRow {
    camera_index?: number | null
    bus_stop_id: number | null
    status: string | null
}

export interface BuildStopActivityInput {
    busStops: BusStopStatusRow[]
    sensorRows: SensorStateRow[]
    cameraRows: CameraStatusRow[]
    /** Rows of `equipment_state`; empty when the monitor is not deployed. */
    equipmentRows?: EquipmentStatusRow[]
    windowMs?: number
    now?: number
}

/**
 * Fold controller status, sensor readings and camera status into one activity
 * entry per stop. Pure — the route supplies the rows.
 */
export function buildStopActivity({
    busStops,
    sensorRows,
    cameraRows,
    equipmentRows,
    windowMs = STOP_ACTIVITY_FRESHNESS_MS,
    now = Date.now(),
}: BuildStopActivityInput): Record<string, StopActivityEntry> {
    const monitored = indexEquipmentStatus(equipmentRows)
    const latestSensorAt = new Map<number, string>()
    const incidents = new Set<number>()

    for (const row of sensorRows) {
        const stopId = row.bus_stop_id
        if (stopId === null || stopId === undefined) continue

        const previous = latestSensorAt.get(stopId)
        if (row.updated_at && (!previous || row.updated_at > previous)) {
            latestSensorAt.set(stopId, row.updated_at)
        }

        // Mirrors the alarm derivation in components/map/bus-stop-modal.tsx.
        // Любое ненормальное состояние дискретного входа — инцидент: и
        // warning, и alarm, и critical. Степень уверенности датчика не даёт
        // повода раскладывать срабатывание на разные типы событий.
        const isDigital = row.element === 1 || row.category === 'glass_break'
        if (isDigital && isDeviation(row.alarm)) incidents.add(stopId)
    }

    const onlineCameras = new Map<number, number>()
    const totalCameras = new Map<number, number>()

    for (const row of cameraRows) {
        const stopId = row.bus_stop_id
        if (stopId === null || stopId === undefined) continue
        totalCameras.set(stopId, (totalCameras.get(stopId) ?? 0) + 1)
        const cameraOnline = monitoredCameraOnline(monitored.cameras, row.camera_index) ?? row.status === 'online'
        if (cameraOnline) {
            onlineCameras.set(stopId, (onlineCameras.get(stopId) ?? 0) + 1)
        }
    }

    const stops: Record<string, StopActivityEntry> = {}

    for (const stop of busStops) {
        const lastPingAt = stop.last_ping_at ?? null
        const lastSensorAt = latestSensorAt.get(stop.id) ?? null

        const controllerOnline = stop.controller_status === 'online' && isFresh(lastPingAt, windowMs, now)
        const sensorsOnline = monitoredOnline(monitored.controllers, stop.id)
            ?? (controllerOnline || isFresh(lastSensorAt, windowMs, now))

        const onlineCameraCount = onlineCameras.get(stop.id) ?? 0
        const totalCameraCount = totalCameras.get(stop.id) ?? 0
        const camerasOnline = onlineCameraCount > 0

        // Контроллер есть, если он числится смонтированным, отвечает или
        // опрашивается. На один ip_address опираться нельзя: у группы остановок
        // адрес пока общий и поэтому не записан (sql/stop_equipment_flag_migration.sql),
        // а на controller_status — тем более: в схеме у него DEFAULT 'offline',
        // поэтому он непустой у всех строк, включая остановки без контроллера.
        const hasController = stop.has_controller === true
            || Boolean(stop.ip_address?.trim())
            || lastSensorAt !== null
            || monitored.controllers.has(stop.id)

        stops[String(stop.id)] = {
            sensors_online: sensorsOnline,
            cameras_online: camerasOnline,
            online_camera_count: onlineCameraCount,
            total_camera_count: totalCameraCount,
            has_controller: hasController,
            has_equipment: hasController || totalCameraCount > 0,
            activity_status: resolveActivityStatus(sensorsOnline, camerasOnline),
            last_ping_at: lastPingAt,
            last_sensor_at: lastSensorAt,
            incident: incidents.has(stop.id),
        }
    }

    return stops
}

export async function fetchStopActivity(): Promise<StopActivityResponse> {
    try {
        const res = await fetch('/api/stop-activity', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to fetch stop activity: ${res.status}`)
        return await res.json() as StopActivityResponse
    } catch (error) {
        console.error('Error fetching stop activity:', error)
        return { freshnessMs: STOP_ACTIVITY_FRESHNESS_MS, stops: {} }
    }
}
