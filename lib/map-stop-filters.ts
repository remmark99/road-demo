"use client"

import { useMapPreference } from "@/lib/hooks/use-map-preference"

/**
 * Статусные фильтры остановок. Карта их применяет, боковая панель переключает —
 * общее состояние живёт в useMapPreference, поэтому пробрасывать пропсы не нужно.
 */
export type BusStopStatusKey = "online" | "offline" | "incidents" | "unknown" | "unequipped"

export type BusStopStatusFilters = Record<BusStopStatusKey, boolean>

export const BUS_STOP_STATUS_ORDER: readonly BusStopStatusKey[] = [
  "online",
  "offline",
  "incidents",
  "unknown",
  "unequipped",
]

export const BUS_STOP_STATUS_LABELS: Record<BusStopStatusKey, string> = {
  online: "В сети",
  offline: "Не в сети",
  incidents: "Инциденты",
  unknown: "Нет истории",
  unequipped: "Без оборудования",
}

const DEFAULT_FILTERS: BusStopStatusFilters = {
  online: true,
  offline: false,
  incidents: true,
  unknown: true,
  unequipped: true,
}

interface StopSensorData {
  activity_status?: string | null
  has_equipment?: boolean | null
  incident?: boolean | null
}

/**
 * Корзина, в которую попадает остановка. Корзины покрывают все остановки без
 * пересечений, поэтому сумма счётчиков в панели равна их общему числу, а
 * «только» по одной строке оставляет на карте ровно её.
 */
export function busStopStatusKey(sensorData: StopSensorData | null | undefined): BusStopStatusKey {
  if (!sensorData || !sensorData.has_equipment) return "unequipped"
  if (sensorData.activity_status === "unknown") return "unknown"
  if (sensorData.incident) return "incidents"
  if (sensorData.activity_status === "active" || sensorData.activity_status === "partial") return "online"
  return "offline"
}

export function useBusStopStatusFilters() {
  return useMapPreference<BusStopStatusFilters>("busStopFilters", DEFAULT_FILTERS)
}
