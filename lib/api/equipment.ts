import { createClient } from '@/lib/supabase/client'

// Таблицы пишет backend-сервис equipment-monitor (bus_stop_analytics),
// схема — sql/equipment_monitoring_schema.sql.

const supabase = createClient()

export type EquipmentType = 'camera' | 'controller'
export type EquipmentStatus = 'online' | 'offline' | 'unknown'

/** Текущее состояние одного контролируемого устройства. */
export interface EquipmentState {
    equipment_type: EquipmentType
    /** camera_index для камер, bus_stops.id для контроллеров */
    equipment_id: number
    bus_stop_id: number | null
    location_id: string | null
    stop_name: string | null
    status: EquipmentStatus
    /** Начало текущего отключения или момент последнего восстановления */
    status_since: string | null
    updated_at: string
}

/** Один эпизод отключения. Открыт, пока ended_at = null. */
export interface EquipmentOutage {
    id: number
    equipment_type: EquipmentType
    equipment_id: number
    bus_stop_id: number | null
    location_id: string | null
    /** Последний раз, когда устройство было на связи */
    started_at: string
    detected_at: string
    ended_at: string | null
    /** removed — устройство сняли с контроля, пока оно было отключено */
    resolution: 'recovered' | 'removed' | null
    notified_at: string | null
    recovery_notified_at: string | null
}

export interface EquipmentResult<T> {
    data: T[]
    error: string | null
}

function describeError(error: { code?: string; message?: string }): string {
    // 42P01 — таблицы нет: миграция ещё не применена.
    if (error.code === '42P01' || error.message?.includes('equipment_')) {
        return 'Данные об оборудовании недоступны: не применена миграция equipment_monitoring_schema.sql'
    }
    return 'Не удалось загрузить данные об оборудовании'
}

export async function fetchEquipmentState(): Promise<EquipmentResult<EquipmentState>> {
    const { data, error } = await supabase
        .from('equipment_state')
        .select('*')
        .order('equipment_type', { ascending: true })
        .order('equipment_id', { ascending: true })

    if (error) {
        console.error('Error fetching equipment state:', error)
        return { data: [], error: describeError(error) }
    }
    return { data: (data || []) as EquipmentState[], error: null }
}

/** Отключения, пересекающиеся с [from, to): начались до `to` и не закончились до `from`. */
export async function fetchEquipmentOutages(
    from: Date,
    to: Date
): Promise<EquipmentResult<EquipmentOutage>> {
    const { data, error } = await supabase
        .from('equipment_outages')
        .select('*')
        .lt('started_at', to.toISOString())
        .or(`ended_at.is.null,ended_at.gt."${from.toISOString()}"`)
        .order('started_at', { ascending: false })
        .limit(2000)

    if (error) {
        console.error('Error fetching equipment outages:', error)
        return { data: [], error: describeError(error) }
    }
    return { data: (data || []) as EquipmentOutage[], error: null }
}
