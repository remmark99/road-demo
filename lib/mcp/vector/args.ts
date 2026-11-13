/** Проверка параметров инструментов MCP: модель присылает что угодно, отвечаем понятной ошибкой. */

export class ToolInputError extends Error {}

export type ToolArgs = Record<string, unknown>

export const SURGUT_OFFSET_MS = 5 * 3_600_000
const DAY = 86_400_000
export const MAX_PERIOD_DAYS = 92

export function textArg(args: ToolArgs, name: string, limit = 240): string {
    const value = args[name]
    if (typeof value !== 'string' || !value.trim()) throw new ToolInputError(`Нужен параметр ${name}`)
    if (value.length > limit) throw new ToolInputError(`Параметр ${name} слишком длинный`)
    return value.trim()
}

export function optionalText(args: ToolArgs, name: string, limit = 240): string | null {
    return args[name] === undefined || args[name] === null || args[name] === '' ? null : textArg(args, name, limit)
}

export function intArg(args: ToolArgs, name: string, fallback: number, low: number, high: number): number {
    const raw = args[name] ?? fallback
    // Модели иногда присылают числа строкой: «10» принимаем, «десять» нет.
    const value = typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw) : raw
    if (typeof value !== 'number' || !Number.isInteger(value) || value < low) {
        throw new ToolInputError(`Параметр ${name} должен быть целым числом не меньше ${low}`)
    }
    return Math.min(value, high)
}

export function boolArg(args: ToolArgs, name: string, fallback = false): boolean {
    const value = args[name] ?? fallback
    if (typeof value !== 'boolean') throw new ToolInputError(`Параметр ${name} должен быть true или false`)
    return value
}

export function enumArg<T extends string>(args: ToolArgs, name: string, allowed: readonly T[], fallback: T): T {
    const value = args[name] ?? fallback
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new ToolInputError(`Параметр ${name} должен быть одним из: ${allowed.join(', ')}`)
    }
    return value as T
}

export function enumListArg<T extends string>(args: ToolArgs, name: string, allowed: readonly T[]): T[] {
    const value = args[name]
    if (value === undefined || value === null) return [...allowed]
    const list = typeof value === 'string' ? [value] : value
    if (!Array.isArray(list) || list.some(item => typeof item !== 'string' || !allowed.includes(item as T))) {
        throw new ToolInputError(`Параметр ${name}: допустимы значения ${allowed.join(', ')}`)
    }
    return list.length ? [...new Set(list as T[])] : [...allowed]
}

/** Момент: ISO 8601 или дата YYYY-MM-DD (полночь по Сургуту). */
export function parseMoment(value: string, name: string): number {
    const day = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const time = day ? Date.parse(`${value}T00:00:00+05:00`) : Date.parse(value)
    if (!Number.isFinite(time)) throw new ToolInputError(`Параметр ${name}: нужна дата YYYY-MM-DD или ISO 8601`)
    return time
}

/**
 * Период запроса. Дата без времени в `to` включает весь этот день.
 * По умолчанию — последние сутки; не больше 92 дней.
 */
export function periodArgs(args: ToolArgs, now: number, defaultDays = 1) {
    const toText = optionalText(args, 'to', 40)
    const fromText = optionalText(args, 'from', 40)
    let to = toText ? parseMoment(toText, 'to') + (/^\d{4}-\d{2}-\d{2}$/.test(toText) ? DAY : 0) : now
    to = Math.min(to, now)
    const from = fromText ? parseMoment(fromText, 'from') : to - defaultDays * DAY
    if (from >= to) throw new ToolInputError('Начало периода должно быть раньше конца')
    if (to - from > MAX_PERIOD_DAYS * DAY) throw new ToolInputError(`Период не длиннее ${MAX_PERIOD_DAYS} дней`)
    return { from, to }
}

/** Время по Сургуту для ответа модели: «2026-11-13 18:40». */
export function localTime(ms: number | string | null | undefined): string | null {
    if (ms === null || ms === undefined) return null
    const time = typeof ms === 'string' ? Date.parse(ms) : ms
    if (!Number.isFinite(time)) return null
    return new Date(time + SURGUT_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')
}

export function localDay(ms: number): string {
    return new Date(ms + SURGUT_OFFSET_MS).toISOString().slice(0, 10)
}

export function minutesBetween(from: number, to: number) {
    return Math.max(0, Math.round((to - from) / 60_000))
}
