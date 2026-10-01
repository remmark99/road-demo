import type { BusStopsGeoJSON } from './api/bus-stops'
import type { StopActivityResponse } from './api/stop-activity'
import type { StopCameraRow } from './api/stop-current-analytics'
import type { EquipmentState } from './api/equipment'
import { indexEquipmentStatus, monitoredCameraOnline, STOP_CAMERA_INDEX_OFFSET } from './equipment-status'
import { russianCameraName } from './licenses/resources'

export const EQUIPMENT_GROUP_LABELS = {
  'cameras-online': 'Камеры в сети',
  'cameras-offline': 'Камеры не в сети',
  'sensors-online': 'Остановки с датчиками в сети',
  'sensors-offline': 'Остановки с датчиками не в сети',
} as const
export type EquipmentGroup = keyof typeof EQUIPMENT_GROUP_LABELS
export type EquipmentListRow = { id: number; name: string; stopName: string; address: string | null; online: boolean; checkedAt: string | null }
export function equipmentListHref(group: EquipmentGroup): string {
  return `/dashboard/equipment?type=${group.startsWith('cameras-') ? 'camera' : 'sensor'}&status=${group.endsWith('-online') ? 'online' : 'offline'}`
}
export function parseEquipmentGroup(type: string | null, status: string | null): EquipmentGroup | null {
  if (!['camera','sensor'].includes(type || '') || !['online','offline'].includes(status || '')) return null
  return `${type === 'camera' ? 'cameras' : 'sensors'}-${status}` as EquipmentGroup
}
export function buildStopEquipmentLists({ directory, cameras, equipment, activity }: {
  directory: BusStopsGeoJSON | null; cameras: StopCameraRow[] | null;
  equipment: EquipmentState[] | null; activity: StopActivityResponse | null;
}): Record<EquipmentGroup, EquipmentListRow[]> {
  const lists: Record<EquipmentGroup, EquipmentListRow[]> = { 'cameras-online': [], 'cameras-offline': [], 'sensors-online': [], 'sensors-offline': [] }
  const stops = new Map((directory?.features || []).map(stop => [stop.properties.id, stop.properties]))
  const index = indexEquipmentStatus(equipment)
  const checks = new Map((equipment || []).map(device => [`${device.equipment_type}:${device.equipment_id}`,device.updated_at]))
  for (const camera of cameras || []) {
    if (camera.module !== 'stops' || !(camera.bus_stop_id != null ? stops.has(camera.bus_stop_id) : camera.lat != null && camera.lng != null)) continue
    const stop = camera.bus_stop_id == null ? undefined : stops.get(camera.bus_stop_id)
    const online = monitoredCameraOnline(index.cameras, camera.camera_index) ?? camera.status === 'online'
    const cameraIndex = camera.camera_index != null && camera.camera_index >= STOP_CAMERA_INDEX_OFFSET ? camera.camera_index - STOP_CAMERA_INDEX_OFFSET : camera.camera_index
    lists[online ? 'cameras-online' : 'cameras-offline'].push({ id: camera.id,
      name: russianCameraName(camera.name || null, cameraIndex, camera.id),
      stopName: stop?.short_name || stop?.name || 'Остановка не привязана', address: stop?.address || null,
      online, checkedAt: camera.camera_index != null && camera.camera_index >= STOP_CAMERA_INDEX_OFFSET ? checks.get(`camera:${cameraIndex}`) || null : null,
    })
  }
  for (const [key, state] of Object.entries(activity?.stops || {})) {
    if (!state.has_controller) continue
    const id = Number(key), stop = stops.get(id)
    lists[state.sensors_online ? 'sensors-online' : 'sensors-offline'].push({ id,
      name: stop?.short_name || stop?.name || `Остановка №${id}`,
      stopName: stop?.short_name || stop?.name || `Остановка №${id}`, address: stop?.address || null,
      online: state.sensors_online, checkedAt: checks.get(`controller:${id}`) || state.last_ping_at || state.last_sensor_at || null,
    })
  }
  for (const rows of Object.values(lists)) rows.sort((a,b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
  return lists
}
