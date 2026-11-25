import { after, NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { jsonError } from '@/lib/notifications/http'
import { SCHEDULE_COLUMNS, runScheduledReport, scheduleTableMissing, type ScheduleRow } from '@/lib/reports/scheduled-run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Отчёт собирается около минуты: пока идёт сборка, вторую не запускаем. */
const RUNNING_FOR_MS = 5 * 60_000

/**
 * «Отправить сейчас» в настройках: отчёт по сохранённым настройкам собирается
 * и уходит на выбранные каналы, не дожидаясь расписания. Ответ приходит сразу,
 * сборка идёт в фоне; результат виден в настройках строкой «Последняя отправка».
 */
export async function POST() {
    const access = await assistantUser()
    if (access.status !== 200) return jsonError(access.status === 401 ? 'Требуется авторизация' : 'Нет доступа', access.status)
    const db = createNotificationAdminClient()
    const { data, error } = await db.from('report_schedules').select(SCHEDULE_COLUMNS).eq('user_id', access.user.id).maybeSingle()
    if (error) return jsonError(scheduleTableMissing(error) ? 'Рассылка заработает после обновления базы' : 'Не удалось прочитать настройки рассылки', 503)
    const row = data as ScheduleRow | null
    if (!row) return jsonError('Сначала сохраните настройки рассылки', 409)
    if (!row.to_email && !row.to_max) return jsonError('Выберите, куда присылать отчёт: на почту или в MAX', 409)
    if (row.last_status === 'running' && row.last_run_at && Date.now() - Date.parse(row.last_run_at) < RUNNING_FOR_MS) {
        return jsonError('Отчёт уже собирается — он придёт через минуту-две', 429)
    }
    // Отметка ставится до ответа: повторное нажатие сразу увидит, что сборка идёт.
    await db.from('report_schedules').update({ last_status: 'running', last_message: null, last_run_at: new Date().toISOString() }).eq('user_id', access.user.id)
    const at = Date.now()
    after(() => runScheduledReport(db, row, at).then(() => undefined))
    return NextResponse.json({ ok: true, message: 'Отчёт собирается и придёт через минуту-две' })
}
