import { getStopComplexByCameraIndex, getStopComplexByLocationId } from '../stop-analytics-config'
import type { Alert } from '../types'

// Older smoking workers used their detector name as module_name.
// Require the recorded stop AND the camera range to agree; IDs overlap across modules.
export function eventCameraModule(alert: Alert): string {
 if (alert.module_name !== 'smoking_detector' || alert.alert_type !== 'smoking') return alert.module_name
 const location = getStopComplexByLocationId(typeof alert.metadata?.location_id === 'string' ? alert.metadata.location_id : null)
 const index = alert.camera_index == null ? null : alert.camera_index >= 10000 ? alert.camera_index - 10000 : alert.camera_index
 const camera = getStopComplexByCameraIndex(index)
 return location && camera?.locationId === location.locationId ? 'stops' : alert.module_name
}
