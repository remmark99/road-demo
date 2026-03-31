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
export type AlertCategory =
    | 'equipment'
    | 'cleaning'
    | 'repair'
    | 'shore_security'
    | 'shore_safety'
    | 'park_monitoring'
    | 'transport_monitoring'

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
    },
    shore_security: {
        label: 'Охрана периметра',
        types: ['line_cross', 'person_detect', 'vehicle_detect']
    },
    shore_safety: {
        label: 'Безопасность людей',
        types: ['restricted_zone', 'unaccompanied_child', 'water_fall', 'fire_detect']
    },
    park_monitoring: {
        label: 'Безопасный парк',
        types: [
            'park_left_item',
            'park_person_down',
            'park_fight',
            'park_fire',
            'park_trash_overflow',
            'park_camera_obstruction',
            'park_light_off',
            'park_vehicle_detect',
            'park_dirty_road'
        ]
    },
    transport_monitoring: {
        label: 'Контроль транспорта',
        types: [
            'transport_route_deviation',
            'transport_wait_overrun',
            'transport_doors_not_opened'
        ]
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
    },
    // Охрана периметра (Безопасный берег)
    line_cross: {
        label: 'Пересечение линии',
        icon: 'footprints',
        color: 'text-amber-500 bg-amber-500/20 border-amber-500/30',
        category: 'shore_security'
    },
    person_detect: {
        label: 'Проход человека',
        icon: 'user',
        color: 'text-orange-500 bg-orange-500/20 border-orange-500/30',
        category: 'shore_security'
    },
    vehicle_detect: {
        label: 'Проезд автомобиля',
        icon: 'car',
        color: 'text-rose-500 bg-rose-500/20 border-rose-500/30',
        category: 'shore_security'
    },
    // Безопасность людей (Безопасный берег)
    restricted_zone: {
        label: 'Запретная зона (Вода/Лед)',
        icon: 'shield-alert',
        color: 'text-red-500 bg-red-500/20 border-red-500/30',
        category: 'shore_safety'
    },
    unaccompanied_child: {
        label: 'Дети без сопровождения',
        icon: 'baby',
        color: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
        category: 'shore_safety'
    },
    water_fall: {
        label: 'Падение в воду',
        icon: 'life-buoy',
        color: 'text-red-600 bg-red-600/20 border-red-600/30 font-bold',
        category: 'shore_safety'
    },
    fire_detect: {
        label: 'Детекция огня',
        icon: 'flame',
        color: 'text-orange-600 bg-orange-600/20 border-orange-600/30 font-bold',
        category: 'shore_safety'
    },
    // Безопасный парк
    park_left_item: {
        label: 'Оставленный предмет',
        icon: 'package-search',
        color: 'text-violet-400 bg-violet-500/20 border-violet-500/30',
        category: 'park_monitoring'
    },
    park_person_down: {
        label: 'Лежачий человек',
        icon: 'person-standing',
        color: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
        category: 'park_monitoring'
    },
    park_fight: {
        label: 'Драка',
        icon: 'shield-alert',
        color: 'text-red-400 bg-red-500/20 border-red-500/30',
        category: 'park_monitoring'
    },
    park_fire: {
        label: 'Возгорание',
        icon: 'flame',
        color: 'text-red-500 bg-red-500/20 border-red-500/30 font-bold',
        category: 'park_monitoring'
    },
    park_trash_overflow: {
        label: 'Переполненная урна',
        icon: 'trash-2',
        color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
        category: 'park_monitoring'
    },
    park_camera_obstruction: {
        label: 'Камера перекрыта',
        icon: 'camera-off',
        color: 'text-red-400 bg-red-500/20 border-red-500/30',
        category: 'park_monitoring'
    },
    park_light_off: {
        label: 'Неработающее освещение',
        icon: 'lightbulb-off',
        color: 'text-zinc-400 bg-zinc-500/20 border-zinc-500/30',
        category: 'park_monitoring'
    },
    park_vehicle_detect: {
        label: 'Проезд автомобиля',
        icon: 'car',
        color: 'text-sky-400 bg-sky-500/20 border-sky-500/30',
        category: 'park_monitoring'
    },
    park_dirty_road: {
        label: 'Неубранная дорога',
        icon: 'cloud',
        color: 'text-amber-500 bg-amber-500/20 border-amber-500/30',
        category: 'park_monitoring'
    },
    // Контроль транспорта
    transport_route_deviation: {
        label: 'Отклонение от маршрута',
        icon: 'route',
        color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
        category: 'transport_monitoring'
    },
    transport_wait_overrun: {
        label: 'Превышение ожидания',
        icon: 'clock',
        color: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
        category: 'transport_monitoring'
    },
    transport_doors_not_opened: {
        label: 'Неоткрытые двери',
        icon: 'door-closed',
        color: 'text-rose-400 bg-rose-500/20 border-rose-500/30',
        category: 'transport_monitoring'
    }
}

export const MODULE_MAP: Record<string, string> = {
    snowplow_detection: 'Состояние дорог',
    snow_detection: 'Состояние дорог',
    puddle_detection: 'Состояние дорог',
    pothole_detection: 'Состояние дорог',
    snow_pile_detection: 'Состояние дорог',
    camera_check: 'Состояние дорог',
    shore_security: 'Охрана периметра',
    shore_safety: 'Безопасность людей',
    park_monitoring: 'Безопасный парк',
    safe_park: 'Безопасный парк',
    transport_monitoring: 'Контроль транспорта',
    transport_control: 'Контроль транспорта'
}
