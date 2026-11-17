import { NextResponse } from 'next/server'

import { getAuthenticatedUser, jsonError } from '@/lib/notifications/http'
import { createClient } from '@/lib/supabase/server'
import { MIN_OUTAGE_MS, readSignificantOutages, type OutageRow } from '@/lib/exports/equipment-outages-read'

export const dynamic = 'force-dynamic'

const MAX_SPAN_MS = 93 * 24 * 3_600_000
const CACHE_MS = 5 * 60_000

let cache: { key: string; at: number; rows: OutageRow[] } | null = null

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
        if (!cache || cache.key !== key || Date.now() - cache.at > CACHE_MS) cache = { key, at: Date.now(), rows: await readSignificantOutages(await createClient(), from, to) }
        return NextResponse.json({ outages: cache.rows, minOutageMinutes: MIN_OUTAGE_MS / 60_000 }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
        return jsonError('Отключения оборудования временно недоступны', 503)
    }
}
