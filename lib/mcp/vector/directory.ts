import type { SupabaseClient } from '@supabase/supabase-js'
import { ToolInputError } from './args'

/** Справочник остановок, камер и их статусов — общий для всех инструментов одного вызова. */

export interface DirectoryStop {
    id: number
    name: string | null
    short_name: string | null
    description: string | null
    address: string | null
    district_id: number | null
    ip_address: string | null
    has_controller: boolean | null
}

export interface DirectoryCamera { camera_index: number; bus_stop_id: number | null; name: string | null }

export interface EquipmentStateRow {
    equipment_type: 'camera' | 'controller'
    equipment_id: number
    bus_stop_id: number | null
    location_id: string | null
    status: 'online' | 'offline' | 'unknown'
    status_since: string | null
}

export interface Directory {
    stops: DirectoryStop[]
    stopById: Map<number, DirectoryStop>
    districtById: Map<number, string>
    cameras: DirectoryCamera[]
    states: EquipmentStateRow[]
    /** camera_index из событий → остановка */
    stopByCamera: Map<number, number>
    /** location_id пайплайна (направление) → остановка */
    stopByLocation: Map<string, number>
}

const PAGE = 1000

export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, limit = 50_000): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; offset < limit; offset += PAGE) {
        const result = await page(offset, offset + PAGE - 1)
        if (result.error) throw new Error('Не удалось прочитать данные')
        const batch = (result.data ?? []) as T[]
        rows.push(...batch)
        if (batch.length < PAGE) return rows
    }
    throw new ToolInputError('Слишком много данных: сузьте период или фильтр')
}

export async function loadDirectory(db: SupabaseClient): Promise<Directory> {
    const [stops, districts, cameras, states] = await Promise.all([
        readAll<DirectoryStop>((a, b) => db.from('bus_stops')
            .select('id,name,short_name,description,address,district_id,ip_address,has_controller').order('id').range(a, b)),
        readAll<{ id: number; name: string }>((a, b) => db.from('districts').select('id,name').order('id').range(a, b)),
        readAll<DirectoryCamera>((a, b) => db.from('cameras').select('camera_index,bus_stop_id,name').eq('module', 'stops').order('camera_index').range(a, b)),
        readAll<EquipmentStateRow>((a, b) => db.from('equipment_state')
            .select('equipment_type,equipment_id,bus_stop_id,location_id,status,status_since').order('equipment_type').order('equipment_id').range(a, b)),
    ])
    const stopByCamera = new Map<number, number>()
    for (const camera of cameras) if (camera.bus_stop_id !== null) stopByCamera.set(camera.camera_index, camera.bus_stop_id)
    const stopByLocation = new Map<string, number>()
    for (const state of states) if (state.location_id && state.bus_stop_id !== null) stopByLocation.set(state.location_id, state.bus_stop_id)
    return {
        stops,
        stopById: new Map(stops.map(stop => [stop.id, stop])),
        districtById: new Map(districts.map(d => [d.id, d.name])),
        cameras,
        states,
        stopByCamera,
        stopByLocation,
    }
}

/** «Никольский (в центр) · пр. Мира, 31» — так остановку узнают люди. */
export function stopLabel(stop: DirectoryStop | undefined, fallbackId?: number | null): string {
    if (!stop) return fallbackId ? `Остановка №${fallbackId}` : 'Остановка не определена'
    const name = stop.name?.trim() || stop.address?.trim() || `Остановка №${stop.id}`
    const direction = stop.description?.trim()
    return direction && direction !== name ? `${name} (${direction})` : name
}

export function stopSummary(directory: Directory, stop: DirectoryStop) {
    const cameras = directory.cameras.filter(c => c.bus_stop_id === stop.id)
    // Монитор ведёт камеры по индексу VMS: в справочнике камера 10131 — это 131.
    const cameraStates = directory.states.filter(s => s.equipment_type === 'camera' && s.bus_stop_id === stop.id)
    const controller = directory.states.find(s => s.equipment_type === 'controller' && s.equipment_id === stop.id)
    return {
        id: stop.id,
        name: stopLabel(stop),
        number: stop.short_name,
        address: stop.address,
        district: stop.district_id !== null ? directory.districtById.get(stop.district_id) ?? null : null,
        cameras: cameras.length,
        cameras_online: cameraStates.filter(s => s.status === 'online').length,
        sensors: Boolean(stop.has_controller || stop.ip_address),
        sensors_status: controller ? controller.status : null,
    }
}

function normalize(text: string) {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim()
}

export function searchStops(directory: Directory, query: string): DirectoryStop[] {
    const words = normalize(query).split(' ').filter(Boolean)
    return directory.stops.filter(stop => {
        const haystack = normalize([stop.name, stop.description, stop.address, stop.short_name, stop.id,
            stop.district_id !== null ? directory.districtById.get(stop.district_id) : ''].filter(Boolean).join(' '))
        return words.every(word => haystack.includes(word))
    })
}

/**
 * Остановка по id, номеру или названию. Если название подходит к нескольким —
 * ошибка со списком кандидатов: модель выберет id и спросит ещё раз.
 */
export function resolveStop(directory: Directory, value: unknown): DirectoryStop {
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) {
        const stop = directory.stopById.get(Number(value))
        if (stop) return stop
    }
    if (typeof value !== 'string' || !value.trim()) throw new ToolInputError('Нужен параметр stop: id или название остановки')
    const byNumber = directory.stops.filter(s => s.short_name?.trim() === value.trim())
    const found = byNumber.length ? byNumber : searchStops(directory, value)
    if (found.length === 1) return found[0]
    if (!found.length) throw new ToolInputError(`Остановка «${value}» не найдена. Используйте find_stops.`)
    const options = found.slice(0, 10).map(s => `${s.id} — ${stopLabel(s)}${s.address ? `, ${s.address}` : ''}`).join('; ')
    throw new ToolInputError(`Под «${value}» подходит ${found.length} остановок, укажите id: ${options}`)
}
