import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'
import { isStopSensorsOnly } from '@/lib/access-scope'
import { saveConversation } from '@/lib/assistant/conversations'
import { readReportPrompt, reportQuestion } from '@/lib/assistant/report-prompt'
import { readUsageSummary, recordUsage } from '@/lib/assistant/usage'
import { budgetExhausted } from '@/lib/assistant/usage-shared'
import { assistantConfigured, generateVectorReport } from '@/lib/assistant/vector-assistant'
import { sendReportEmail } from '@/lib/notifications/email'
import { safeDeliveryError } from '@/lib/notifications/errors'
import { sendMaxFile } from '@/lib/notifications/max'
import { displayTime } from './document'
import { renderReport } from './render'
import { DEFAULT_REPORT_SCHEDULE, dueSlot, reportPeriod, type ReportSchedule } from './schedule'

/** Postgres/PostgREST: таблицы ещё нет — миграция sql/report_schedules_schema.sql не применена. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])
export const scheduleTableMissing = (error: { code?: string } | null | undefined) => Boolean(error?.code && MISSING_TABLE.has(error.code))

export interface ScheduleRow {
    user_id: string
    enabled: boolean
    frequency: ReportSchedule['frequency']
    weekday: number
    send_time: string
    format: ReportSchedule['format']
    to_email: boolean
    email: string | null
    to_max: boolean
    last_slot_at: string | null
    last_run_at: string | null
    last_status: string | null
    last_message: string | null
}
export const SCHEDULE_COLUMNS = 'user_id,enabled,frequency,weekday,send_time,format,to_email,email,to_max,last_slot_at,last_run_at,last_status,last_message'

export function scheduleFromRow(row: ScheduleRow | null | undefined): ReportSchedule {
    if (!row) return { ...DEFAULT_REPORT_SCHEDULE }
    return {
        enabled: row.enabled, frequency: row.frequency, weekday: row.weekday, time: row.send_time,
        format: row.format, toEmail: row.to_email, email: row.email ?? '', toMax: row.to_max,
    }
}

const EMAIL_ATTEMPTS = 3
const EMAIL_RETRY_MS = 5_000

export interface ScheduledRunResult { status: 'sent' | 'partial' | 'failed'; message: string }

/**
 * Собирает отчёт по сохранённому запросу пользователя и отправляет его файлом
 * на выбранные каналы. Период — по периодичности, считая от момента `at`.
 * Диалог сохраняется в историю ассистента, как у отчёта из чата.
 */
export async function deliverScheduledReport(db: SupabaseClient, row: ScheduleRow, at: number): Promise<ScheduledRunResult> {
    const fail = (message: string): ScheduledRunResult => ({ status: 'failed', message })
    if (!row.to_email && !row.to_max) return fail('Не выбрано, куда присылать отчёт')
    if (!assistantConfigured()) return fail('ИИ-ассистент не настроен на сервере')

    // Те же условия, что у ассистента: модуль «Остановки» или администратор; учётке «только датчики» отчёт не положен.
    const [profile, account] = await Promise.all([
        db.from('profiles').select('role,modules').eq('id', row.user_id).maybeSingle(),
        db.auth.admin.getUserById(row.user_id),
    ])
    const allowed = profile.data && (profile.data.role === 'admin' || profile.data.modules?.includes('stops'))
    if (profile.error || account.error || !account.data?.user || !allowed || isStopSensorsOnly(account.data.user)) {
        return fail('Нет доступа к отчётам по остановкам')
    }
    if (budgetExhausted(await readUsageSummary(db, row.user_id))) return fail('Месячный лимит ИИ-ассистента исчерпан')

    const period = reportPeriod(row.frequency, at)
    const wish = await readReportPrompt(db, row.user_id)
    const generate = (text: string | null) => generateVectorReport(reportQuestion(period.from, period.to, text), { db, now: Date.now() }, {
        onUsage: usage => recordUsage(db, row.user_id, { source: 'report', usage }).then(() => undefined),
    })
    let question = reportQuestion(period.from, period.to, wish)
    let result: Awaited<ReturnType<typeof generateVectorReport>> | null = null
    try {
        result = await generate(wish)
    } catch (error) {
        console.error('Scheduled report generation failed:', error instanceof Error ? error.message : 'unknown error')
    }
    // Запрос не про остановки («погода на завтра») модель отклоняет, а сбой бывает разовым.
    // Человек нажал «Отправить» и ждёт письмо — тогда собираем стандартный сводный отчёт.
    let standard = false
    if (!result?.report) {
        // Модель ответила, но без отчёта — значит, запрос ей не подошёл; при сбое сети это не так.
        const declined = result !== null
        try {
            const retry = await generate(null)
            if (retry.report) {
                result = retry
                question = reportQuestion(period.from, period.to, null)
                standard = Boolean(wish) && declined
            }
        } catch (error) {
            console.error('Scheduled report fallback failed:', error instanceof Error ? error.message : 'unknown error')
            return fail('Ассистент не ответил, отчёт не собран')
        }
    }
    if (!result?.report) return fail('Ассистент не собрал отчёт, попробуйте ещё раз')

    const messages = [
        { id: randomUUID(), role: 'user', parts: [{ type: 'text', text: question }] },
        { id: randomUUID(), role: 'assistant', parts: [
            { type: 'tool-create_report', toolCallId: 'report', state: 'output-available', input: {}, output: { report: result.report } },
            { type: 'text', text: result.text || 'Отчёт готов.' },
        ] },
    ] as UIMessage[]
    await saveConversation(db, row.user_id, randomUUID(), messages)

    const report = result.report
    const rendered = renderReport(report, row.format)
    const file = { content: Buffer.from(rendered.body as Uint8Array), contentType: rendered.contentType }
    const done: string[] = [], failed: string[] = []

    if (row.to_email) {
        try {
            if (!row.email) throw new Error('no address')
            const letter = { title: report.title, subtitle: report.subtitle, generatedAt: displayTime(report.generatedAt), summary: report.summary, file: { filename: rendered.fileName, ...file } }
            // Отчёт уже собран — из-за разового сбоя сети его не теряем: до трёх попыток.
            for (let attempt = 1; ; attempt += 1) {
                try {
                    await sendReportEmail(row.email, letter)
                    break
                } catch (error) {
                    if (attempt >= EMAIL_ATTEMPTS) throw error
                    await new Promise(resolve => setTimeout(resolve, EMAIL_RETRY_MS))
                }
            }
            done.push('на почту')
        } catch (error) {
            console.error('Scheduled report email failed:', safeDeliveryError(error))
            failed.push('почта — письмо не отправлено')
        }
    }
    if (row.to_max) {
        try {
            const preference = await db.from('notification_preferences').select('max_user_id,max_enabled').eq('user_id', row.user_id).maybeSingle()
            if (preference.error) throw preference.error
            if (!preference.data?.max_enabled || !preference.data.max_user_id) failed.push('MAX не подключён')
            else {
                const caption = [report.title, report.subtitle, `Сформирован: ${displayTime(report.generatedAt)} (время Сургута)`].filter(Boolean).join('\n')
                await sendMaxFile(String(preference.data.max_user_id), caption, { fileName: rendered.fileName, ...file })
                done.push('в MAX')
            }
        } catch (error) {
            console.error('Scheduled report MAX failed:', safeDeliveryError(error))
            failed.push('MAX — сообщение не отправлено')
        }
    }
    console.info(`Scheduled report: ${done.length} sent, ${failed.length} failed (${row.format}, ${file.content.length} bytes)`)
    if (!done.length) return fail(`Отчёт собран, но не отправлен: ${failed.join('; ')}`)
    const note = standard ? '. Запрос не про остановки — отправлен стандартный сводный отчёт' : ''
    return { status: failed.length ? 'partial' : 'sent', message: `Отправлен ${done.join(' и ')}${failed.length ? `; ${failed.join('; ')}` : ''}${note}` }
}

/** Запуск с записью результата в строку расписания: его видно в настройках. */
export async function runScheduledReport(db: SupabaseClient, row: ScheduleRow, at: number): Promise<ScheduledRunResult> {
    await db.from('report_schedules').update({ last_status: 'running', last_message: null, last_run_at: new Date().toISOString() }).eq('user_id', row.user_id)
    let result: ScheduledRunResult
    try {
        result = await deliverScheduledReport(db, row, at)
    } catch (error) {
        console.error('Scheduled report failed:', error instanceof Error ? error.message : 'unknown error')
        result = { status: 'failed', message: 'Отчёт не отправлен: внутренняя ошибка' }
    }
    await db.from('report_schedules').update({ last_status: result.status, last_message: result.message.slice(0, 500), last_run_at: new Date().toISOString() }).eq('user_id', row.user_id)
    return result
}

/**
 * Проход планировщика: кому пора — тому собираем и отправляем отчёт.
 * Момент расписания сначала «занимается» условным обновлением, поэтому
 * два процесса (или два прохода) не отправят один отчёт дважды.
 */
export async function runDueReportSchedules(db: SupabaseClient, now = Date.now()): Promise<number> {
    const { data, error } = await db.from('report_schedules').select(SCHEDULE_COLUMNS).eq('enabled', true)
    if (error) {
        if (!scheduleTableMissing(error)) console.error('Report schedules read failed:', error.code ?? error.message)
        return 0
    }
    let started = 0
    for (const row of (data ?? []) as ScheduleRow[]) {
        const slot = dueSlot(scheduleFromRow(row), row.last_slot_at ? Date.parse(row.last_slot_at) : null, now)
        if (slot === null) continue
        const slotIso = new Date(slot).toISOString()
        const claim = await db.from('report_schedules').update({ last_slot_at: slotIso })
            .eq('user_id', row.user_id).eq('enabled', true)
            .or(`last_slot_at.is.null,last_slot_at.lt.${slotIso}`).select('user_id')
        if (claim.error || !claim.data?.length) continue
        started += 1
        // Отчёты собираются по очереди: каждый — около минуты работы модели.
        await runScheduledReport(db, row, slot)
    }
    return started
}
