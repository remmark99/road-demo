/** Месячный лимит токенов ассистента: общее для сервера и окна чата (без серверных зависимостей). */

export const DEFAULT_MONTHLY_LIMIT_TOKENS = 100_000_000
export const LIMIT_MIN_TOKENS = 5_000_000
export const LIMIT_MAX_TOKENS = 300_000_000
export const LIMIT_STEP_TOKENS = 5_000_000

export interface AssistantUsageSummary {
    /** «2026-11» — месяц по Сургуту. */
    month: string
    /** Начало следующего месяца по Сургуту, ISO: с этого момента счётчик обнуляется. */
    resetsAt: string
    /** Токены модели за месяц: вход и выход вместе. */
    spentTokens: number
    limitTokens: number
    requests: number
    /** Прогноз к концу месяца при нынешнем темпе; null — в начале месяца. */
    forecastTokens: number | null
    /** Может менять лимит (администратор). */
    canEdit: boolean
    /** false — таблиц учёта в базе нет, счётчик в памяти сервера до перезапуска. */
    persisted: boolean
}

/** Метаданные ответа в окне чата: сколько токенов он занял. */
export interface AssistantMessageMetadata { tokens?: number }

export const SURGUT_OFFSET_MS = 5 * 3_600_000

/** Границы месяца по Сургуту, в котором лежит момент now. */
export function monthWindow(now: number) {
    const local = new Date(now + SURGUT_OFFSET_MS)
    const y = local.getUTCFullYear(), m = local.getUTCMonth()
    const from = Date.UTC(y, m, 1) - SURGUT_OFFSET_MS
    const to = Date.UTC(y, m + 1, 1) - SURGUT_OFFSET_MS
    return { month: `${y}-${String(m + 1).padStart(2, '0')}`, from, to }
}

export function budgetExhausted(summary: Pick<AssistantUsageSummary, 'spentTokens' | 'limitTokens'>) {
    return summary.spentTokens >= summary.limitTokens
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export function monthName(month: string) {
    return MONTHS[Number(month.slice(5, 7)) - 1] ?? month
}

/** «1 декабря» — когда лимит обновится. */
export function resetDay(resetsAt: string) {
    const local = new Date(Date.parse(resetsAt) + SURGUT_OFFSET_MS)
    return `${local.getUTCDate()} ${MONTHS_GENITIVE[local.getUTCMonth()]}`
}

function short(value: number) {
    return value.toLocaleString('ru-RU', { maximumFractionDigits: value >= 100 ? 0 : 1 })
}

/** «31,6 млн», «48 тыс.», «950» — без слова «токенов». */
export function formatTokens(value: number) {
    if (value >= 1_000_000) return `${short(value / 1_000_000)} млн`
    if (value >= 10_000) return `${short(value / 1000)} тыс.`
    return Math.round(value).toLocaleString('ru-RU')
}

export function exhaustedMessage(summary: Pick<AssistantUsageSummary, 'limitTokens' | 'month' | 'resetsAt'>) {
    return `Месячный лимит ИИ-ассистента на ${monthName(summary.month)} (${formatTokens(summary.limitTokens)} токенов) исчерпан. `
        + `Ассистент снова заработает ${resetDay(summary.resetsAt)} или раньше, если администратор увеличит лимит.`
}
