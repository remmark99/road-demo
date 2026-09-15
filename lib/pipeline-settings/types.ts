// Runtime settings of the bus-stop analytics backend (bus_stop_analytics,
// src/shared/runtime_settings.py). The backend publishes the catalog; the admin
// panel only writes overrides and reads back what each process applied.

export type SettingValue = number | boolean | string

// The subset of JSON Schema pydantic emits for the catalog's field types.
export interface SettingSchema {
  type: "number" | "integer" | "boolean" | "string"
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minLength?: number
  maxLength?: number
}

export interface PipelineSettingGroup {
  id: string
  title: string
  description: string
}

export interface PipelineSettingField {
  key: string
  group: string
  label: string
  description: string
  unit: string
  // docker-compose service names whose behaviour the field changes
  services: string[]
  advanced: boolean
  schema: SettingSchema
  // The backend's .env value — what a reset returns to.
  default: SettingValue
}

export interface PipelineSettingsCatalog {
  version: number
  // How often backend processes re-read overrides, in seconds.
  refresh_sec?: number
  groups: PipelineSettingGroup[]
  fields: PipelineSettingField[]
}

export interface PipelineSettingOverride {
  value: SettingValue
  updatedAt: string
  updatedByEmail: string | null
}

export interface PipelineSettingsAgent {
  instanceId: string
  service: string
  hostname: string
  startedAt: string
  syncedAt: string
  online: boolean
  applied: Record<string, unknown>
  rejected: Record<string, string>
}

export interface PipelineSettingsResponse {
  catalog: PipelineSettingsCatalog | null
  publishedAt: string | null
  overrides: Record<string, PipelineSettingOverride>
  agents: PipelineSettingsAgent[]
  refreshSeconds: number
}

// key → new value, or null to drop the override and use the .env value.
export type PipelineSettingsChanges = Record<string, SettingValue | null>
