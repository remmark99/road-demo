import {
    resolveActivityStatus,
    type StopActivityEntry,
    type StopActivityStatus,
    fetchStopActivity,
} from './stop-activity'

export interface BusStopSensorData {
    /** active = датчики и камеры, partial = что-то одно, inactive = ничего. */
    activity_status: StopActivityStatus
    sensors_online: boolean
    cameras_online: boolean
    online_camera_count: number
    total_camera_count: number
    /** У остановки есть контроллер (датчики). */
    has_controller: boolean
    /** Остановка вообще оснащена (есть контроллер и/или камеры). */
    has_equipment: boolean
    /** Совместимость: активна хотя бы частично. */
    is_online: boolean
    /** Совместимость: работает ровно один из двух источников. */
    is_partly_equipped: boolean
    last_ping_at?: string | null
    last_sensor_at?: string | null
    temperature_in?: number
    temperature_out?: number
    humidity?: number
    heater_working?: boolean
    glass_broken?: boolean
}

export interface BusStopProperties {
    id: number
    name: string | null
    short_name: string | null
    description: string | null
    address: string | null
    sensor_data?: BusStopSensorData
}

export interface BusStopsGeoJSON {
    type: 'FeatureCollection'
    features: {
        type: 'Feature'
        properties: BusStopProperties
        geometry: {
            type: 'Point'
            coordinates: [number, number]
        }
    }[]
}

const OFFLINE_SENSOR_DATA: BusStopSensorData = {
    activity_status: 'inactive',
    sensors_online: false,
    cameras_online: false,
    online_camera_count: 0,
    total_camera_count: 0,
    has_controller: false,
    has_equipment: false,
    is_online: false,
    is_partly_equipped: false,
    last_ping_at: null,
    last_sensor_at: null,
}

let cachedGeoJSON: BusStopsGeoJSON | null = null

export function toSensorData(entry: StopActivityEntry | undefined): BusStopSensorData {
    if (!entry) return { ...OFFLINE_SENSOR_DATA }

    const status = entry.activity_status
        ?? resolveActivityStatus(entry.sensors_online, entry.cameras_online)

    return {
        activity_status: status,
        sensors_online: entry.sensors_online,
        cameras_online: entry.cameras_online,
        online_camera_count: entry.online_camera_count,
        total_camera_count: entry.total_camera_count,
        has_controller: entry.has_controller,
        has_equipment: entry.has_equipment,
        is_online: status !== 'inactive',
        is_partly_equipped: status === 'partial',
        last_ping_at: entry.last_ping_at,
        last_sensor_at: entry.last_sensor_at,
        heater_working: entry.heater_working,
        glass_broken: entry.glass_broken,
    }
}

/**
 * Fetch bus stops GeoJSON from the cached API route and merge in the live
 * activity status computed from `stop_sensor_states` / `bus_stops.controller_status`
 * and the cameras bound to each stop. No mock data is injected.
 */
export async function fetchBusStopsGeoJSON(): Promise<BusStopsGeoJSON> {
    try {
        let geoJSON = cachedGeoJSON

        if (!geoJSON) {
            const res = await fetch('/api/bus-stops')
            if (!res.ok) throw new Error(`Failed to fetch bus stops: ${res.status}`)
            geoJSON = await res.json() as BusStopsGeoJSON
            cachedGeoJSON = geoJSON
        }

        // Activity is volatile, so it is re-read on every call while the
        // geometry itself stays cached.
        const activity = await fetchStopActivity()

        return {
            ...geoJSON,
            features: geoJSON.features.map((feature) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    sensor_data: toSensorData(activity.stops[String(feature.properties.id)]),
                },
            })),
        }
    } catch (error) {
        console.error('Error fetching bus stops GeoJSON:', error)
        return { type: 'FeatureCollection', features: [] }
    }
}
