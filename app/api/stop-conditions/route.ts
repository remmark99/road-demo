import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStopConditionsCached, parseConditionWindow } from '@/lib/stop-conditions-data'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const db = await createClient()
    const { data: { user }, error } = await db.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Войдите в систему' }, { status: 401 })
    const profile = await db.from('profiles').select('role,modules').eq('id', user.id).single()
    if (profile.error || !profile.data || (profile.data.role !== 'admin' && !profile.data.modules?.includes('stops'))) {
        return NextResponse.json({ error: 'Нет доступа к остановкам' }, { status: 403 })
    }
    const now = Date.now()
    let window: ReturnType<typeof parseConditionWindow>
    try { window = parseConditionWindow(request.nextUrl.searchParams, now) }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

    try {
        const payload = await getStopConditionsCached(db, window.start, window.end, window.liveEnd)
        return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (e) {
        console.error('Stop conditions failed:', e instanceof Error ? e.message : 'unknown error')
        return NextResponse.json({ error: 'Состояние остановок временно недоступно' }, { status: 503 })
    }
}
