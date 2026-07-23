import { supabase } from '../supabase'
import type { TkoSite, TkoSitesGeoJSON } from '../types'

export interface TkoSiteRow {
    id: number
    site_index: number
    name: string
    description: string | null
    lat: number
    lng: number
    status: string
    module: string
    created_at: string | null
    updated_at: string | null
}

function mapRow(row: TkoSiteRow): TkoSite {
    return {
        id: row.id,
        siteIndex: row.site_index,
        name: row.name,
        description: row.description,
        lat: row.lat,
        lng: row.lng,
        status: row.status as TkoSite['status'],
        module: row.module,
    }
}

export async function fetchTkoSites(allowedModules?: string[]): Promise<TkoSite[]> {
    if (Array.isArray(allowedModules) && allowedModules.length === 0) {
        return []
    }

    let query = supabase.from('tko_sites').select('*').order('site_index')

    if (allowedModules && allowedModules.length > 0) {
        query = query.in('module', allowedModules)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching TKO sites:', error)
        return []
    }

    return (data as TkoSiteRow[]).map(mapRow)
}

export async function fetchTkoSitesGeoJSON(allowedModules?: string[]): Promise<TkoSitesGeoJSON> {
    const sites = await fetchTkoSites(allowedModules)

    return {
        type: 'FeatureCollection',
        features: sites.map(site => ({
            type: 'Feature' as const,
            properties: site,
            geometry: {
                type: 'Point' as const,
                coordinates: [site.lng, site.lat] as [number, number],
            },
        })),
    }
}
