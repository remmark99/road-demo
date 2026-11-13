import { normalizeReport, ReportInputError, type ReportCell, type ReportDocument, type ReportTable } from '@/lib/reports/document'
import { CHART_TYPES } from '@/lib/reports/chart'
import { ToolInputError, localTime, type ToolArgs } from './args'
import { CHART_PRESET_HELP, CHART_PRESET_NAMES, buildChart } from './chart-presets'
import { VECTOR_TOOL_TITLES } from './titles'
import { VECTOR_TOOLS, runVectorTool, type VectorTool, type VectorToolContext } from './tools'

/**
 * Инструмент create_report: оформленный отчёт для скачивания в PDF, Excel и Word.
 * Модель пишет выводы и выбирает разделы, а таблицы с цифрами сервер берёт
 * сам из инструментов данных (section.data) — модель не переписывает строки
 * вручную, поэтому отчёт собирается быстро и без выдуманных значений.
 */

/** Инструменты, чей вывод становится таблицей, и где в выводе список строк. */
const TABLE_SOURCES: Record<string, string[]> = {
    equipment_status: ['items'],
    equipment_outages: ['worst'],
    security_events: ['groups'],
    stop_conditions: ['stops'],
    stop_climate: ['hourly', 'stops'],
    passenger_load: ['rows'],
    bin_episodes: ['episodes'],
    districts_summary: ['districts'],
    find_stops: ['stops'],
}
const TABLE_ROWS = 100
/** Где в выводе инструмента полное число строк списка (если список обрезан лимитом). */
const TOTAL_FIELDS: Record<string, string> = {
    equipment_status: 'total', equipment_outages: 'devices_with_outages', stop_conditions: 'total',
    stop_climate: 'stops_with_readings', bin_episodes: 'total', find_stops: 'total',
}

const COLUMN_LABELS: Record<string, string> = {
    kind: 'Оборудование', id: 'Номер', status: 'Статус', stop: 'Остановка', name: 'Остановка', number: 'Номер остановки', address: 'Адрес',
    district: 'Микрорайон', since: 'С какого времени', minutes: 'Минут', outages: 'Отключений', downtime_minutes: 'Простой, мин',
    offline_now: 'Не в сети сейчас', count: 'Событий', level: 'Состояние', issues: 'Нарушения', temperature: 'Температура, °C',
    humidity: 'Влажность, %', updated: 'Обновлено', temperature_out_of_norm: 'Температура вне нормы', humidity_out_of_norm: 'Влажность вне нормы',
    average_people: 'Людей в кадре, в среднем', peak_people: 'Пик людей', started: 'Начало', cleaned: 'Убрано', confirmations: 'Подтверждений',
    stops: 'Остановок', with_cameras: 'С камерами', cameras_online_stops: 'Камеры на связи', with_sensors: 'С датчиками',
    sensors_online: 'Датчики на связи', video_coverage_pct: 'Видеопокрытие, %', time: 'Время', type: 'Тип', camera: 'Камера',
    cameras: 'Камер', cameras_online: 'Камер на связи', sensors: 'Датчики', sensors_status: 'Связь датчиков',
}
const GROUP_LABELS: Record<string, string> = { stop: 'Остановка', day: 'День', hour_of_day: 'Час', type: 'Тип события' }
const HIDDEN = new Set(['stop_id', 'location', 'location_id', 'norms'])
const STATUS_LABELS: Record<string, string> = { online: 'в сети', offline: 'не в сети', unknown: 'нет данных' }
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/

function displayCell(key: string, value: unknown): ReportCell {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'boolean') return value ? 'да' : 'нет'
    if (typeof value === 'number') return Number.isFinite(value) ? value : '—'
    if (Array.isArray(value)) return value.filter(v => typeof v === 'string' || typeof v === 'number').join('; ') || '—'
    if (typeof value !== 'string') return '—'
    if ((key === 'status' || key === 'sensors_status') && STATUS_LABELS[value]) return STATUS_LABELS[value]
    const time = LOCAL_TIME.exec(value)
    return time ? `${time[3]}.${time[2]}.${time[1]}${time[4] ? ` ${time[4]}` : ''}` : value
}

/** Список объектов из вывода инструмента → таблица с русскими заголовками. */
export function outputTable(toolName: string, output: unknown): ReportTable | null {
    if (!output || typeof output !== 'object') return null
    const data = output as Record<string, unknown>
    const field = (TABLE_SOURCES[toolName] ?? []).find(name => Array.isArray(data[name]))
    if (!field) return null
    const items = (data[field] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    const keys = [...new Set(items.flatMap(Object.keys))]
        .filter(key => !HIDDEN.has(key) && items.some(row => row[key] !== null && row[key] !== undefined && typeof row[key] !== 'object' || Array.isArray(row[key])))
    if (!keys.length) return { columns: ['Данные'], rows: [], note: 'Нет данных за выбранный период.' }
    const groupBy = typeof data.group_by === 'string' ? data.group_by : 'stop'
    const columns = keys.map(key => key === 'key' ? GROUP_LABELS[groupBy] ?? 'Группа' : COLUMN_LABELS[key] ?? key)
    const totalField = field === 'hourly' ? undefined : TOTAL_FIELDS[toolName]
    const total = totalField && typeof data[totalField] === 'number' ? data[totalField] as number : items.length
    return {
        columns,
        rows: items.map(row => keys.map(key => displayCell(key, row[key]))),
        ...(items.length === 0 ? { note: 'Нет данных за выбранный период.' } : total > items.length ? { note: `Показаны первые ${items.length} из ${total}.` } : {}),
    }
}

/**
 * Готовые таблицы отчёта. Модель выбирает вид по имени, период общий для отчёта:
 * слабые модели плохо заполняют вложенные параметры, а так ошибиться негде.
 */
const PERIOD_TABLES: Record<string, { tool: string; args: ToolArgs; title: string }> = {
    equipment_outages: { tool: 'equipment_outages', args: {}, title: 'Самые долгие отключения оборудования' },
    security_by_stop: { tool: 'security_events', args: { group_by: 'stop' }, title: 'События безопасности по остановкам' },
    security_by_day: { tool: 'security_events', args: { group_by: 'day' }, title: 'События безопасности по дням' },
    security_by_type: { tool: 'security_events', args: { group_by: 'type' }, title: 'События безопасности по типам' },
    security_by_hour: { tool: 'security_events', args: { group_by: 'hour_of_day' }, title: 'События безопасности по часам суток' },
    passenger_load_by_stop: { tool: 'passenger_load', args: { group_by: 'stop' }, title: 'Людей в кадре по остановкам' },
    passenger_load_by_hour: { tool: 'passenger_load', args: { group_by: 'hour_of_day' }, title: 'Людей в кадре по часам суток' },
    bin_episodes: { tool: 'bin_episodes', args: {}, title: 'Переполнение урн' },
}
const CURRENT_TABLES: Record<string, { tool: string; args: ToolArgs; title: string }> = {
    equipment_offline_now: { tool: 'equipment_status', args: { status: 'offline' }, title: 'Оборудование не в сети сейчас' },
    stop_problems_now: { tool: 'stop_conditions', args: { level: 'problems' }, title: 'Остановки с нарушениями сейчас' },
    climate_coldest_now: { tool: 'stop_climate', args: { sort: 'coldest' }, title: 'Температура и влажность: самые холодные павильоны' },
    climate_humid_now: { tool: 'stop_climate', args: { sort: 'most_humid' }, title: 'Температура и влажность: самые влажные павильоны' },
    bins_full_now: { tool: 'bin_episodes', args: { status: 'open' }, title: 'Урны переполнены сейчас' },
    districts: { tool: 'districts_summary', args: {}, title: 'Микрорайоны' },
}
export const REPORT_TABLES = [...Object.keys(PERIOD_TABLES), ...Object.keys(CURRENT_TABLES)]
/** Таблицы, которые можно сузить до одной остановки. */
const STOP_SCOPED = new Set(['equipment_outages', 'security_events', 'passenger_load', 'bin_episodes', 'equipment_status'])

async function presetTable(ctx: VectorToolContext, kind: string, period: ToolArgs, stop: unknown, heading: string): Promise<ReportTable> {
    const preset = PERIOD_TABLES[kind] ?? CURRENT_TABLES[kind]
    const tool = preset ? VECTOR_TOOLS.find(t => t.name === preset.tool) : undefined
    if (!preset || !tool) throw new ToolInputError(`Раздел «${heading}»: table должен быть одним из ${REPORT_TABLES.join(', ')}`)
    const args: ToolArgs = { ...preset.args, limit: TABLE_ROWS, ...(PERIOD_TABLES[kind] ? period : {}) }
    if (typeof stop === 'string' && stop.trim() && STOP_SCOPED.has(tool.name)) args.stop = stop.trim()
    try {
        const table = outputTable(tool.name, await runVectorTool(ctx, tool, args)) ?? { columns: ['Данные'], rows: [], note: 'Нет данных.' }
        return { ...table, title: preset.title }
    } catch (error) {
        if (error instanceof ToolInputError) throw new ToolInputError(`Раздел «${heading}»: ${error.message}`)
        console.error(`report table ${kind} failed:`, error instanceof Error ? error.message : 'unknown error')
        return { title: preset.title, columns: ['Данные'], rows: [], note: 'Данные раздела сейчас не загрузились.' }
    }
}

async function sectionChart(ctx: VectorToolContext, section: { chart?: unknown; chart_type?: unknown; stop?: unknown }, period: ToolArgs, heading: string) {
    try {
        return await buildChart(ctx, { preset: section.chart, type: section.chart_type, from: period.from, to: period.to, stop: section.stop }) ?? undefined
    } catch (error) {
        if (error instanceof ToolInputError) throw new ToolInputError(`Раздел «${heading}»: ${error.message}`)
        console.error('report chart failed:', error instanceof Error ? error.message : 'unknown error')
        return undefined
    }
}

/** Отчёт из аргументов модели: разделы с data получают таблицы из базы. */
export async function buildReport(ctx: VectorToolContext, args: ToolArgs): Promise<ReportDocument> {
    const period: ToolArgs = {}
    for (const key of ['from', 'to'] as const) if (typeof args[key] === 'string' && (args[key] as string).trim()) period[key] = (args[key] as string).trim()
    const sections = Array.isArray(args.sections) ? args.sections.slice(0, 20) : []
    const resolved = await Promise.all(sections.map(async raw => {
        if (!raw || typeof raw !== 'object') return raw
        const section = raw as { heading?: unknown; table?: unknown; stop?: unknown; chart?: unknown; chart_type?: unknown }
        const heading = typeof section.heading === 'string' ? section.heading : 'Раздел'
        const [table, chart] = await Promise.all([
            typeof section.table === 'string' && section.table.trim() ? presetTable(ctx, section.table.trim(), period, section.stop, heading) : undefined,
            typeof section.chart === 'string' && section.chart.trim() ? sectionChart(ctx, section, period, heading) : undefined,
        ])
        return { ...section, table, chart }
    }))
    try {
        return normalizeReport({ ...args, sections: resolved }, localTime(ctx.now) ?? '')
    } catch (error) {
        if (error instanceof ReportInputError) throw new ToolInputError(error.message)
        throw error
    }
}

export const REPORT_TOOL_NAME = 'create_report'

export const REPORT_TOOL: VectorTool = {
    name: REPORT_TOOL_NAME,
    title: VECTOR_TOOL_TITLES[REPORT_TOOL_NAME],
    description: 'Оформленный отчёт по остановочным павильонам: пользователь скачает его в PDF, Excel и Word. '
        + 'Вызывай, когда просят отчёт, сводку для руководства, документ или выгрузку. Сначала получи цифры инструментами данных, '
        + 'потом один раз вызови create_report: выводы и плитки с цифрами пиши сам, а таблицы и графики не переписывай — укажи в разделе '
        + 'table (вид таблицы) и chart с chart_type (вид и форма графика), сервер вставит их из базы за период from–to отчёта.',
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'from', 'to', 'summary', 'sections'],
        properties: {
            title: { type: 'string', maxLength: 90, description: 'Короткий заголовок до 90 символов, например «Состояние остановочных павильонов за неделю»' },
            subtitle: { type: 'string', maxLength: 120, description: 'Период и охват, например «06.11.2026 — 13.11.2026, все остановки»' },
            from: { type: 'string', maxLength: 40, description: 'Начало периода отчёта, YYYY-MM-DD' },
            to: { type: 'string', maxLength: 40, description: 'Конец периода отчёта, YYYY-MM-DD (день включается)' },
            summary: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 400 }, description: 'Главные выводы: 2–5 предложений с цифрами' },
            metrics: {
                type: 'array', maxItems: 8, description: 'Ключевые цифры, 3–6 плиток',
                items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: {
                    label: { type: 'string', maxLength: 60, description: 'Например «Камер не в сети»' },
                    value: { type: 'string', maxLength: 30, description: 'Например «12 из 230»' } } },
            },
            sections: {
                type: 'array', minItems: 1, maxItems: 8, description: 'Разделы отчёта, 2–5 штук',
                items: { type: 'object', additionalProperties: false, required: ['heading'], properties: {
                    heading: { type: 'string', maxLength: 90, description: 'Заголовок раздела' },
                    paragraphs: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 800 }, description: '1–2 абзаца пояснений' },
                    bullets: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 300 }, description: 'Пункты, например рекомендации' },
                    table: {
                        type: 'string', enum: REPORT_TABLES,
                        description: 'Таблица из базы. За период отчёта: equipment_outages — долгие отключения; security_by_stop / security_by_day / security_by_type / security_by_hour — события безопасности; '
                            + 'passenger_load_by_stop / passenger_load_by_hour — люди в кадре; bin_episodes — переполнения урн. На сейчас: equipment_offline_now, stop_problems_now, '
                            + 'climate_coldest_now, climate_humid_now, bins_full_now, districts.',
                    },
                    chart: { type: 'string', enum: CHART_PRESET_NAMES, description: `График из базы за период отчёта. ${CHART_PRESET_HELP}` },
                    chart_type: { type: 'string', enum: CHART_TYPES, description: 'Форма графика: bar, hbar, stacked, line, area, pie, donut. Разные разделы — разные формы' },
                    stop: { type: 'string', maxLength: 120, description: 'Только для отчёта по одной остановке: её название или id' },
                } },
            },
        },
    },
    handler: async (ctx, args) => ({ report: await buildReport(ctx, args), formats: ['pdf', 'xlsx', 'docx'] }),
}
