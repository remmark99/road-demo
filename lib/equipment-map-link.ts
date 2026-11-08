import type { EquipmentType } from "@/lib/api/equipment"

interface MapLinkDevice {
    equipment_type: EquipmentType
    equipment_id: number
    bus_stop_id: number | null
    location_id: string | null
}

interface MapLinkStop {
    id: number
    short_name: string | null
}

/**
 * Ссылка на карту с открытой карточкой остановки. У устройства без известной
 * остановки ссылки нет: открывать на карте нечего.
 */
export function equipmentMapHref(
    item: MapLinkDevice,
    state: { bus_stop_id: number | null; location_id: string | null } | undefined,
    stops: MapLinkStop[],
) {
    const locationId = item.location_id ?? state?.location_id
    const stopId = item.bus_stop_id
        ?? state?.bus_stop_id
        ?? (item.equipment_type === "controller" ? item.equipment_id : null)
        ?? (locationId ? stops.find(stop => stop.short_name === locationId)?.id : undefined)
    if (stopId === null || stopId === undefined) return null

    return item.equipment_type === "camera"
        ? `/?stop=${stopId}&tab=cameras&camera=${item.equipment_id}`
        : `/?stop=${stopId}&tab=sensors`
}

export interface StopMapLink {
    stopId: number
    tab: "cameras" | "sensors"
    cameraIndex?: number
}

function positiveInteger(value: string | null) {
    const parsed = Number(value)
    return value && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function parseStopMapLink(params: { get(name: string): string | null }): StopMapLink | null {
    const stopId = positiveInteger(params.get("stop"))
    if (stopId === undefined) return null
    return {
        stopId,
        tab: params.get("tab") === "sensors" ? "sensors" : "cameras",
        cameraIndex: positiveInteger(params.get("camera")),
    }
}
