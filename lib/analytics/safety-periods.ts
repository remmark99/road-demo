import type { StopSafetyAlert } from '../api/alerts'
const HOUR = 3600_000, DAY = 24 * HOUR, OFFSET = 5 * HOUR
export type SafetyBucket = 'hour' | 'day' | 'week'
export interface SafetyRange { from: Date; to: Date }
export function bucketStart(time: number, bucket: SafetyBucket) {
    const date = new Date(time + OFFSET)
    date.setUTCMinutes(0, 0, 0)
    if (bucket !== 'hour') date.setUTCHours(0)
    if (bucket === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    return date.getTime() - OFFSET
}
export function bucketEnd(start: number, bucket: SafetyBucket) { return start + (bucket === 'hour' ? HOUR : bucket === 'day' ? DAY : 7 * DAY) }
export function buildSafetyPeriods(alerts: StopSafetyAlert[], range: SafetyRange, bucket: SafetyBucket) {
    const rows = new Map<number, { bucketKey: string; bucketLabel: string; events: number; cameras: Set<number>; stops: Set<string> }>()
    const label = (time: number) => {
        const day = new Date(time + OFFSET).toISOString()
        return bucket === 'hour' ? `${day.slice(8,10)}.${day.slice(5,7)} ${day.slice(11,16)}` : `${day.slice(8,10)}.${day.slice(5,7)}`
    }
    for (let t = bucketStart(range.from.getTime(), bucket); t <= range.to.getTime(); t = bucketEnd(t, bucket)) {
        rows.set(t, { bucketKey: new Date(t).toISOString(), bucketLabel: label(t), events: 0, cameras: new Set(), stops: new Set() })
    }
    for (const alert of alerts) {
        const time = Date.parse(alert.timestamp)
        if (time < range.from.getTime() || time > range.to.getTime()) continue
        const row = rows.get(bucketStart(time, bucket))
        if (!row) continue
        row.events++
        if (alert.camera_index !== null) row.cameras.add(alert.camera_index)
        if (typeof alert.metadata?.location_id === 'string') row.stops.add(alert.metadata.location_id)
    }
    return [...rows.values()].map(row => ({ ...row, cameras: row.cameras.size, stops: row.stops.size }))
}
export function safetyNotificationsHref(range: SafetyRange, types: readonly string[], cameras: readonly number[] = []) {
    const start = range.from.toISOString(), end = new Date(range.to.getTime() + 1).toISOString()
    const params = new URLSearchParams({ from: new Date(range.from.getTime()+OFFSET).toISOString().slice(0,10), to: new Date(range.to.getTime()+OFFSET).toISOString().slice(0,10), start, end, types: [...new Set(types)].join(','), module: 'stops' })
    if (cameras.length) params.set('cameras', [...new Set(cameras)].join(','))
    return `/notifications?${params}`
}
