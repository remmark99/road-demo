import { CONDITION_LABELS } from '@/lib/stop-conditions'

/**
 * Карточка сводки в окне ассистента: цифры из вывода system_overview,
 * которые сервер кладёт рядом с текстом для модели. Общая для сервера и браузера.
 */
export interface OverviewSummary {
    /** Момент сводки по Сургуту, «2026-11-20 03:23». */
    asOf: string
    stops: { withCameras: number; withSensors: number }
    cameras: { online: number; total: number }
    controllers: { online: number; total: number }
    /** События безопасности за сутки по типам, по убыванию. */
    events: { label: string; count: number }[]
    binsFull: number
    conditions: { ok: number; warn: number; bad: number; unknown: number }
}

const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function equipment(value: unknown) {
    const data = record(value)
    return { online: count(record(data.by_status).online), total: count(data.total) }
}

/** Вывод system_overview → карточка; непохожий вывод карточки не даёт. */
export function overviewSummary(output: unknown): OverviewSummary | null {
    const data = record(output)
    if (typeof data.as_of !== 'string' || !data.cameras || !data.sensor_controllers) return null
    const stops = record(data.stops), levels = record(data.stop_conditions_now)
    return {
        asOf: data.as_of,
        stops: { withCameras: count(stops.with_cameras), withSensors: count(stops.with_sensors) },
        cameras: equipment(data.cameras),
        controllers: equipment(data.sensor_controllers),
        events: Object.entries(record(data.security_events_24h)).map(([label, value]) => ({ label, count: count(value) }))
            .filter(event => event.count > 0).sort((a, b) => b.count - a.count),
        binsFull: count(data.bins_full_now),
        conditions: {
            ok: count(levels[CONDITION_LABELS.ok]), warn: count(levels[CONDITION_LABELS.warn]),
            bad: count(levels[CONDITION_LABELS.bad]), unknown: count(levels[CONDITION_LABELS.unknown]),
        },
    }
}

/** Карточка из сохранённого диалога или потока: только если это действительно она. */
export function isOverviewSummary(value: unknown): value is OverviewSummary {
    const data = record(value)
    return typeof data.asOf === 'string' && typeof record(data.cameras).total === 'number' && typeof record(data.controllers).total === 'number'
        && Array.isArray(data.events) && typeof record(data.conditions).ok === 'number' && typeof record(data.stops).withCameras === 'number'
}

/** Что можно спросить дальше — по данным, которые ассистент только что смотрел. */
const FOLLOW_UPS: Record<string, string[]> = {
    system_overview: ['Сделай отчёт о состоянии павильонов за неделю', 'Нарисуй график событий безопасности по дням за неделю'],
    equipment_status: ['Какое оборудование чаще всего отключалось за неделю?', 'Нарисуй график самых долгих простоев за неделю'],
    equipment_outages: ['Нарисуй график самых долгих простоев за неделю', 'Что сейчас не в сети и сколько уже?'],
    stop_climate: ['Где температура вне нормы?', 'Где самая высокая влажность?', 'Нарисуй график самых холодных павильонов'],
    stop_conditions: ['Где в павильонах холоднее всего?', 'Какие урны переполнены прямо сейчас?'],
    security_events: ['Нарисуй график событий безопасности по дням за неделю', 'На каких остановках событий больше всего за неделю?'],
    bin_episodes: ['Нарисуй график переполнений урн по дням за неделю', 'Сводка по остановкам на сейчас'],
    passenger_load: ['Нарисуй график людей в кадре по часам', 'На каких остановках больше всего людей за неделю?'],
    districts_summary: ['Нарисуй график покрытия по микрорайонам', 'Сводка по остановкам на сейчас'],
    get_stop: ['Что сейчас не в сети и сколько уже?', 'Сводка по остановкам на сейчас'],
    create_chart: ['Сделай отчёт о состоянии павильонов за неделю', 'Сводка по остановкам на сейчас'],
}
const MAX_FOLLOW_UPS = 3

/** Подсказки под ответом: по использованным инструментам, без только что заданного вопроса. */
export function followUps(toolNames: string[], asked: string): string[] {
    const same = (a: string, b: string) => a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru')
    const result: string[] = []
    for (const name of [...toolNames].reverse()) {
        for (const question of FOLLOW_UPS[name] ?? []) {
            if (!same(question, asked) && !result.includes(question)) result.push(question)
        }
    }
    return result.slice(0, MAX_FOLLOW_UPS)
}
