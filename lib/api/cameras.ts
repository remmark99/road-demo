import { supabase } from '../supabase'
import type { Camera } from '../types'

interface CameraRow {
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
    }
}

export async function fetchCameras(): Promise<Camera[]> {
    const { data, error } = await supabase
        .from('cameras')
        .select('*')
        .order('camera_index')

    if (error) {
        console.error('Error fetching cameras:', error)
        return []
    }

    return (data as CameraRow[]).map(mapCameraRow)
}

export async function fetchOnlineCameras(): Promise<Camera[]> {
    const { data, error } = await supabase
        .from('cameras')
        .select('*')
        .eq('status', 'online')
        .order('camera_index')

    if (error) {
        console.error('Error fetching online cameras:', error)
        return []
    }

    return (data as CameraRow[]).map(mapCameraRow)
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
