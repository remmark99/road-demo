import { CONDITION_LABELS } from '@/lib/stop-conditions'
import { CHART_TYPES, CHART_TYPE_LABELS, STATUS_COLORS, chartNumber, normalizeChart, type ChartType, type ReportChart } from '@/lib/reports/chart'
import { ToolInputError, localDay, type ToolArgs } from './args'
import { VECTOR_TOOL_TITLES } from './titles'
import { EVENT_LABELS, SECURITY_TYPES, VECTOR_TOOLS, runVectorTool, type VectorTool, type VectorToolContext } from './tools'

/**
 * Графики по данным остановок. Модель выбирает готовый вид графика и форму
 * (столбцы, линия, круговая…), а цифры сервер берёт из инструментов данных —
 * модель их не переписывает и не может выдумать.
 */

type Output = Record<string, unknown>
type Row = Record<string, unknown>
interface ChartData { labels: string[]; series: { name: string; values: (number | null)[] }[]; labelColors?: (string | null)[]; unit?: string; note?: string }
interface ChartPreset {
    tool: string
    args: ToolArgs
    title: string
    type: ChartType
    /** Использует период from–to. */
    period?: boolean
    /** Нужна остановка (stop). */
    stop?: boolean
    build: (output: Output) => ChartData
}

const DAY = 86_400_000
const TOP = 10
const MAX_POINTS = 168

const rows = (output: Output, field: string) => (Array.isArray(output[field]) ? output[field] : []) as Row[]
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`
const shortTime = (time: string) => `${time.slice(8, 10)}.${time.slice(5, 7)} ${time.slice(11, 16)}`
const securityTypes = SECURITY_TYPES.map(type => EVENT_LABELS[type] ?? type)

/** Все дни периода (подписи по Сургуту), чтобы пустые дни были на графике нулями. */
function periodDays(output: Output): string[] {
    const period = output.period as { from?: string; to?: string } | undefined
    if (!period?.from || !period.to) return []
    const days: string[] = []
    const last = period.to.endsWith('00:00') ? Date.parse(`${period.to.slice(0, 10)}T00:00:00Z`) - DAY : Date.parse(`${period.to.slice(0, 10)}T00:00:00Z`)
    for (let day = Date.parse(`${period.from.slice(0, 10)}T00:00:00Z`); day <= last && days.length < 93; day += DAY) days.push(new Date(day).toISOString().slice(0, 10))
    return days
}

/** События по группам (дни, часы) с разбивкой по типам. */
function securitySeries(output: Output, keys: string[], format: (key: string) => string): ChartData {
    const groups = new Map(rows(output, 'groups').map(g => [String(g.key), g]))
    const present = securityTypes.filter(type => [...groups.values()].some(g => ((g.by_type ?? {}) as Record<string, number>)[type]))
    const series = present.length > 1
        ? present.map(type => ({ name: type, values: keys.map(key => ((groups.get(key)?.by_type ?? {}) as Record<string, number>)[type] ?? 0) }))
        : [{ name: present[0] ?? 'События', values: keys.map(key => number(groups.get(key)?.count) ?? 0) }]
    return { labels: keys.map(format), series, unit: 'событий' }
}

function topRows(list: Row[], label: (row: Row) => string, value: (row: Row) => number | null, name: string, unit?: string, limit = TOP): ChartData {
    const top = list.filter(row => value(row) !== null).slice(0, limit)
    return { labels: top.map(label), series: [{ name, values: top.map(value) }], ...(unit ? { unit } : {}) }
}

/** Почасовой ряд: если точек больше недели, усредняем по 4 часа или по дню. */
function hourly(list: Row[], field: 'temperature' | 'humidity', name: string, unit: string): ChartData {
    const points = list.map(row => ({ time: String(row.time ?? ''), value: number(row[field]) })).filter(p => p.time)
    const bucket = points.length <= MAX_POINTS ? 1 : points.length <= MAX_POINTS * 4 ? 4 : 24
    if (bucket === 1) return { labels: points.map(p => shortTime(p.time)), series: [{ name, values: points.map(p => p.value) }], unit }
    const groups = new Map<string, number[]>()
    for (const point of points) {
        const hour = Number(point.time.slice(11, 13))
        const key = bucket === 24 ? point.time.slice(0, 10) : `${point.time.slice(0, 11)}${String(hour - hour % 4).padStart(2, '0')}:00`
        const values = groups.get(key) ?? []
        if (point.value !== null) values.push(point.value)
        groups.set(key, values)
    }
    const keys = [...groups.keys()]
    return {
        labels: keys.map(key => bucket === 24 ? shortDay(key) : shortTime(key)),
        series: [{ name, values: keys.map(key => { const v = groups.get(key)!; return v.length ? Math.round(10 * v.reduce((a, b) => a + b, 0) / v.length) / 10 : null }) }],
        unit,
        note: bucket === 24 ? 'Среднее за сутки.' : 'Среднее за 4 часа.',
    }
}

const STATUS_ORDER = [['online', 'В сети', STATUS_COLORS.good], ['offline', 'Не в сети', STATUS_COLORS.critical], ['unknown', 'Нет данных', STATUS_COLORS.neutral]] as const

export const CHART_PRESETS: Record<string, ChartPreset> = {
    security_by_day: {
        tool: 'security_events', args: { group_by: 'day', limit: 200 }, title: 'События безопасности по дням', type: 'stacked', period: true,
        build: output => securitySeries(output, periodDays(output), shortDay),
    },
    security_by_hour: {
        tool: 'security_events', args: { group_by: 'hour_of_day', limit: 24 }, title: 'События безопасности по часам суток', type: 'bar', period: true,
        build: output => securitySeries(output, Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`), key => key.slice(0, 2)),
    },
    security_by_type: {
        tool: 'security_events', args: { group_by: 'type', limit: 10 }, title: 'События безопасности по типам', type: 'hbar', period: true,
        build: output => topRows(rows(output, 'groups'), row => String(row.key), row => number(row.count), 'События', 'событий'),
    },
    security_by_stop: {
        tool: 'security_events', args: { group_by: 'stop', limit: TOP }, title: 'Остановки с наибольшим числом событий', type: 'hbar', period: true,
        build: output => topRows(rows(output, 'groups'), row => String(row.key), row => number(row.count), 'События', 'событий'),
    },
    passenger_load_by_hour: {
        tool: 'passenger_load', args: { group_by: 'hour_of_day', limit: 24 }, title: 'Людей в кадре по часам суток', type: 'line', period: true,
        build: output => {
            const list = rows(output, 'rows')
            return { labels: list.map(row => String(row.key).slice(0, 2)), unit: 'чел.',
                series: [{ name: 'В среднем', values: list.map(row => number(row.average_people)) }, { name: 'Пик', values: list.map(row => number(row.peak_people)) }] }
        },
    },
    passenger_load_by_stop: {
        tool: 'passenger_load', args: { group_by: 'stop', limit: TOP }, title: 'Самые загруженные остановки', type: 'hbar', period: true,
        build: output => topRows(rows(output, 'rows'), row => String(row.key), row => number(row.average_people), 'Людей в кадре, в среднем', 'чел.'),
    },
    equipment_outages: {
        tool: 'equipment_outages', args: { limit: TOP }, title: 'Самые долгие простои оборудования', type: 'hbar', period: true,
        build: output => topRows(rows(output, 'worst'), row => `${row.kind === 'камера' ? 'Камера' : 'Контроллер'} ${row.id} · ${row.stop}`,
            row => number(row.downtime_minutes) === null ? null : Math.round(Number(row.downtime_minutes) / 6) / 10, 'Простой', 'ч'),
    },
    equipment_status_now: {
        tool: 'equipment_status', args: { status: 'all', limit: 1 }, title: 'Связь оборудования сейчас', type: 'bar',
        build: output => {
            const counts = (output.counts ?? {}) as { cameras?: Record<string, number>; controllers?: Record<string, number> }
            return { labels: STATUS_ORDER.map(([, label]) => label), labelColors: STATUS_ORDER.map(([, , color]) => color), unit: 'шт.',
                series: [{ name: 'Камеры', values: STATUS_ORDER.map(([key]) => counts.cameras?.[key] ?? 0) }, { name: 'Контроллеры датчиков', values: STATUS_ORDER.map(([key]) => counts.controllers?.[key] ?? 0) }] }
        },
    },
    stop_conditions_now: {
        tool: 'stop_conditions', args: { level: 'all', limit: 1 }, title: 'Состояние остановок сейчас', type: 'donut',
        build: output => {
            const counts = (output.counts ?? {}) as Record<string, number>
            const levels = [['ok', STATUS_COLORS.good], ['warn', STATUS_COLORS.warning], ['bad', STATUS_COLORS.critical], ['unknown', STATUS_COLORS.neutral]] as const
            return { labels: levels.map(([level]) => CONDITION_LABELS[level]), labelColors: levels.map(([, color]) => color), unit: 'остановок',
                series: [{ name: 'Остановки', values: levels.map(([level]) => counts[CONDITION_LABELS[level]] ?? 0) }] }
        },
    },
    climate_coldest_now: {
        tool: 'stop_climate', args: { sort: 'coldest', limit: TOP }, title: 'Самые холодные павильоны сейчас', type: 'hbar',
        build: output => topRows(rows(output, 'stops'), row => String(row.stop), row => number(row.temperature), 'Температура', '°C'),
    },
    climate_humid_now: {
        tool: 'stop_climate', args: { sort: 'most_humid', limit: TOP }, title: 'Самые влажные павильоны сейчас', type: 'hbar',
        build: output => topRows(rows(output, 'stops'), row => String(row.stop), row => number(row.humidity), 'Влажность', '%'),
    },
    districts_coverage: {
        tool: 'districts_summary', args: { limit: 25 }, title: 'Видеопокрытие по микрорайонам', type: 'hbar',
        build: output => topRows(rows(output, 'districts'), row => String(row.district), row => number(row.video_coverage_pct), 'Видеопокрытие', '%', 25),
    },
    bins_by_day: {
        tool: 'bin_episodes', args: { status: 'all', limit: 200 }, title: 'Переполнения урн по дням', type: 'bar', period: true,
        build: output => {
            const days = periodDays(output)
            const counts = new Map<string, number>()
            for (const row of rows(output, 'episodes')) {
                const day = String(row.started ?? '').slice(0, 10)
                counts.set(day, (counts.get(day) ?? 0) + 1)
            }
            const total = number(output.total) ?? 0
            return { labels: days.map(shortDay), series: [{ name: 'Переполнения', values: days.map(day => counts.get(day) ?? 0) }], unit: 'эпизодов',
                ...(total > 200 ? { note: 'По 200 последним эпизодам.' } : {}) }
        },
    },
    climate_temperature: {
        tool: 'stop_climate', args: {}, title: 'Температура в павильоне', type: 'line', period: true, stop: true,
        build: output => hourly(rows(output, 'hourly'), 'temperature', 'Температура', '°C'),
    },
    climate_humidity: {
        tool: 'stop_climate', args: {}, title: 'Влажность в павильоне', type: 'area', period: true, stop: true,
        build: output => hourly(rows(output, 'hourly'), 'humidity', 'Влажность', '%'),
    },
}
export const CHART_PRESET_NAMES = Object.keys(CHART_PRESETS)

export const CHART_PRESET_HELP = 'security_by_day / security_by_hour / security_by_type / security_by_stop — события безопасности; '
    + 'passenger_load_by_hour / passenger_load_by_stop — люди в кадре; equipment_outages — самые долгие простои; bins_by_day — переполнения урн; '
    + 'climate_temperature / climate_humidity — температура или влажность одной остановки за период (нужен stop). '
    + 'На сейчас: equipment_status_now, stop_conditions_now, climate_coldest_now, climate_humid_now, districts_coverage.'

export interface ChartRequest { preset: unknown; type?: unknown; from?: unknown; to?: unknown; stop?: unknown; title?: unknown }

/** График по готовому виду; null — за период нет данных. */
export async function buildChart(ctx: VectorToolContext, request: ChartRequest): Promise<ReportChart | null> {
    const name = typeof request.preset === 'string' ? request.preset.trim() : ''
    const preset = CHART_PRESETS[name]
    if (!preset) throw new ToolInputError(`График должен быть одним из: ${CHART_PRESET_NAMES.join(', ')}`)
    const type = CHART_TYPES.find(t => t === request.type) ?? preset.type
    const tool = VECTOR_TOOLS.find(t => t.name === preset.tool)
    if (!tool) throw new ToolInputError('Неизвестный источник данных графика')
    const args: ToolArgs = { ...preset.args }
    const stop = typeof request.stop === 'string' || typeof request.stop === 'number' ? String(request.stop).trim() : ''
    if (preset.stop && !stop) throw new ToolInputError(`Для графика ${name} нужна остановка: параметр stop`)
    if (stop && ['security_events', 'passenger_load', 'bin_episodes', 'equipment_outages', 'equipment_status', 'stop_climate'].includes(tool.name)) args.stop = stop
    if (preset.period) {
        for (const key of ['from', 'to'] as const) if (typeof request[key] === 'string' && (request[key] as string).trim()) args[key] = (request[key] as string).trim()
        // Почасовая история остановки строится только с периодом: по умолчанию — неделя.
        if (preset.stop && !args.from && !args.to) args.from = localDay(ctx.now - 6 * DAY)
    }
    const output = await runVectorTool(ctx, tool, args) as Output
    const data = preset.build(output)
    // Для одной остановки — её название из справочника, а не то, что ввели.
    const stopName = preset.stop ? (typeof output.stop === 'string' ? output.stop : stop) : ''
    const title = typeof request.title === 'string' && request.title.trim() ? request.title.trim() : preset.title + (stopName ? ` · ${stopName}` : '')
    return normalizeChart({ type, title, ...data }) ?? null
}

/** Коротко для модели: что показано и сами цифры, чтобы она могла их прокомментировать. */
export function chartSummary(chart: ReportChart): string {
    const points = chart.series.map(series => `${series.name}: ${chart.labels.slice(0, 31).map((label, i) => `${label} — ${chartNumber(series.values[i])}`).join('; ')}${chart.labels.length > 31 ? '; …' : ''}`)
    return `График «${chart.title}» (${CHART_TYPE_LABELS[chart.type]}${chart.unit ? `, ${chart.unit}` : ''}) показан пользователю. ${points.join('. ')}`
}

export const CHART_TOOL_NAME = 'create_chart'

export const CHART_TOOL: VectorTool = {
    name: CHART_TOOL_NAME,
    title: VECTOR_TOOL_TITLES[CHART_TOOL_NAME],
    description: 'Нарисовать график по данным остановок: пользователь увидит его в чате. Вызывай, когда просят график, диаграмму, динамику, '
        + 'сравнение или распределение. Выбери вид графика chart и форму type: bar — столбцы, hbar — горизонтальные столбцы (рейтинги), '
        + 'stacked — столбцы с накоплением, line — линия (динамика), area — область, pie — круговая, donut — кольцевая (доли). '
        + 'Цифры сервер берёт из базы — не пересказывай их все, прокомментируй главное одной-двумя фразами.',
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['chart'],
        properties: {
            chart: { type: 'string', enum: CHART_PRESET_NAMES, description: CHART_PRESET_HELP },
            type: { type: 'string', enum: CHART_TYPES, description: 'Форма графика; по умолчанию — подходящая для данных' },
            from: { type: 'string', maxLength: 40, description: 'Начало периода, YYYY-MM-DD' },
            to: { type: 'string', maxLength: 40, description: 'Конец периода, YYYY-MM-DD (день включается)' },
            stop: { type: 'string', maxLength: 120, description: 'Остановка: название или id' },
            title: { type: 'string', maxLength: 120, description: 'Свой заголовок графика, если нужен' },
        },
    },
    handler: async (ctx, args) => {
        const chart = await buildChart(ctx, { preset: args.chart, type: args.type, from: args.from, to: args.to, stop: args.stop, title: args.title })
        return chart ? { chart } : { chart: null, message: 'За выбранный период для графика нет данных.' }
    },
}

