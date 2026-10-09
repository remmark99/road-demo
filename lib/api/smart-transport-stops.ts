export interface SmartTransportStopProperties {
    id: number
    name: string
    description: string | null
    direction: number | null
    nearest_bus_stop_id: number | null
    nearest_bus_stop_name: string | null
    nearest_distance_m: number | null
    same_id_bus_stop_name: string | null
    same_id_distance_m: number | null
    fetched_at: string
}

export interface SmartTransportStopsGeoJSON {
    type: 'FeatureCollection'
    features: {
        type: 'Feature'
        properties: SmartTransportStopProperties
        geometry: { type: 'Point'; coordinates: [number, number] }
    }[]
}

/** Остановка «Умного транспорта» считается совпавшей с нашей, если ближе этого расстояния. */
export const SMART_TRANSPORT_MATCH_RADIUS_M = 30

export async function fetchSmartTransportStops(): Promise<SmartTransportStopsGeoJSON> {
    try {
        const res = await fetch('/api/smart-transport-stops')
        if (!res.ok) throw new Error(`Failed to fetch Smart Transport stops: ${res.status}`)
        return await res.json() as SmartTransportStopsGeoJSON
    } catch (error) {
        console.error('Error fetching Smart Transport stops:', error)
        return { type: 'FeatureCollection', features: [] }
    }
}
