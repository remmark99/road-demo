import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EquipmentOutage, EquipmentState } from '@/lib/api/equipment'
import { buildCameraTimelines, equipmentLocalTime, parseEquipmentPeriod, summarizeEquipmentHours } from '@/lib/exports/equipment-hours'
import { createXlsx } from '@/lib/exports/xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PAGE_SIZE = 1000
const MAX_ROWS = 100_000

// Page explicitly: Supabase's default row limit must not silently truncate a report.
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
        const result = await page(offset, offset + PAGE_SIZE - 1)
        if (result.error) throw new Error('Не удалось прочитать историю оборудования')
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
    const now = Date.now(), from = request.nextUrl.searchParams.get('from'), to = request.nextUrl.searchParams.get('to')
    let period: { start: number; end: number }
    try { period = parseEquipmentPeriod(from, to, now) }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
    try {
        const [states, outages] = await Promise.all([
            readAll<EquipmentState>((a, b) => supabase.from('equipment_state')
                .select('equipment_type,equipment_id,bus_stop_id,location_id,stop_name,status,status_since,updated_at')
                .eq('equipment_type', 'camera').order('equipment_id').range(a, b)),
            readAll<EquipmentOutage>((a, b) => supabase.from('equipment_outages')
                .select('id,equipment_type,equipment_id,bus_stop_id,location_id,started_at,detected_at,ended_at,resolution')
                .eq('equipment_type', 'camera').order('id').range(a, b)),
        ])
        const cameras = buildCameraTimelines(states, outages, now)
        const hours = summarizeEquipmentHours(cameras, period.start, period.end)
        const workbook = createXlsx([
            { name: 'По часам', rows: [
                ['Начало часа (UTC+5)', 'Конец интервала (UTC+5)', 'Активные камеры', 'Подтверждённые активные камеры', 'Камеры без полных данных', 'Активные остановки', 'Подтверждённые активные остановки', 'Остановки без полных данных', 'Камеры без привязки', 'Данные'],
                ...hours.map(h => [h.from, h.to, h.activeCameras, h.confirmedCameras, h.unknownCameras, h.activeStops, h.confirmedStops, h.unknownStops, h.unlinkedCameras,
                    !cameras.length || h.unknownCameras === cameras.length ? 'Нет данных'
                        : h.unknownCameras || h.unlinkedCameras ? 'Неполные' : 'По журналу отключений']),
            ] },
            { name: 'Камеры', rows: [['Камера', 'Ключ остановки', 'Остановка'], ...cameras.map(c => [c.camera, c.stopKey, c.stopName])] },
            { name: 'Описание', rows: [
                ['Параметр', 'Значение'], ['Период', `${from} — ${to}, включительно`], ['Сформировано (UTC+5)', equipmentLocalTime(now)],
                ['Часовой пояс', 'UTC+5 — Сургут, Фёдоровский, Белый Яр'],
                ['Активная камера', 'Была в сети хотя бы часть часового интервала; не среднее и не снимок на конец часа.'],
                ['Активная остановка', 'Хотя бы одна её камера была в сети в течение часа. Контроллеры и датчики в этот показатель не входят.'],
                ['Источник', 'equipment_outages и equipment_state; доступность восстановлена между отключениями и подтверждёнными восстановлениями.'],
                ['Пробелы истории', 'Пустая итоговая ячейка — точное число неизвестно. Подтверждённое число — нижняя граница по имеющимся данным. Не заменяйте пустые ячейки нулями.'],
                ['Состав оборудования', 'Камеры из текущего мониторинга и истории отключений. Удалённые камеры без записей в истории восстановить нельзя.'],
                ['Привязка остановок', 'Используется текущая/последняя известная привязка камеры. История переносов камер не сохраняется.'],
                ['Текущий час', 'Последняя строка заканчивается временем формирования файла.'],
                ['Ограничение источника', 'Журнал не фиксирует периоды недоступности самого монитора. Отсутствие отключения до первого наблюдения не считается работой камеры.'],
            ] },
        ])
        return new NextResponse(Buffer.from(workbook), { headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="equipment-hourly-${from}-${to}.xlsx"`,
            'Cache-Control': 'private, no-store',
        } })
    } catch (e) {
        console.error('Equipment export failed:', e instanceof Error ? e.message : 'unknown error')
        return NextResponse.json({ error: 'Не удалось сформировать Excel. Проверьте доступность истории оборудования и повторите выгрузку.' }, { status: 503 })
    }
}
