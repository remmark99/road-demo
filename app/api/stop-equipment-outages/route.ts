import { NextResponse } from 'next/server'

import { getAuthenticatedUser, jsonError } from '@/lib/notifications/http'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Контроллеры теряют связь на минуту-две десятки тысяч раз в месяц: в аналитику идут только
// перерывы от 10 минут и всё, что открыто сейчас. Короткие пропадания отбрасываются здесь,
// чтобы в браузер не уезжали сотни тысяч строк.
const MIN_OUTAGE_MS = 10 * 60_000
const MAX_SPAN_MS = 93 * 24 * 3_600_000
const PAGE = 1000
const CONCURRENCY = 8
const CACHE_MS = 5 * 60_000

interface OutageRow {
    id: number
    equipment_type: 'camera' | 'controller'
    equipment_id: number
    bus_stop_id: number | null
    started_at: string
    ended_at: string | null
}

let cache: { key: string; at: number; rows: OutageRow[] } | null = null

async function load(from: number, to: number): Promise<OutageRow[]> {
    const supabase = await createClient()
    const base = () => supabase.from('equipment_outages')
        .select('id,equipment_type,equipment_id,bus_stop_id,started_at,ended_at')
        .lt('started_at', new Date(to).toISOString())
        .or(`ended_at.is.null,ended_at.gt."${new Date(from).toISOString()}"`)
    const { count, error } = await supabase.from('equipment_outages').select('id', { count: 'exact', head: true })
        .lt('started_at', new Date(to).toISOString())
        .or(`ended_at.is.null,ended_at.gt."${new Date(from).toISOString()}"`)
    if (error) throw new Error('Equipment outages unavailable')
    const pages = Math.ceil((count ?? 0) / PAGE)
    const rows: OutageRow[] = []
    for (let first = 0; first < pages; first += CONCURRENCY) {
        const batch = await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages - first) }, (_, offset) => {
            const page = first + offset
            return base().order('id').range(page * PAGE, page * PAGE + PAGE - 1)
        }))
        for (const result of batch) {
            if (result.error) throw new Error('Equipment outages unavailable')
            for (const row of (result.data ?? []) as OutageRow[]) {
                const end = row.ended_at ? Date.parse(row.ended_at) : null
                if (end === null || end - Date.parse(row.started_at) >= MIN_OUTAGE_MS) rows.push(row)
            }
        }
    }
    return rows
}

export async function GET(request: Request) {
    const user = await getAuthenticatedUser()
    if (!user) return jsonError('Unauthorized', 401)
    const params = new URL(request.url).searchParams
    const to = params.get('to') ? Date.parse(params.get('to')!) : Date.now()
    const from = params.get('from') ? Date.parse(params.get('from')!) : to - 31 * 24 * 3_600_000
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > MAX_SPAN_MS) return jsonError('Bad range', 400)
    // Окно «до сейчас» кэшируется по началу: повторные открытия вкладки не перечитывают таблицу.
    const key = params.get('to') ? `${from}:${to}` : `${from}:now`
    try {
        if (!cache || cache.key !== key || Date.now() - cache.at > CACHE_MS) cache = { key, at: Date.now(), rows: await load(from, to) }
        return NextResponse.json({ outages: cache.rows, minOutageMinutes: MIN_OUTAGE_MS / 60_000 }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
        return jsonError('Отключения оборудования временно недоступны', 503)
    }
}
