import type { SupabaseClient } from '@supabase/supabase-js'

// Контроллеры теряют связь на минуту-две десятки тысяч раз в месяц: в аналитику и отчёты идут
// только перерывы от 10 минут и всё, что открыто сейчас.
export const MIN_OUTAGE_MS = 10 * 60_000
const PAGE = 1000
const CONCURRENCY = 8

export interface OutageRow {
    id: number
    equipment_type: 'camera' | 'controller'
    equipment_id: number
    bus_stop_id: number | null
    started_at: string
    ended_at: string | null
}

/** Отключения, задевающие окно [from, to), без коротких пропаданий. Таблица читается страницами параллельно. */
export async function readSignificantOutages(supabase: SupabaseClient, from: number, to: number): Promise<OutageRow[]> {
    const filter = <T extends { lt: (c: string, v: string) => T; or: (f: string) => T }>(query: T) => query
        .lt('started_at', new Date(to).toISOString())
        .or(`ended_at.is.null,ended_at.gt."${new Date(from).toISOString()}"`)
    const { count, error } = await filter(supabase.from('equipment_outages').select('id', { count: 'exact', head: true }))
    if (error) throw new Error('Equipment outages unavailable')
    const pages = Math.ceil((count ?? 0) / PAGE)
    const rows: OutageRow[] = []
    for (let first = 0; first < pages; first += CONCURRENCY) {
        const batch = await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages - first) }, (_, offset) => {
            const page = first + offset
            return filter(supabase.from('equipment_outages').select('id,equipment_type,equipment_id,bus_stop_id,started_at,ended_at'))
                .order('id').range(page * PAGE, page * PAGE + PAGE - 1)
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
