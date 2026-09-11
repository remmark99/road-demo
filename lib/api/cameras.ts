import { supabase } from '../supabase'
import type { Camera } from '../types'
import { indexEquipmentStatus, monitoredOnline, type EquipmentStatusRow } from '../equipment-status'

export interface CameraRow {
    id: number
    camera_index: number
    name: string
    description: string
    lat: number
    lng: number
    status: 'online' | 'offline'
    fov_angle: number
    fov_direction: number
    fov_distance: number
    rtsp_url: string | null
    hls_url: string | null
    module?: string
    bus_stop_id?: number | null
}

function mapCameraRow(row: CameraRow): Camera {
    return {
        id: `cam-${row.camera_index}`,
        cameraIndex: row.camera_index,
        name: row.name,
        description: row.description,
        lat: row.lat,
        lng: row.lng,
        status: row.status,
        fovAngle: row.fov_angle,
        fovDirection: row.fov_direction,
        fovDistance: row.fov_distance,
        rtspUrl: row.rtsp_url,
        hlsUrl: row.hls_url,
        module: row.module,
        busStopId: row.bus_stop_id,
    }
}

/**
 * Статус камер от equipment-monitor — тот же, что на вкладке «Оборудование».
 * Пусто, если миграции нет или у пользователя нет модуля остановок (RLS).
 */
async function fetchMonitoredCameraStatus() {
    const { data, error } = await supabase
        .from('equipment_state')
        .select('equipment_type,equipment_id,status')
        .eq('equipment_type', 'camera')

    if (error) {
        console.warn('equipment_state недоступна, статус камер берётся из cameras.status:', error.message)
        return indexEquipmentStatus([]).cameras
    }
    return indexEquipmentStatus(data as EquipmentStatusRow[]).cameras
}

/** cameras.status остаётся только для камер, которые монитор не ведёт. */
function withMonitoredStatus(rows: CameraRow[], statuses: Map<number, EquipmentStatusRow['status']>): CameraRow[] {
    return rows.map(row => {
        const online = monitoredOnline(statuses, row.camera_index)
        return online === null ? row : { ...row, status: online ? 'online' : 'offline' }
    })
}

function shouldHideAllCameras(allowedModules?: string[]) {
    return Array.isArray(allowedModules) && allowedModules.length === 0
}

export async function fetchCameraRows(allowedModules?: string[]): Promise<CameraRow[]> {
    if (shouldHideAllCameras(allowedModules)) {
        return []
    }

    let query = supabase.from('cameras').select('*').order('camera_index')

    if (allowedModules && allowedModules.length > 0) {
        query = query.in('module', allowedModules)
    }

    const { data, error } = await query

    if (error) {
        if (error.code === '42703' || error.message?.includes('module')) {
            console.warn("Колонка 'module' не найдена. Делаю fallback на все камеры.");
            const fallbackQuery = await supabase.from('cameras').select('*').order('camera_index')
            if (!fallbackQuery.error) return fallbackQuery.data as CameraRow[]
        }
        console.error('Error fetching camera rows:', error)
        return []
    }

    return data as CameraRow[]
}

/**
 * Камеры со статусом «в сети / не в сети» от equipment-monitor. Для админки,
 * где cameras.status редактируется как есть, — fetchCameraRows.
 */
export async function fetchCameras(allowedModules?: string[]): Promise<Camera[]> {
    if (shouldHideAllCameras(allowedModules)) {
        return []
    }

    const [rows, statuses] = await Promise.all([
        fetchCameraRows(allowedModules),
        fetchMonitoredCameraStatus(),
    ])

    return withMonitoredStatus(rows, statuses).map(mapCameraRow)
}

export async function fetchOnlineCameras(allowedModules?: string[]): Promise<Camera[]> {
    const cameras = await fetchCameras(allowedModules)
    return cameras.filter(camera => camera.status === 'online')
}

export async function updateCameraFov(
    cameraIndex: number,
    fovAngle: number,
    fovDirection: number,
    fovDistance: number
): Promise<boolean> {
    const { error } = await supabase
        .from('cameras')
        .update({
            fov_angle: fovAngle,
            fov_direction: fovDirection,
            fov_distance: fovDistance,
            updated_at: new Date().toISOString(),
        })
        .eq('camera_index', cameraIndex)

    if (error) {
        console.error('Error updating camera FOV:', error)
        return false
    }

    return true
}

export async function updateCamera(
    cameraIndex: number,
    updates: Partial<Omit<CameraRow, 'id' | 'created_at'>>
): Promise<boolean> {
    const { error } = await supabase
        .from('cameras')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('camera_index', cameraIndex)

    if (error) {
        console.error('Error updating camera:', error)
        return false
    }

    return true
}
