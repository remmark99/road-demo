import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'

export const dynamic = 'force-dynamic'

/** Список своих диалогов, свежие сверху. Остальное отсекает RLS. */
export async function GET() {
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: 'Нет доступа' }, { status: access.status })
    const { data, error } = await access.db.from('assistant_conversations')
        .select('id,title,updated_at').eq('user_id', access.user.id).order('updated_at', { ascending: false }).limit(200)
    if (error) return NextResponse.json({ error: 'История недоступна' }, { status: 503 })
    return NextResponse.json({ conversations: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
