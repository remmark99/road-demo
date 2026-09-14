import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const db = await createClient()
    const { data: { user }, error } = await db.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Войдите в систему' }, { status: 401 })
    const profile = await db.from('profiles').select('role,modules').eq('id', user.id).single()
    if (profile.error || !profile.data || (profile.data.role !== 'admin' && !profile.data.modules?.includes('stops'))) {
        return NextResponse.json({ error: 'Нет доступа к остановкам' }, { status: 403 })
    }
    // One immutable response is used for the whole playback, not one request per tick.
    const now = new Date().toISOString()
    async function read(table: string, columns: string, order: string) {
        const rows: unknown[] = []
        for (let offset = 0; offset < 100_000; offset += 1000) {
            let query = db.from(table).select(columns).order(order)
            if (table === 'equipment_state') query = query.order('equipment_type')
            const result = await query.range(offset, offset + 999)
            if (result.error) throw new Error(table)
            rows.push(...(result.data ?? []))
            if (!result.data || result.data.length < 1000) return rows
        }
        throw new Error('History limit')
    }
    try {
        const [states, outages] = await Promise.all([
            read('equipment_state', 'equipment_type,equipment_id,bus_stop_id,location_id,stop_name,status,status_since,updated_at', 'equipment_id'),
            read('equipment_outages', 'id,equipment_type,equipment_id,bus_stop_id,location_id,started_at,ended_at,resolution', 'id'),
        ])
        return NextResponse.json({ now, states, outages }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch {
        return NextResponse.json({ error: 'История связи временно недоступна' }, { status: 503 })
    }
}
