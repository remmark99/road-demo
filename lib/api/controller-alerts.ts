import { supabase } from '../supabase'

export interface ControllerAlert {
    id: string
    created_at: string
    module_name: string
    element: number
    address: number
    category: string
    value: number
    alarm: string
    prev_alarm: string | null
    message: string
}

export interface FetchControllerAlertsOptions {
    elements?: number[]
    alarms?: string[]
    categories?: string[]
    limit?: number
    offset?: number
}

export interface ControllerAlertsResult {
    alerts: ControllerAlert[]
    total: number
    hasMore: boolean
}

const SENSOR_LABELS: Record<number, string> = {
    1: 'Датчик DIO1 (напряжение)',
    13: 'Датчик 1 (влажность и температура)',
    14: 'Датчик 2 (температура)',
}

export function getSensorLabel(element: number): string {
    return SENSOR_LABELS[element] ?? `Элемент ${element}`
}

export const ALARM_CONFIG: Record<string, { label: string; color: string }> = {
    normal: {
        label: 'Норма',
        color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
    },
    warning: {
        label: 'Предупреждение',
        color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
    },
    critical: {
        label: 'Критично',
        color: 'text-red-400 bg-red-500/20 border-red-500/30',
    },
}

export const CATEGORY_LABELS: Record<string, string> = {
    temperature: 'Температура',
    humidity: 'Влажность',
    'digital input': 'Напряжение',
    'glass_break': 'Датчик разбития стекла',
}

export async function fetchControllerAlerts(
    options: FetchControllerAlertsOptions = {}
): Promise<ControllerAlertsResult> {
    const { elements, alarms, categories, limit = 25, offset = 0 } = options

    let query = supabase
        .from('controller_alerts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (elements && elements.length > 0) {
        query = query.in('element', elements)
    }

    if (alarms && alarms.length > 0) {
        query = query.in('alarm', alarms)
    }

    if (categories && categories.length > 0) {
        query = query.in('category', categories)
    }

    const { data, error, count } = await query

    if (error) {
        console.error('Error fetching controller alerts:', error)
        return { alerts: [], total: 0, hasMore: false }
    }

    return {
        alerts: data || [],
        total: count || 0,
        hasMore: (offset + limit) < (count || 0),
    }
}
