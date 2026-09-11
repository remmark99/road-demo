/**
 * Единый источник статуса «в сети / не в сети» для камер и контроллеров.
 *
 * Таблицу equipment_state пишет equipment-monitor (bus_stop_analytics) по
 * heartbeat: cameras.last_seen_at и bus_stops.last_ok_at. Её же показывает
 * вкладка «Оборудование» в уведомлениях, поэтому карта и остальные экраны берут
 * статус отсюда, а не из cameras.status (ручное поле в админке) или
 * bus_stops.controller_status.
 *
 * Модуль чистый — годится и для браузера, и для API-роутов.
 */

export type MonitoredStatus = 'online' | 'offline' | 'unknown'

export interface EquipmentStatusRow {
    equipment_type: 'camera' | 'controller'
    /** camera_index для камер, bus_stops.id для контроллеров */
    equipment_id: number
    status: MonitoredStatus
}

export interface EquipmentStatusIndex {
    cameras: Map<number, MonitoredStatus>
    controllers: Map<number, MonitoredStatus>
}

export function indexEquipmentStatus(rows: readonly EquipmentStatusRow[] | null | undefined): EquipmentStatusIndex {
    const index: EquipmentStatusIndex = { cameras: new Map(), controllers: new Map() }
    for (const row of rows ?? []) {
        const target = row.equipment_type === 'camera' ? index.cameras : index.controllers
        target.set(row.equipment_id, row.status)
    }
    return index
}

/**
 * Вердикт монитора: true/false, если устройство под контролем
 * ('unknown' — heartbeat ещё ни разу не приходил, значит не в сети),
 * null — монитор его не ведёт, и вызывающий решает сам.
 */
export function monitoredOnline(statuses: Map<number, MonitoredStatus>, id: number | null | undefined): boolean | null {
    if (id === null || id === undefined) return null
    const status = statuses.get(id)
    return status === undefined ? null : status === 'online'
}
