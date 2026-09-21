import { stopRegister, registerSheets } from '@/lib/exports/stop-register'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EquipmentOutage } from '@/lib/api/equipment'
import { parseEquipmentPeriod } from '@/lib/exports/equipment-hours'
import { buildMapInventoryDays, mapCameraIds, mapInventorySheet, mapFaultsSheet, type MapInventoryPoint, type DailySensorEvent } from '@/lib/exports/map-inventory'
import { createXlsx } from '@/lib/exports/xlsx'
import { mapReportFilename } from '@/lib/exports/filename'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PAGE_SIZE = 1000
const MAX_ROWS = 100_000

// Page explicitly: Supabase's default row limit must not silently truncate a report.
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, missingHistoryAllowed = false): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
        const result = await page(offset, offset + PAGE_SIZE - 1)
        if (result.error) {
            const code = (result.error as { code?: string }).code
            if (missingHistoryAllowed && offset === 0 && (code === '42P01' || code === 'PGRST205')) return []
            throw new Error('Не удалось прочитать данные отчёта')
        }
        const batch = result.data ?? []
        if (rows.length + batch.length > MAX_ROWS) throw new Error('История слишком велика для одной выгрузки')
        rows.push(...batch as T[])
        if (batch.length < PAGE_SIZE) return rows
    }
    throw new Error('История слишком велика для одной выгрузки')
}

export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Войдите в систему' }, { status: 401 })
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role,modules').eq('id', user.id).single()
    if (profileError || !profile || (profile.role !== 'admin' && !profile.modules?.includes('stops'))) {
        return NextResponse.json({ error: 'Нет доступа к модулю остановок' }, { status: 403 })
    }
    const now = Date.now(), from = request.nextUrl.searchParams.get('from') ?? '', to = request.nextUrl.searchParams.get('to') ?? ''
    let period: { start: number; end: number }
    try { period = parseEquipmentPeriod(from, to, now) }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
    try {
        const [cameras, geometry, history, outages, controllers, sensorEvents] = await Promise.all([
            readAll<{ camera_index: number; bus_stop_id: number | null; lat: number; lng: number; name?: string; description?:string }>((a, b) => supabase.from('cameras')
                .select('camera_index,bus_stop_id,lat,lng,name,description').eq('module', 'stops').order('camera_index').range(a, b)),
            supabase.rpc('get_bus_stops_geojson'),
            readAll<MapInventoryPoint>((a, b) => supabase.from('map_inventory_history')
                .select('recorded_at,cameras,stops,sensor_stops').lte('recorded_at', new Date(period.end).toISOString())
                .order('recorded_at').order('id').range(a, b), true),
            readAll<EquipmentOutage>((a, b) => supabase.from('equipment_outages')
                .select('id,equipment_type,equipment_id,bus_stop_id,location_id,started_at,detected_at,ended_at,resolution')
                .lt('started_at', new Date(period.end).toISOString()).order('id').range(a, b)),
            readAll<{ id: number; ip_address: string | null; has_controller: boolean | null }>((a, b) => supabase.from('bus_stops').select('id,ip_address,has_controller').order('id').range(a, b)),
            readAll<DailySensorEvent>((a, b) => supabase.from('controller_alerts').select('created_at,bus_stop_id,category,alarm,element')
                .gte('created_at', new Date(period.start).toISOString()).lt('created_at', new Date(period.end).toISOString()).order('created_at').order('id').range(a, b)),
        ])
        if (geometry.error || !Array.isArray(geometry.data?.features)) throw new Error('Не удалось прочитать объекты карты')
        const stops = new Set<number>(geometry.data.features.map((f: { properties: { id: number } }) => f.properties.id))
        const ids = mapCameraIds(cameras, stops)
        // Остановка с датчиками = контроллер смонтирован; общий на группу адрес
        // не записан в ip_address (sql/stop_equipment_flag_migration.sql).
        const current = { recorded_at: new Date(now).toISOString(), cameras: ids.size, stops: stops.size, sensor_stops: controllers.filter(c => stops.has(c.id) && (c.has_controller || c.ip_address?.trim())).length }
        // Map cameras use 10000 + pipeline index, as in notification camera lookup.
        const monitoredIds = new Set([...ids].flatMap(id => id >= 10000 ? [id, id - 10000] : [id]))
        const relevantOutages = outages.filter(o => o.equipment_type === 'camera' ? monitoredIds.has(o.equipment_id) : stops.has(o.bus_stop_id ?? o.equipment_id))
        const names: Record<string, string> = {}
        for (const feature of geometry.data.features) names[`controller:${feature.properties.id}`] = feature.properties.name || `Остановка №${feature.properties.id}`
        for (const camera of cameras) {
            const name = `${names[`controller:${camera.bus_stop_id}`] || camera.name || 'Камера'} — камера №${camera.camera_index >= 10000 ? camera.camera_index - 10000 : camera.camera_index}`
            names[`camera:${camera.camera_index}`] = name
            if (camera.camera_index >= 10000) names[`camera:${camera.camera_index - 10000}`] = name
        }
        const days = buildMapInventoryDays(history, current, relevantOutages, period.start, period.end, names, sensorEvents.filter(e => e.bus_stop_id != null && stops.has(e.bus_stop_id)))
        const inventory = stopRegister(geometry.data, cameras.filter(c=>ids.has(c.camera_index)), controllers)
        if (request.nextUrl.searchParams.get('format') === 'json') {
            return NextResponse.json({ current, historyAvailable: history.length > 0, days, inventory }, { headers: { 'Cache-Control': 'private, no-store' } })
        }
        const faults = mapFaultsSheet(days)
        const workbook = createXlsx([...registerSheets(inventory,cameras.filter(c=>ids.has(c.camera_index)),geometry.data),mapInventorySheet(days), ...(faults ? [faults] : [])])
        return new NextResponse(Buffer.from(workbook), { headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(mapReportFilename(from, to))}`,
            'Cache-Control': 'private, no-store',
        } })
    } catch (e) {
        console.error('Equipment export failed:', e instanceof Error ? e.message : 'unknown error')
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Не удалось сформировать отчёт' }, { status: 503 })
    }
}
