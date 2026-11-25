import { REPORT_FORMATS, type ReportFormat } from './document'

/** Расписание считается по времени Сургута (UTC+5, без перевода часов). */
const OFFSET_MS = 5 * 3_600_000
const DAY_MS = 86_400_000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export type ReportFrequency = 'daily' | 'weekly'
export interface ReportSchedule {
    enabled: boolean
    frequency: ReportFrequency
    /** 1 — понедельник … 7 — воскресенье. */
    weekday: number
    /** «09:00» по Сургуту. */
    time: string
    format: ReportFormat
    toEmail: boolean
    email: string
    toMax: boolean
}

export const DEFAULT_REPORT_SCHEDULE: ReportSchedule = {
    enabled: false, frequency: 'weekly', weekday: 1, time: '09:00', format: 'pdf', toEmail: true, email: '', toMax: false,
}
export const WEEKDAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']

export class ScheduleInputError extends Error {}

/** Проверка того, что прислала страница настроек. */
export function parseReportSchedule(input: unknown): ReportSchedule {
    if (!input || typeof input !== 'object') throw new ScheduleInputError('Нужны настройки рассылки')
    const raw = input as Record<string, unknown>
    const frequency = raw.frequency === 'daily' || raw.frequency === 'weekly' ? raw.frequency : null
    if (!frequency) throw new ScheduleInputError('Периодичность: каждый день или раз в неделю')
    const weekday = Number(raw.weekday)
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new ScheduleInputError('Выберите день недели')
    if (typeof raw.time !== 'string' || !TIME_PATTERN.test(raw.time)) throw new ScheduleInputError('Укажите время отправки')
    const format = REPORT_FORMATS.find(item => item === raw.format)
    if (!format) throw new ScheduleInputError('Формат: PDF, Excel или Word')
    const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
    const toEmail = raw.toEmail === true, toMax = raw.toMax === true, enabled = raw.enabled === true
    if (toEmail && (!EMAIL_PATTERN.test(email) || email.length > 320)) throw new ScheduleInputError('Укажите адрес почты')
    if (enabled && !toEmail && !toMax) throw new ScheduleInputError('Выберите, куда присылать отчёт: на почту или в MAX')
    return { enabled, frequency, weekday, time: raw.time, format, toEmail, email, toMax }
}

/** Последний момент расписания, не позже `now`. */
export function lastSlot(schedule: Pick<ReportSchedule, 'frequency' | 'weekday' | 'time'>, now: number): number {
    const local = now + OFFSET_MS
    const dayStart = Math.floor(local / DAY_MS) * DAY_MS
    const [hours, minutes] = schedule.time.split(':').map(Number)
    const atTime = hours * 3_600_000 + minutes * 60_000
    let slot = dayStart + atTime
    if (schedule.frequency === 'daily') {
        if (slot > local) slot -= DAY_MS
    } else {
        // getUTCDay: 0 — воскресенье; приводим к 1 — понедельник … 7 — воскресенье.
        const today = (new Date(dayStart).getUTCDay() + 6) % 7 + 1
        slot -= ((today - schedule.weekday + 7) % 7) * DAY_MS
        if (slot > local) slot -= 7 * DAY_MS
    }
    return slot - OFFSET_MS
}

export function nextSlot(schedule: Pick<ReportSchedule, 'frequency' | 'weekday' | 'time'>, now: number): number {
    return lastSlot(schedule, now) + (schedule.frequency === 'daily' ? DAY_MS : 7 * DAY_MS)
}

/** Сколько можно опоздать с отправкой: после долгого простоя сайта старый отчёт не досылается. */
export const LATE_LIMIT_MS = 3 * 3_600_000

/** Момент расписания, за который пора отправить отчёт, или null. */
export function dueSlot(schedule: Pick<ReportSchedule, 'frequency' | 'weekday' | 'time'>, lastSlotAt: number | null, now: number): number | null {
    const slot = lastSlot(schedule, now)
    if (lastSlotAt !== null && lastSlotAt >= slot) return null
    return now - slot <= LATE_LIMIT_MS ? slot : null
}

/**
 * Период отчёта — по периодичности: ежедневный — за вчерашний день,
 * еженедельный — за семь дней до дня отправки. День отправки не входит: он ещё не закончился.
 */
export function reportPeriod(frequency: ReportFrequency, at: number): { from: string; to: string } {
    const day = (shift: number) => new Date(Math.floor((at + OFFSET_MS) / DAY_MS) * DAY_MS - shift * DAY_MS).toISOString().slice(0, 10)
    return { from: day(frequency === 'daily' ? 1 : 7), to: day(1) }
}

/** «по понедельникам в 09:00» / «каждый день в 09:00». */
export function describeSchedule(schedule: Pick<ReportSchedule, 'frequency' | 'weekday' | 'time'>): string {
    const days = ['по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам', 'по воскресеньям']
    return `${schedule.frequency === 'daily' ? 'каждый день' : days[schedule.weekday - 1]} в ${schedule.time}`
}
