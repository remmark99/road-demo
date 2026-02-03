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

// Категории типов инцидентов
export type AlertCategory = 'equipment' | 'cleaning' | 'repair'

export const ALERT_CATEGORIES: Record<AlertCategory, { label: string; types: string[] }> = {
    equipment: {
        label: 'Спецтехника',
        types: ['snowplow']
    },
    cleaning: {
        label: 'Уборка',
        types: ['snow_slush', 'snow_windrow', 'snow_pile', 'puddle', 'dirt']
    },
    repair: {
        label: 'Ремонт',
        types: ['open_manhole', 'tilted_sign', 'dirty_sign', 'broken_light', 'worn_marking', 'pothole']
    }
}

// Alert type metadata for UI
export const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; category: AlertCategory }> = {
    // Спецтехника
    snowplow: {
        label: 'Спецтехника',
        icon: 'truck',
        color: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
        category: 'equipment'
    },
    // Уборка
    snow_slush: {
        label: 'Снежная каша',
        icon: 'snowflake',
        color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
        category: 'cleaning'
    },
    canny: {
        label: 'Заснеженность',
        icon: 'snowflake',
        color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
        category: 'cleaning'
    },
    snow_windrow: {
        label: 'Снежный вал',
        icon: 'mountain',
        color: 'text-slate-400 bg-slate-500/20 border-slate-500/30',
        category: 'cleaning'
    },
    snow_pile: {
        label: 'Снежная гора',
        icon: 'mountain-snow',
        color: 'text-white bg-white/10 border-white/20',
        category: 'cleaning'
    },
    puddle: {
        label: 'Подтопление дороги',
        icon: 'droplets',
        color: 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30',
        category: 'cleaning'
    },
    dirt: {
        label: 'Грязь на дороге',
        icon: 'cloud',
        color: 'text-amber-600 bg-amber-600/20 border-amber-600/30',
        category: 'cleaning'
    },
    // Ремонт
    open_manhole: {
        label: 'Открытый люк',
        icon: 'circle-dot',
        color: 'text-red-400 bg-red-500/20 border-red-500/30',
        category: 'repair'
    },
    tilted_sign: {
        label: 'Покосившийся знак',
        icon: 'signpost',
        color: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
        category: 'repair'
    },
    dirty_sign: {
        label: 'Загрязнённый знак',
        icon: 'signpost',
        color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
        category: 'repair'
    },
    broken_light: {
        label: 'Неработающее освещение',
        icon: 'lightbulb-off',
        color: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
        category: 'repair'
    },
    worn_marking: {
        label: 'Стёртая разметка',
        icon: 'minus',
        color: 'text-zinc-400 bg-zinc-500/20 border-zinc-500/30',
        category: 'repair'
    },
    pothole: {
        label: 'Ямы',
        icon: 'triangle-alert',
        color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
        category: 'repair'
    },
    camera_obstruction: {
        label: 'Загрязнение камеры',
        icon: 'camera-off',
        color: 'text-red-400 bg-red-500/20 border-red-500/30',
        category: 'equipment'
    }
}

export const MODULE_MAP: Record<string, string> = {
    snowplow_detection: 'Модуль спецтехники',
    snow_detection: 'Модуль заснеженности',
    puddle_detection: 'Модуль детекции луж',
    pothole_detection: 'Модуль детекции ям',
    snow_pile_detection: 'Модуль детекции снежных накоплений',
    camera_check: 'Модуль проверки камеры'
}