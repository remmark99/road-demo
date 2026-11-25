import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { jsonError } from '@/lib/notifications/http'
import { SCHEDULE_COLUMNS, scheduleFromRow, scheduleTableMissing, type ScheduleRow } from '@/lib/reports/scheduled-run'
import { ScheduleInputError, lastSlot, nextSlot, parseReportSchedule } from '@/lib/reports/schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function payload(row: ScheduleRow | null, now: number) {
    const schedule = scheduleFromRow(row)
    return {
        schedule,
        nextAt: schedule.enabled ? new Date(nextSlot(schedule, now)).toISOString() : null,
        last: row?.last_status ? { status: row.last_status, message: row.last_message, at: row.last_run_at } : null,
    }
}

/** Рассылка сводного отчёта по расписанию: у каждого пользователя своя. */
export async function GET() {
    const access = await assistantUser()
    if (access.status !== 200) return jsonError(access.status === 401 ? 'Требуется авторизация' : 'Нет доступа', access.status)
    const { data, error } = await createNotificationAdminClient().from('report_schedules').select(SCHEDULE_COLUMNS).eq('user_id', access.user.id).maybeSingle()
    if (error && !scheduleTableMissing(error)) {
        console.error('Report schedule read failed:', error.code ?? error.message)
        return jsonError('Не удалось прочитать настройки рассылки', 503)
    }
    return NextResponse.json({ ...payload((data as ScheduleRow | null) ?? null, Date.now()), available: !error })
}

export async function PUT(request: Request) {
    const access = await assistantUser()
    if (access.status !== 200) return jsonError(access.status === 401 ? 'Требуется авторизация' : 'Нет доступа', access.status)
    let schedule
    try {
        schedule = parseReportSchedule(await request.json().catch(() => null))
    } catch (error) {
        if (error instanceof ScheduleInputError) return jsonError(error.message, 400)
        throw error
    }
    const now = Date.now()
    const db = createNotificationAdminClient()
    // Ближайший прошедший момент расписания считается уже отработанным: после сохранения
    // отчёт придёт в следующий назначенный срок, а не сразу.
    const { data, error } = await db.from('report_schedules').upsert({
        user_id: access.user.id, enabled: schedule.enabled, frequency: schedule.frequency, weekday: schedule.weekday,
        send_time: schedule.time, format: schedule.format, to_email: schedule.toEmail, email: schedule.email || null,
        to_max: schedule.toMax, last_slot_at: new Date(lastSlot(schedule, now)).toISOString(), updated_at: new Date(now).toISOString(),
    }, { onConflict: 'user_id' }).select(SCHEDULE_COLUMNS).single()
    if (error) {
        if (scheduleTableMissing(error)) return jsonError('Рассылка заработает после обновления базы', 503)
        console.error('Report schedule save failed:', error.code ?? error.message)
        return jsonError('Не удалось сохранить настройки рассылки', 503)
    }
    return NextResponse.json({ ...payload(data as ScheduleRow, now), available: true })
}
