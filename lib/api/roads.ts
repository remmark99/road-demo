export interface RoadProperties {
    osm_id: number
    name: string | null
    highway: string
    lanes: number | null
    maxspeed: string | null
    surface: string | null
    oneway: boolean | null
    contractor?: string
}

export interface RoadsGeoJSON {
    type: 'FeatureCollection'
    features: {
        type: 'Feature'
        properties: RoadProperties
        geometry: {
            type: 'LineString' | 'MultiLineString'
            coordinates: number[][] | number[][][]
        }
    }[]
}

// Only include road types we want to display (excludes residential, living_street, service)
export const HIGHWAY_CONFIG: Record<string, { label: string; width: number; color: string; opacity: number }> = {
    trunk: { label: 'Магистраль', width: 5, color: '#f97316', opacity: 0.8 },
    trunk_link: { label: 'Съезд с магистрали', width: 3.5, color: '#f97316', opacity: 0.6 },
    primary: { label: 'Главная дорога', width: 4.5, color: '#3b82f6', opacity: 0.75 },
    primary_link: { label: 'Съезд с главной', width: 3, color: '#3b82f6', opacity: 0.55 },
    secondary: { label: 'Второстепенная', width: 3.5, color: '#8b5cf6', opacity: 0.7 },
    secondary_link: { label: 'Съезд со второстепенной', width: 2.5, color: '#8b5cf6', opacity: 0.5 },
    tertiary: { label: 'Местная дорога', width: 2.5, color: '#06b6d4', opacity: 0.6 },
    tertiary_link: { label: 'Съезд с местной', width: 2, color: '#06b6d4', opacity: 0.45 },
}

// Highway types to include when filtering
export const ALLOWED_HIGHWAYS = Object.keys(HIGHWAY_CONFIG)

const DEFAULT_HIGHWAY = { label: 'Дорога', width: 1.5, color: '#6b7280', opacity: 0.4 }

export function getHighwayConfig(highway: string) {
    return HIGHWAY_CONFIG[highway] ?? DEFAULT_HIGHWAY
}

import { toast } from "sonner"

let cachedGeoJSON: RoadsGeoJSON | null = null

/**
 * Fetch roads GeoJSON from the cached API route.
 * The API route fetches from Supabase once and caches the result server-side.
 */
export async function fetchRoadsGeoJSON(retries = 3): Promise<RoadsGeoJSON> {
    if (cachedGeoJSON) return cachedGeoJSON

    const fetchAttempt = async (attempt: number): Promise<RoadsGeoJSON> => {
        try {
            if (attempt === 1) {
                toast.loading("Загрузка данных о дорогах...", { id: "fetch-roads" })
            } else {
                toast.loading(`Загрузка дорог (попытка ${attempt}/${retries})...`, { id: "fetch-roads" })
            }
            // v=2 busts the browser cache, refresh=true busts the server in-memory cache
            const res = await fetch('/api/roads')
            if (!res.ok) throw new Error(`Failed to fetch roads: ${res.status}`)
            cachedGeoJSON = await res.json()
            toast.success("Данные о дорогах загружены", { id: "fetch-roads", duration: 2500 })
            return cachedGeoJSON!
        } catch (error) {
            if (attempt < retries) {
                // Wait 2 seconds before retrying
                await new Promise(r => setTimeout(r, 2000))
                return fetchAttempt(attempt + 1)
            } else {
                console.error('Error fetching roads GeoJSON:', error)
                toast.error("Не удалось загрузить данные о дорогах", { id: "fetch-roads", duration: 5000 })
                return { type: 'FeatureCollection', features: [] }
            }
        }
    }

    return fetchAttempt(1)
}
