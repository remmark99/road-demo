import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { LimitInputError, readUsageSummary, updateMonthlyLimit } from '@/lib/assistant/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function denied(status: 401 | 403) {
    return NextResponse.json({ error: status === 401 ? 'Требуется авторизация' : 'Нет доступа' }, { status })
}

/** Токены ассистента за текущий месяц и лимит — полоска в окне чата. */
export async function GET() {
    const access = await assistantUser()
    if (access.status !== 200) return denied(access.status)
    return NextResponse.json(await readUsageSummary(access.db, access.user.id), { headers: { 'Cache-Control': 'no-store' } })
}

/** Новый месячный лимит: { limitTokens } — только администратор. */
export async function PUT(request: Request) {
    const access = await assistantUser()
    if (access.status !== 200) return denied(access.status)
    const body = await request.json().catch(() => null) as { limitTokens?: unknown } | null
    try {
        const result = await updateMonthlyLimit(access.db, access.user.id, body?.limitTokens)
        if (result.status !== 200) return denied(result.status)
        return NextResponse.json(result.summary)
    } catch (error) {
        if (error instanceof LimitInputError) return NextResponse.json({ error: error.message }, { status: 400 })
        console.error('Assistant limit update failed:', error instanceof Error ? error.message : 'unknown error')
        return NextResponse.json({ error: 'Не удалось сохранить лимит' }, { status: 500 })
    }
}
