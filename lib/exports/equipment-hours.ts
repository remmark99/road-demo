import type { EquipmentOutage, EquipmentState } from '../api/equipment'
import { getStopComplexByCameraIndex } from '../stop-analytics-config'

const HOUR = 3_600_000
const OFFSET = 5 * HOUR // Сургут, Фёдоровский, Белый Яр — UTC+5, без перевода часов.
export const equipmentLocalDate = (time: number) => new Date(time + OFFSET).toISOString().slice(0, 10)
export const equipmentLocalTime = (time: number) => new Date(time + OFFSET).toISOString().slice(0, 16).replace('T', ' ')

export function parseEquipmentPeriod(from: string | null, to: string | null, now: number) {
    const day = (value: string | null) => {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Укажите даты начала и окончания')
        const ms = Date.parse(`${value}T00:00:00+05:00`)
        if (!Number.isFinite(ms) || equipmentLocalDate(ms) !== value) throw new Error('Некорректная дата')
        return ms
    }
    const start = day(from), end = day(to) + 24 * HOUR
    if (end <= start) throw new Error('Дата окончания должна быть не раньше даты начала')
    if (end - start > 366 * 24 * HOUR) throw new Error('Выберите период не более 366 дней')
    if (start > now || to! > equipmentLocalDate(now)) throw new Error('Нельзя выбрать будущие даты')
    return { start, end: Math.min(end, now) }
}

type Interval = [number, number]
export interface CameraTimeline {
    camera: number
    stopKey: string | null
    stopName: string
    online: Interval[]
    offline: Interval[]
}
export interface EquipmentHour {
    from: string
    to: string
    activeCameras: number | null
    confirmedCameras: number
    unknownCameras: number
    activeStops: number | null
    confirmedStops: number
    unknownStops: number
    unlinkedCameras: number
}

const instant = (s: string | null | undefined) => s ? Date.parse(s) : NaN

function overlap(intervals: Interval[], start: number, end: number) {
    return intervals.some(([a, b]) => a < end && b > start)
}
function fullyCovered(intervals: Interval[], start: number, end: number) {
    let until = start
    for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
        if (a > until) break
        until = Math.max(until, b)
        if (until >= end) return true
    }
    return false
}
function subtract(intervals: Interval[], excluded: Interval[]): Interval[] {
    return excluded.reduce((parts, [a, b]) => parts.flatMap(([start, end]) => {
        if (b <= start || a >= end) return [[start, end] as Interval]
        return [...(start < a ? [[start, a] as Interval] : []), ...(b < end ? [[b, end] as Interval] : [])]
    }), intervals)
}

/** Absence of an outage before the first evidence is NOT evidence of availability. */
export function buildCameraTimelines(states: EquipmentState[], outages: EquipmentOutage[], now: number): CameraTimeline[] {
    const current = new Map(states.filter(s => s.equipment_type === 'camera').map(s => [s.equipment_id, s]))
    const grouped = new Map<number, EquipmentOutage[]>()
    for (const o of outages) {
        if (o.equipment_type !== 'camera') continue
        grouped.set(o.equipment_id, [...(grouped.get(o.equipment_id) || []), o])
    }
    return [...new Set([...current.keys(), ...grouped.keys()])].sort((a, b) => a - b).map(camera => {
        const state = current.get(camera)
        const events = (grouped.get(camera) || []).sort((a, b) => instant(a.started_at) - instant(b.started_at))
        const latest = events.at(-1)
        const complex = getStopComplexByCameraIndex(camera)
        const location = state?.location_id ?? latest?.location_id ?? complex?.locationId
        const stopId = state?.bus_stop_id ?? latest?.bus_stop_id
        const stopKey = location ? `location:${location}` : stopId != null ? `stop:${stopId}` : null
        const stopName = complex?.stopName || state?.stop_name || location || (stopId != null ? `Остановка №${stopId}` : 'Не привязана')
        const offline: Interval[] = events.map(e => [instant(e.started_at), Math.min(instant(e.ended_at) || now, now)])
            .filter(([a, b]) => Number.isFinite(a) && b > a) as Interval[]
        const since = instant(state?.status_since) || instant(state?.updated_at)
        if (state?.status === 'offline' && Number.isFinite(since) && since < now) offline.push([since, now])
        const online: Interval[] = []
        events.forEach((event, i) => {
            if (event.resolution !== 'recovered' || !event.ended_at) return
            const start = instant(event.ended_at)
            const next = events[i + 1]
            // Removed devices have no known monitoring end. Do not extend their
            // last recovery indefinitely; current unknown states also stay unknown.
            const end = next ? instant(next.started_at)
                : state && state.status !== 'unknown' ? now : start
            if (Number.isFinite(start) && end > start) online.push([start, Math.min(end, now)])
        })
        if (state?.status === 'online' && Number.isFinite(since) && since < now) online.push([since, now])
        return { camera, stopKey, stopName, online: subtract(online, offline), offline }
    })
}

export function summarizeEquipmentHours(timelines: CameraTimeline[], start: number, end: number): EquipmentHour[] {
    const rows: EquipmentHour[] = []
    for (let hour = start; hour < end; hour += HOUR) {
        const until = Math.min(hour + HOUR, end)
        const stops = new Map<string, { active: boolean; unknown: boolean }>()
        let confirmedCameras = 0, unknownCameras = 0, unlinkedCameras = 0
        for (const camera of timelines) {
            const active = overlap(camera.online, hour, until)
            const unknown = !active && !fullyCovered(camera.offline, hour, until)
            if (active) confirmedCameras++
            if (unknown) unknownCameras++
            if (!camera.stopKey) { unlinkedCameras++; continue }
            const stop = stops.get(camera.stopKey) || { active: false, unknown: false }
            stop.active ||= active
            stop.unknown ||= unknown
            stops.set(camera.stopKey, stop)
        }
        const confirmedStops = [...stops.values()].filter(s => s.active).length
        const unknownStops = [...stops.values()].filter(s => !s.active && s.unknown).length
        rows.push({ from: equipmentLocalTime(hour), to: equipmentLocalTime(until),
            activeCameras: unknownCameras || !timelines.length ? null : confirmedCameras,
            confirmedCameras, unknownCameras,
            activeStops: unknownStops || unlinkedCameras || !stops.size ? null : confirmedStops,
            confirmedStops, unknownStops, unlinkedCameras })
    }
    return rows
}
