// Окна, которыми вкладка «Аналитика» читает климат: 31 день кусками по 7 дней, границы — по часу.
// Куски по 7 дней дают почасовые срезы (до 192 срезов на запрос), а одинаковые границы у всех
// пользователей и у прогрева сервера попадают в один и тот же кэш.
const HOUR = 3_600_000
const DAY = 24 * HOUR
export const CLIMATE_DAYS = 31
const CHUNK_DAYS = 7

export function analyticsClimateChunks(now: number): [number, number][] {
    const end = Math.ceil(now / HOUR) * HOUR
    const start = end - CLIMATE_DAYS * DAY
    const chunks: [number, number][] = []
    for (let to = end; to > start; to -= CHUNK_DAYS * DAY) chunks.push([Math.max(start, to - CHUNK_DAYS * DAY), to])
    return chunks
}

/** Период, за который вкладка читает загруженность: 31 день до конца текущего часа.
 *  Границы по часу — чтобы запрос вкладки попадал в тот же кэш, что и прогрев сервера. */
export function analyticsLoadRange(now: number): [number, number] {
    const end = Math.ceil(now / HOUR) * HOUR
    return [end - CLIMATE_DAYS * DAY, end]
}
