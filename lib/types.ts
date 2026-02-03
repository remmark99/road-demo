export type RoadStatus = "clean" | "dirty" | "warning" | "unknown"

export interface Camera {
  id: string
  cameraIndex: number
  name: string
  description: string
  lat: number
  lng: number
  rtspUrl: string | null
  hlsUrl: string | null
  status: "online" | "offline"
  fovAngle: number      // degrees (e.g., 60)
  fovDirection: number  // degrees 0-360 (0 = North)
  fovDistance: number   // meters
}

export interface RoadSegment {
  id: string
  name: string
  startCameraId?: string | null
  endCameraId?: string | null
  coordinates: [number, number][]
  currentStatus: RoadStatus
}

export interface RoadStatusHistory {
  timestamp: Date
  status: RoadStatus
  segmentId: string
}

export interface Notification {
  id: string
  timestamp: Date
  type: "status_change" | "maintenance" | "alert"
  title: string
  description: string
  segmentId: string
  previousStatus?: RoadStatus
  newStatus?: RoadStatus
  videoClipUrl?: string
}

export interface DashboardStats {
  totalSegments: number
  cleanSegments: number
  dirtySegments: number
  avgCleanTime: number
  lastUpdated: Date
}

export interface Alert {
  id: string
  module_name: string
  alert_type: string
  severity: number
  message: string
  metadata: Record<string, unknown> | null
  timestamp: string
  video_timestamp: number
  source_video: string
  clip_path: string | null
  created_at: string | null
  camera_index: number | null
}
