import type { SupabaseClient } from '@supabase/supabase-js'
import { sharedState } from '../server/shared-cache'

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

// Кэш процесса для аналитики: первое чтение — вся таблица за окно (~120 тыс. строк, секунды),
// дальше раз в две минуты дочитываются только открытые, новые и закрывшиеся с прошлого раза.
const REFRESH_MS = 2 * 60_000
// Состояние общее для процесса: прогрев и маршрут собираются отдельно и иначе держали бы по своей копии.
const state = sharedState('equipment-outages', () => ({
    cached: null as { from: number; syncedAt: number; rows: Map<number, OutageRow> } | null,
    pending: null as Promise<void> | null,
}))

const significant = (row: OutageRow) => row.ended_at === null || Date.parse(row.ended_at) - Date.parse(row.started_at) >= MIN_OUTAGE_MS

async function refresh(supabase: SupabaseClient, from: number): Promise<void> {
    const now = Date.now()
    const cached = state.cached
    if (!cached || from < cached.from) {
        const rows = await readSignificantOutages(supabase, from, now)
        state.cached = { from, syncedAt: now, rows: new Map(rows.map((row) => [row.id, row])) }
    } else if (now - cached.syncedAt > REFRESH_MS) {
        const since = new Date(cached.syncedAt - 5 * 60_000).toISOString()
        const { data, error } = await supabase.from('equipment_outages')
            .select('id,equipment_type,equipment_id,bus_stop_id,started_at,ended_at')
            .or(`ended_at.is.null,started_at.gt."${since}",ended_at.gt."${since}"`)
            .limit(20_000)
        if (error) throw new Error('Equipment outages unavailable')
        for (const row of (data ?? []) as OutageRow[]) {
            if (significant(row)) cached.rows.set(row.id, row)
            else cached.rows.delete(row.id)
        }
        cached.syncedAt = now
    }
}

/**
 * Отключения от 10 минут за окно [from, сейчас) из кэша процесса.
 * Если кэш уже покрывает окно, отдаём его сразу, а дочитываем в фоне: вкладка не ждёт базу.
 */
export async function readSignificantOutagesCached(supabase: SupabaseClient, from: number): Promise<OutageRow[]> {
    const covered = state.cached !== null && from >= state.cached.from
    const stale = !covered || Date.now() - state.cached!.syncedAt > REFRESH_MS
    if (stale) state.pending ??= refresh(supabase, from).finally(() => { state.pending = null })
    if (!covered && state.pending) await state.pending
    else state.pending?.catch(() => { /* фоновое дочитывание: ошибка не должна ронять процесс */ })
    // Пока шла чужая загрузка с более поздним началом, наше окно могло остаться непокрытым.
    if (!state.cached || from < state.cached.from) await refresh(supabase, from)
    return [...state.cached!.rows.values()].filter((row) => row.ended_at === null || Date.parse(row.ended_at) > from)
}
