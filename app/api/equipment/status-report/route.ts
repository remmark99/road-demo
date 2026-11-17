import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createXlsx } from '@/lib/exports/xlsx'
import { readSignificantOutages } from '@/lib/exports/equipment-outages-read'
import { equipmentStatusSheets, localDateTime, type ReportDeviceState, type ReportStop } from '@/lib/exports/equipment-status-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SPAN_MS = 93 * 24 * 3_600_000

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; offset < 100_000; offset += 1000) {
        const { data, error } = await page(offset, offset + 999)
        if (error) throw new Error('Не удалось прочитать данные отчёта')
        rows.push(...((data ?? []) as T[]))
        if ((data ?? []).length < 1000) return rows
    }
    throw new Error('Слишком много строк для отчёта')
}

/** Excel «Оборудование на момент выгрузки»: что в сети и что нет на время формирования + отключения за период. */
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Войдите в систему' }, { status: 401 })
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role,modules').eq('id', user.id).single()
    if (profileError || !profile || (profile.role !== 'admin' && !profile.modules?.includes('stops'))) {
        return NextResponse.json({ error: 'Нет доступа к модулю остановок' }, { status: 403 })
    }

    const at = Date.now()
    const params = request.nextUrl.searchParams
    const to = Math.min(params.get('to') ? Date.parse(params.get('to')!) : at, at)
    const from = params.get('from') ? Date.parse(params.get('from')!) : to - 7 * 24 * 3_600_000
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > MAX_SPAN_MS) {
        return NextResponse.json({ error: 'Некорректный период' }, { status: 400 })
    }

    try {
        const [states, geometry, assignments, districts, outages] = await Promise.all([
            readAll<ReportDeviceState>((a, b) => supabase.from('equipment_state')
                .select('equipment_type,equipment_id,bus_stop_id,stop_name,status,status_since')
                .order('equipment_type').order('equipment_id').range(a, b)),
            supabase.rpc('get_bus_stops_geojson'),
            readAll<{ id: number; district_id: number | null }>((a, b) => supabase.from('bus_stops').select('id,district_id').order('id').range(a, b)),
            readAll<{ id: number; name: string }>((a, b) => supabase.from('districts').select('id,name').order('id').range(a, b)),
            readSignificantOutages(supabase, from, to),
        ])
        if (geometry.error || !Array.isArray(geometry.data?.features)) throw new Error('Не удалось прочитать остановки')

        const districtName = new Map(districts.map((d) => [d.id, d.name]))
        const districtOf = new Map(assignments.map((row) => [row.id, row.district_id]))
        const stops = new Map<number, ReportStop>()
        for (const feature of geometry.data.features as { properties: { id: number; name?: string | null; short_name?: string | null } }[]) {
            const { id, name, short_name } = feature.properties
            const district = districtOf.get(id)
            stops.set(id, {
                id,
                name: name?.trim() || `Остановка ${id}`,
                number: short_name?.trim() || String(id),
                district: (district != null ? districtName.get(district) : undefined) ?? '—',
            })
        }

        const workbook = createXlsx(equipmentStatusSheets({ at, from, to, states, stops, outages }))
        const filename = `Оборудование на ${localDateTime(at).replace(':', '-')}.xlsx`
        return new NextResponse(Buffer.from(workbook), { headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
            'Cache-Control': 'private, no-store',
        } })
    } catch (error) {
        console.error('Equipment status report failed:', error instanceof Error ? error.message : 'unknown error')
        return NextResponse.json({ error: 'Не удалось сформировать отчёт' }, { status: 503 })
    }
}
