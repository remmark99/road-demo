import { NextResponse } from 'next/server'
import { MAX_REPORT_PROMPT_CHARS } from '@/lib/assistant/limits'
import { UNDEFINED_COLUMN, readReportPrompt } from '@/lib/assistant/report-prompt'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { getAuthenticatedUser, jsonError } from '@/lib/notifications/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** «Запрос для отчёта» в настройках: у каждого пользователя свой. */
export async function GET() {
    const user = await getAuthenticatedUser()
    if (!user) return jsonError('Требуется авторизация', 401)
    return NextResponse.json({ prompt: await readReportPrompt(createNotificationAdminClient(), user.id) ?? '' })
}

export async function PUT(request: Request) {
    const user = await getAuthenticatedUser()
    if (!user) return jsonError('Требуется авторизация', 401)
    const body = await request.json().catch(() => null) as { prompt?: unknown } | null
    if (!body || (typeof body.prompt !== 'string' && body.prompt !== null)) return jsonError('Нужен текст запроса', 400)
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (prompt.length > MAX_REPORT_PROMPT_CHARS) return jsonError(`Запрос длиннее ${MAX_REPORT_PROMPT_CHARS} символов`, 400)
    const { error } = await createNotificationAdminClient().from('profiles').update({ report_prompt: prompt || null }).eq('id', user.id)
    if (error) {
        if (error.code === UNDEFINED_COLUMN) return jsonError('Сохранение запроса заработает после обновления базы', 503)
        console.error('Report prompt save failed:', error.code ?? error.message)
        return jsonError('Не удалось сохранить запрос', 503)
    }
    return NextResponse.json({ prompt })
}
