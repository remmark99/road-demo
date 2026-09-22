import type { EquipmentOutage } from '../api/equipment'
import { equipmentLocalDate, equipmentLocalTime } from './equipment-hours'
import type { Sheet } from './xlsx'

export interface MapInventoryPoint { recorded_at: string; cameras: number; stops: number; sensor_stops?: number }
export interface MapInventoryDay { date: string; cameras: number | null; stops: number | null; sensor_stops: number | null; failures: number; note: string; caption: string; events: string[] }
export interface MapInventoryReport {
    current: MapInventoryPoint
    historyAvailable: boolean
    inventory?: import('./stop-register').RegisterStop[]
    days: MapInventoryDay[]
}

/** Same objects as the stops module on the map, regardless of online status. */
export function mapCameraIds(cameras: { camera_index: number; bus_stop_id: number | null; lat: number; lng: number }[], stopIds: Set<number>) {
    return new Set(cameras.filter(c => c.bus_stop_id != null ? stopIds.has(c.bus_stop_id)
        : Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180)
        .map(c => c.camera_index))
}

/** Inventory at the end of each local day, never a sum or an online count. */
export interface DailySensorEvent { created_at: string; bus_stop_id: number | null; category: string; alarm: string; element: number }

export function buildMapInventoryDays(history: MapInventoryPoint[], current: MapInventoryPoint, outages: EquipmentOutage[], start: number, end: number, names: Record<string, string> = {}, sensorEvents: DailySensorEvent[] = []): MapInventoryDay[] {
    const points = [...history, current].filter(p => Number.isFinite(Date.parse(p.recorded_at)))
        .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
    const rows: MapInventoryDay[] = []
    let index = 0, known: MapInventoryPoint | undefined
    for (let day = start; day < end; day += 86_400_000) {
        const until = Math.min(day + 86_400_000, end)
        const incomplete = until < day + 86_400_000
        while (index < points.length && (Date.parse(points[index].recorded_at) < until
            || (incomplete && Date.parse(points[index].recorded_at) === until))) known = points[index++]
        const events = new Map<string, Set<string>>()
        const add = (label: string, outage: EquipmentOutage) => {
            const ids = events.get(label) ?? new Set<string>()
            ids.add(`${outage.equipment_type}:${outage.equipment_id}`)
            events.set(label, ids)
        }
        for (const o of outages) {
            const began = Date.parse(o.started_at), ended = o.ended_at ? Date.parse(o.ended_at) : Infinity
            const kind = o.equipment_type === 'camera' ? 'камеры' : 'датчики остановок'
            if (began < day && ended > day) add(`С начала дня нет связи — ${kind}`, o)
            if (began >= day && began < until) add(`${equipmentLocalTime(began).slice(11)} — потеря связи: ${kind}`, o)
            if (ended >= day && ended < until && o.resolution === 'recovered') add(`${equipmentLocalTime(ended).slice(11)} — связь восстановлена: ${kind}`, o)
        }
        const eventNotes = [...events].sort(([a], [b]) => a.localeCompare(b, 'ru')).flatMap(([label, ids]) => [...ids].map(id => `${label}: 1 (${names[id] || id.replace('camera:', 'камера №').replace('controller:', 'остановка №')})`))
        const sensorProblems = new Map<string, DailySensorEvent>()
        for (const event of sensorEvents) {
            const time = Date.parse(event.created_at)
            if (time < day || time >= until || !['warning', 'critical', 'alarm'].includes(event.alarm)) continue
            if (event.category === 'controller_offline' || event.category === 'controller_online') continue
            // One problem per stop/sensor/category per day, even if it reports repeatedly.
            const key = `${event.bus_stop_id}:${event.element}:${event.category}`
            if (!sensorProblems.has(key)) sensorProblems.set(key, event)
        }
        const categories: Record<string, string> = { incident: 'инцидент', glass_break: 'инцидент', temperature: 'температура', humidity: 'влажность', 'digital input': 'инцидент' }
        for (const event of sensorProblems.values()) eventNotes.push(`${equipmentLocalTime(Date.parse(event.created_at)).slice(11)} — ${names[`controller:${event.bus_stop_id}`] || 'Остановка не указана'}: ${categories[event.category] || event.category}`)
        const failures = outages.filter(o => Date.parse(o.started_at) < until && (!o.ended_at || Date.parse(o.ended_at) > day)).length + sensorProblems.size
        const notes: string[] = []
        if (!known) notes.unshift('История состава карты за этот день не сохранена.')
        if (incomplete) notes.unshift(`На ${equipmentLocalTime(until).slice(11)}; день ещё не завершён.`)
        rows.push({ date: equipmentLocalDate(day), cameras: known?.cameras ?? null, stops: known?.stops ?? null, sensor_stops: known?.sensor_stops ?? null, failures, caption: notes.join('\n'), events: eventNotes, note: [...notes, ...eventNotes].join('\n') })
    }
    return rows
}

export function mapInventorySheet(days: MapInventoryDay[]): Sheet {
    return { name: 'По дням', columnWidths: [16, 19, 22, 25, 18, 90], wrapColumns: [3, 4, 5], rows: [
        ['Дата', 'Камеры', 'Остановки', 'С датчиками', 'Сбои', 'Примечание'],
        ...days.map(d => [d.date.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1'), d.cameras ?? 'Нет истории', d.stops ?? 'Нет истории', d.sensor_stops ?? 'Нет истории', d.failures, d.cameras === null ? 'Нет истории' : d.failures ? 'См. лист «Сбои»' : '—']),
    ] }
}


export function mapFaultsSheet(days: MapInventoryDay[]): Sheet | null {
    const events = days.flatMap(day => day.events.map(event => [day.date.split('-').reverse().join('.'), event]))
    return events.length ? { name: 'Сбои', columnWidths: [16, 110], wrapColumns: [1], rows: [['Дата', 'Что произошло и где'], ...events] } : null
}
