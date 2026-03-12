export interface BusStopSensorData {
    is_online: boolean
    has_equipment: boolean
    is_partly_equipped: boolean
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

let cachedGeoJSON: BusStopsGeoJSON | null = null

/**
 * Fetch bus stops GeoJSON from the cached API route.
 * Injects mock sensor data into the properties for the demo.
 */
export async function fetchBusStopsGeoJSON(): Promise<BusStopsGeoJSON> {
    if (cachedGeoJSON) return cachedGeoJSON

    try {
        const res = await fetch('/api/bus-stops')
        if (!res.ok) throw new Error(`Failed to fetch bus stops: ${res.status}`)
        const data: BusStopsGeoJSON = await res.json()

        // Inject mock sensor data
        data.features = data.features.map((feature, index) => {
            // Deterministic mock generation based on ID/index so it's stable
            const deterministicRandom = (index * 137 + 1) % 100 / 100 // 0 to 0.99

            let has_equipment = false
            let is_partly_equipped = false
            let is_online = false
            let temperature_in: number | undefined
            let temperature_out: number | undefined
            let humidity: number | undefined
            let heater_working: boolean | undefined
            let glass_broken: boolean | undefined

            if (deterministicRandom < 0.4) {
                // 40% fully equipped and online
                has_equipment = true
                is_online = true
                temperature_in = 15 + Math.round(Math.random() * 5)
                temperature_out = -10 + Math.round(Math.random() * 8)
                humidity = 40 + Math.round(Math.random() * 20)
                heater_working = true
                glass_broken = Math.random() < 0.05 // 5% chance of broken glass
                if (Math.random() < 0.05) heater_working = false // 5% chance of heater failure
            } else if (deterministicRandom < 0.6) {
                // 20% partly equipped and online
                is_partly_equipped = true
                is_online = true
                temperature_out = -10 + Math.round(Math.random() * 8)
                heater_working = true
            } else if (deterministicRandom < 0.7) {
                // 10% equipped but offline
                has_equipment = true
                is_online = false
            } else {
                // 30% not equipped
                // default values
            }

            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    sensor_data: {
                        is_online,
                        has_equipment,
                        is_partly_equipped,
                        temperature_in,
                        temperature_out,
                        humidity,
                        heater_working,
                        glass_broken
                    }
                }
            }
        })

        cachedGeoJSON = data
        return cachedGeoJSON
    } catch (error) {
        console.error('Error fetching bus stops GeoJSON:', error)
        return { type: 'FeatureCollection', features: [] }
    }
}
