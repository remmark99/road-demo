export type NotificationChannel = "email" | "max"

export type NotificationSource = "alerts" | "controller_alerts"

export interface NotificationEventPayload {
  source: NotificationSource
  event_id: string
  event_key: string
  module_name: string
  event_type: string
  message: string
  severity: string
  timestamp: string
  clip_path?: string | null
}

export interface NotificationDelivery {
  id: string
  user_id: string
  channel: NotificationChannel
  recipient: string
  payload: NotificationEventPayload
  attempts: number
  lease_token: string
}

export interface NotificationPreferencesResponse {
  email: string
  emailEnabled: boolean
  maxEnabled: boolean
  maxDisplayName: string | null
  maxStatus: "disconnected" | "pending" | "connected"
  maxPendingUntil: string | null
  availableEventTypes: import("@/lib/notifications/catalog").NotificationEventTypeOption[]
  emailEventTypes: string[] | null
  maxEventTypes: string[] | null
}
