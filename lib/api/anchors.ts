import type { AnchorsGeoJSON } from '../types'

let cachedGeoJSON: AnchorsGeoJSON | null = null

/**
 * Fetch transport anchors GeoJSON from the API route.
 */
export async function fetchAnchorsGeoJSON(): Promise<AnchorsGeoJSON> {
    try {
        const res = await fetch(`/api/anchors?refresh=true&t=${Date.now()}`)
        if (!res.ok) throw new Error(`Failed to fetch anchors: ${res.status}`)
        const data: AnchorsGeoJSON = await res.json()

        return data
    } catch (error) {
        console.error('Error fetching anchors GeoJSON:', error)
        return { type: 'FeatureCollection', features: [] }
    }
}
