export interface BusStopProperties {
    id: number
    name: string | null
    short_name: string | null
    description: string | null
    address: string | null
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

let cachedGeoJSON: BusStopsGeoJSON | null = null

/**
 * Fetch bus stops GeoJSON from the cached API route.
 */
export async function fetchBusStopsGeoJSON(): Promise<BusStopsGeoJSON> {
    if (cachedGeoJSON) return cachedGeoJSON

    try {
        const res = await fetch('/api/bus-stops')
        if (!res.ok) throw new Error(`Failed to fetch bus stops: ${res.status}`)
        cachedGeoJSON = await res.json()
        return cachedGeoJSON!
    } catch (error) {
        console.error('Error fetching bus stops GeoJSON:', error)
        return { type: 'FeatureCollection', features: [] }
    }
}
