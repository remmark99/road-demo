import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { isConversationId } from '@/lib/assistant/conversations'
import { localTime } from '@/lib/mcp/vector/args'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { sendReportEmail } from '@/lib/notifications/email'
import { NotificationDeliveryError, safeDeliveryError } from '@/lib/notifications/errors'
import { sendMaxFile } from '@/lib/notifications/max'
import { REPORT_FORMATS, ReportInputError, displayTime, normalizeReport, type ReportFormat } from '@/lib/reports/document'
import { renderReport } from '@/lib/reports/render'
import { sharedState } from '@/lib/server/shared-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Не чаще одной отправки в 15 секунд на пользователя: кнопку легко нажать дважды. */
const SEND_GAP_MS = 15_000
const lastSendAt = sharedState('report-send-times', () => new Map<string, number>())

const maskEmail = (email: string) => email.replace(/^(.).*(@.*)$/, '$1***$2')

/**
 * «Отправить» в настройках: готовый отчёт из истории ассистента уходит файлом
 * на почту или в MAX. Отчёт заново не собирается — берётся сохранённый.
 */
export async function POST(request: Request) {
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? 'Требуется авторизация' : 'Нет доступа' }, { status: access.status })

    const body = await request.json().catch(() => null) as { conversationId?: unknown; format?: unknown; channel?: unknown; email?: unknown } | null
    const format = REPORT_FORMATS.find(f => f === body?.format) as ReportFormat | undefined
    if (!format) return NextResponse.json({ error: 'Формат: pdf, xlsx или docx' }, { status: 400 })
    if (!isConversationId(body?.conversationId)) return NextResponse.json({ error: 'Сначала сформируйте отчёт' }, { status: 400 })
    const channel = body?.channel === 'email' || body?.channel === 'max' ? body.channel : null
    if (!channel) return NextResponse.json({ error: 'Куда отправить: email или max' }, { status: 400 })
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (channel === 'email' && (!EMAIL_PATTERN.test(email) || email.length > 320)) {
        return NextResponse.json({ error: 'Укажите адрес почты' }, { status: 400 })
    }

    const now = Date.now()
    if (now - (lastSendAt.get(access.user.id) ?? 0) < SEND_GAP_MS) {
        return NextResponse.json({ error: 'Отчёт только что отправлен. Повторить можно через несколько секунд.' }, { status: 429 })
    }

    // Диалог читается от имени пользователя: чужой отчёт отправить нельзя.
    const conversation = await access.db.from('assistant_conversations').select('messages')
        .eq('id', body!.conversationId as string).eq('user_id', access.user.id).maybeSingle()
    if (conversation.error) return NextResponse.json({ error: 'История ассистента временно недоступна' }, { status: 503 })
    const messages = Array.isArray(conversation.data?.messages) ? conversation.data.messages as { parts?: { type?: string; output?: { report?: unknown } | null }[] }[] : []
    const stored = messages.flatMap(message => message.parts ?? []).reverse().find(part => part.type === 'tool-create_report' && part.output?.report)?.output?.report
    if (!stored) return NextResponse.json({ error: 'Отчёт не найден. Сформируйте его заново.' }, { status: 404 })

    try {
        const stamp = (stored as { generatedAt?: unknown }).generatedAt
        const generatedAt = typeof stamp === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(stamp) ? stamp : localTime(now) ?? ''
        const report = normalizeReport(stored, generatedAt)
        const rendered = renderReport(report, format)
        const file = { content: Buffer.from(rendered.body as Uint8Array), contentType: rendered.contentType }

        lastSendAt.set(access.user.id, now)
        if (channel === 'email') {
            await sendReportEmail(email, { title: report.title, subtitle: report.subtitle, generatedAt: displayTime(report.generatedAt), summary: report.summary, file: { filename: rendered.fileName, ...file } })
            console.info(`Report sent by email (${format}, ${file.content.length} bytes)`)
            return NextResponse.json({ ok: true, message: `Отчёт отправлен на ${maskEmail(email)}` })
        }

        const preference = await createNotificationAdminClient().from('notification_preferences')
            .select('max_user_id,max_enabled').eq('user_id', access.user.id).maybeSingle()
        if (preference.error) throw preference.error
        if (!preference.data?.max_enabled || !preference.data.max_user_id) {
            lastSendAt.delete(access.user.id)
            return NextResponse.json({ error: 'MAX не подключён. Подключите его ниже, в уведомлениях.' }, { status: 409 })
        }
        const caption = [report.title, report.subtitle, `Сформирован: ${displayTime(report.generatedAt)} (время Сургута)`].filter(Boolean).join('\n')
        await sendMaxFile(String(preference.data.max_user_id), caption, { fileName: rendered.fileName, ...file })
        console.info(`Report sent to MAX (${format}, ${file.content.length} bytes)`)
        return NextResponse.json({ ok: true, message: 'Отчёт отправлен в MAX' })
    } catch (error) {
        lastSendAt.delete(access.user.id)
        if (error instanceof ReportInputError) return NextResponse.json({ error: error.message }, { status: 400 })
        console.error('Report send failed:', safeDeliveryError(error))
        const configured = !(error instanceof NotificationDeliveryError) || !/not configured/i.test(error.message)
        return NextResponse.json({ error: configured
            ? (channel === 'email' ? 'Не удалось отправить письмо. Проверьте адрес и попробуйте ещё раз.' : 'Не удалось отправить в MAX. Попробуйте ещё раз.')
            : (channel === 'email' ? 'Почта на сервере не настроена' : 'Бот MAX на сервере не настроен') }, { status: 502 })
    }
}
