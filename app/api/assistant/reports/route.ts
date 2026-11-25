import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { UIMessage } from 'ai'
import { assistantUser } from '@/lib/assistant/access'
import { saveConversation } from '@/lib/assistant/conversations'
import { reportQuestion } from '@/lib/assistant/report-prompt'
import { readUsageSummary, recordUsage } from '@/lib/assistant/usage'
import { budgetExhausted, exhaustedMessage } from '@/lib/assistant/usage-shared'
import { assistantConfigured, generateVectorReport } from '@/lib/assistant/vector-assistant'
import { REPORT_FORMATS, type ReportFormat } from '@/lib/reports/document'
import { reportResponse } from '@/lib/reports/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_PERIOD_DAYS = 92

/**
 * «Сформировать отчёт» в настройках: ассистент собирает отчёт по запросу
 * пользователя за период, ответ — сам файл. Диалог сохраняется в историю чата,
 * чтобы отчёт можно было открыть и скачать в других форматах.
 */
export async function POST(request: Request) {
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? 'Требуется авторизация' : 'Отчёты доступны пользователям модуля «Остановочные павильоны»' }, { status: access.status })
    if (!assistantConfigured()) return NextResponse.json({ error: 'ИИ-ассистент не настроен на сервере' }, { status: 503 })

    const body = await request.json().catch(() => null) as { prompt?: unknown; format?: unknown; period?: { from?: unknown; to?: unknown } } | null
    const format = REPORT_FORMATS.find(f => f === body?.format) as ReportFormat | undefined
    if (!format) return NextResponse.json({ error: 'Формат: pdf, xlsx или docx' }, { status: 400 })
    const from = body?.period?.from, to = body?.period?.to
    if (typeof from !== 'string' || typeof to !== 'string' || !DAY.test(from) || !DAY.test(to) || from > to) {
        return NextResponse.json({ error: 'Выберите период отчёта' }, { status: 400 })
    }
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 >= MAX_PERIOD_DAYS) {
        return NextResponse.json({ error: `Период отчёта — не больше ${MAX_PERIOD_DAYS} дней` }, { status: 400 })
    }
    const question = reportQuestion(from, to, typeof body?.prompt === 'string' ? body.prompt : '')

    const budget = await readUsageSummary(access.db, access.user.id)
    if (budgetExhausted(budget)) return NextResponse.json({ error: exhaustedMessage(budget) }, { status: 429 })

    try {
        const result = await generateVectorReport(question, { db: access.db, now: Date.now() }, {
            onUsage: usage => recordUsage(access.db, access.user.id, { source: 'report', usage }).then(() => undefined),
        })
        if (!result.report) {
            // Например, запрос не про остановки — тогда модель отвечает отбивкой.
            return NextResponse.json({ error: result.text || result.error || 'Ассистент не собрал отчёт. Уточните запрос.' }, { status: 422 })
        }
        const conversationId = randomUUID()
        const messages = [
            { id: randomUUID(), role: 'user', parts: [{ type: 'text', text: question }] },
            { id: randomUUID(), role: 'assistant', parts: [
                { type: 'tool-create_report', toolCallId: 'report', state: 'output-available', input: {}, output: { report: result.report } },
                { type: 'text', text: result.text || 'Отчёт готов.' },
            ] },
        ] as UIMessage[]
        await saveConversation(access.db, access.user.id, conversationId, messages)
        const response = reportResponse(result.report, format)
        response.headers.set('X-Conversation-Id', conversationId)
        return response
    } catch (error) {
        console.error('Settings report failed:', error instanceof Error ? error.message : 'unknown error')
        return NextResponse.json({ error: 'Ассистент сейчас не отвечает. Попробуйте ещё раз через минуту.' }, { status: 502 })
    }
}
