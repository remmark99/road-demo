import { supabase } from '../supabase'
import type { Alert } from '../types'

export interface FetchAlertsOptions {
    types?: string[]        // filter by alert_type
    cameraIndexes?: number[] // filter by camera_index
    limit?: number          // default 25
    offset?: number         // for pagination
}

export interface AlertsResult {
    alerts: Alert[]
    total: number
    hasMore: boolean
}

export async function fetchAlerts(options: FetchAlertsOptions = {}): Promise<AlertsResult> {
    const { types, cameraIndexes, limit = 25, offset = 0 } = options

    let query = supabase
        .from('alerts')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1)

    // Apply type filter
    if (types && types.length > 0) {
        query = query.in('alert_type', types)
    }

    // Apply camera filter
    if (cameraIndexes && cameraIndexes.length > 0) {
        query = query.in('camera_index', cameraIndexes)
    }

    const { data, error, count } = await query

    if (error) {
        console.error('Error fetching alerts:', error)
        return { alerts: [], total: 0, hasMore: false }
    }

    return {
        alerts: data || [],
        total: count || 0,
        hasMore: (offset + limit) < (count || 0)
    }
}

export async function fetchAlertsByCamera(
    cameraIndex: number,
    limit: number = 5
): Promise<Alert[]> {
    const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('camera_index', cameraIndex)
        .order('timestamp', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Error fetching camera alerts:', error)
        return []
    }

    return data || []
}

export async function fetchAlertTypes(): Promise<string[]> {
    const { data, error } = await supabase
        .from('alerts')
        .select('alert_type')
        .limit(100)

    if (error) {
        console.error('Error fetching alert types:', error)
        return []
    }

    // Get unique types
    const types = new Set(data?.map(a => a.alert_type) || [])
    return Array.from(types)
}

// Alert type metadata for UI
export const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
    snowplow: {
        label: 'Спецтехника',
        icon: 'truck',
        color: 'text-blue-400 bg-blue-500/20 border-blue-500/30'
    },
    canny: {
        label: 'Заснеженность',
        icon: 'snowflake',
        color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30'
    }
}

export const MODULE_MAP: Record<string, string> = {
    snowplow_detection: 'Модуль спецтехники',
    snow_detection: 'Модуль заснеженности',
}