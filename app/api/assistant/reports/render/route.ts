import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { localTime } from '@/lib/mcp/vector/args'
import { REPORT_FORMATS, ReportInputError, normalizeReport, type ReportFormat } from '@/lib/reports/document'
import { reportResponse } from '@/lib/reports/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 1_000_000

/**
 * Файл отчёта из карточки в чате: отчёт уже собран инструментом create_report,
 * здесь он ещё раз проверяется и превращается в PDF, Excel или Word. Базу не читает.
 */
export async function POST(request: Request) {
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? 'Требуется авторизация' : 'Нет доступа' }, { status: access.status })
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Отчёт слишком большой' }, { status: 413 })
    let body: { format?: unknown; report?: unknown }
    try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 }) }
    const format = REPORT_FORMATS.find(f => f === body.format) as ReportFormat | undefined
    if (!format) return NextResponse.json({ error: 'Формат: pdf, xlsx или docx' }, { status: 400 })
    const stamp = (body.report as { generatedAt?: unknown } | null)?.generatedAt
    const generatedAt = typeof stamp === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(stamp) ? stamp : localTime(Date.now()) ?? ''
    try {
        return reportResponse(normalizeReport(body.report, generatedAt), format)
    } catch (error) {
        if (error instanceof ReportInputError) return NextResponse.json({ error: error.message }, { status: 400 })
        console.error('Report render failed:', error instanceof Error ? error.message : 'unknown error')
        return NextResponse.json({ error: 'Не удалось сформировать файл' }, { status: 500 })
    }
}
