import type { Camera } from '@/lib/types'
import type { BusStopProperties } from '@/lib/api/bus-stops'
import { getStopComplexByCameraIndex } from '@/lib/stop-analytics-config'

export interface NotificationPeriod { from: string; to: string }
const DAY = 86_400_000
const OFFSET = 5 * 3_600_000
export function notificationDate(now = Date.now()) {
  return new Date(now + OFFSET).toISOString().slice(0, 10)
}
export function notificationPeriodBounds({ from, to }: NotificationPeriod) {
  function start(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Укажите корректную дату')
    const utc = Date.parse(`${date}T00:00:00Z`)
    if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== date) throw new Error('Укажите корректную дату')
    return utc - OFFSET
  }
  const lower = from ? start(from) : undefined
  const upper = to ? start(to) + DAY : undefined
  if (lower !== undefined && upper !== undefined && lower >= upper) throw new Error('Начало периода должно быть не позже окончания')
  return { fromInclusive: lower === undefined ? undefined : new Date(lower).toISOString(), toExclusive: upper === undefined ? undefined : new Date(upper).toISOString() }
}
export function formatEventDuration(start: string, end: string) {
  const ms = Date.parse(end) - Date.parse(start)
  if (!Number.isFinite(ms) || ms < 0) return 'нет данных'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'менее минуты'
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} ч.${minutes % 60 ? ` ${minutes % 60} мин.` : ''}` : `${minutes} мин.`
}
export interface CameraPlace { key: string; label: string; detail: string; cameraIndexes: number[] }
export function buildCameraPlaces(cameras: Camera[], stops: BusStopProperties[]): CameraPlace[] {
  const byId = new Map(stops.map(stop => [stop.id, stop]))
  const places = new Map<string, CameraPlace>()
  for (const camera of cameras) {
    const stop = camera.busStopId == null ? undefined : byId.get(camera.busStopId)
    const complex = camera.module === 'stops' || camera.cameraIndex >= 10000
      ? getStopComplexByCameraIndex(camera.cameraIndex >= 10000 ? camera.cameraIndex - 10000 : camera.cameraIndex) : null
    const key = camera.busStopId != null ? `stop:${camera.busStopId}` : complex ? `location:${complex.locationId}` : `camera:${camera.cameraIndex}`
    const label = stop?.address?.trim() || stop?.name?.trim() || complex?.stopName || camera.description?.trim() || camera.name?.trim() || 'Адрес не указан'
    const number = stop?.short_name?.match(/\d+[-–]\d+/)?.[0] || complex?.locationId
    const detail = [stop?.name && stop.name !== label ? stop.name : null, number ? `№ ${number}` : null].filter(Boolean).join(' · ')
    const existing = places.get(key)
    if (existing) existing.cameraIndexes.push(camera.cameraIndex)
    else places.set(key, { key, label, detail, cameraIndexes: [camera.cameraIndex] })
  }
  return [...places.values()].sort((a, b) => a.label.localeCompare(b.label, 'ru', { numeric: true }) || a.detail.localeCompare(b.detail, 'ru'))
}
export function searchCameraPlaces(places: CameraPlace[], query: string) {
  const words = query.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim().split(/\s+/).filter(Boolean)
  return places.filter(place => {
    const text = `${place.label} ${place.detail}`.toLocaleLowerCase('ru').replace(/ё/g, 'е')
    return words.every(word => text.includes(word))
  })
}
export function filteredCameraIndexes(places: CameraPlace[], query: string, selected: number[]) {
  if (!query.trim()) return selected.length ? selected : undefined
  const matches = new Set(searchCameraPlaces(places, query).flatMap(place => place.cameraIndexes))
  return selected.length ? selected.filter(index => matches.has(index)) : [...matches]
}
