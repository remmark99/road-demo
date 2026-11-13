import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { isConversationId } from '@/lib/assistant/conversations'

export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context) {
    const { id } = await context.params
    if (!isConversationId(id)) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: 'Нет доступа' }, { status: access.status })
    const { data, error } = await access.db.from('assistant_conversations').select('id,title,messages,updated_at').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ error: 'История недоступна' }, { status: 503 })
    if (!data) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function DELETE(_request: Request, context: Context) {
    const { id } = await context.params
    if (!isConversationId(id)) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: 'Нет доступа' }, { status: access.status })
    const { error } = await access.db.from('assistant_conversations').delete().eq('id', id)
    if (error) return NextResponse.json({ error: 'Не удалось удалить диалог' }, { status: 503 })
    return new NextResponse(null, { status: 204 })
}
