/**
 * График ассистента: одна модель для окна чата, PDF, Excel и Word.
 * Данные приходят из инструментов (lib/mcp/vector/chart-presets.ts), здесь —
 * проверка, ограничения и общие цвета. Без серверных зависимостей.
 */

export type ChartType = 'bar' | 'hbar' | 'stacked' | 'line' | 'area' | 'pie' | 'donut'
export const CHART_TYPES: ChartType[] = ['bar', 'hbar', 'stacked', 'line', 'area', 'pie', 'donut']
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
    bar: 'столбцы', hbar: 'горизонтальные столбцы', stacked: 'столбцы с накоплением', line: 'линия', area: 'область', pie: 'круговая', donut: 'кольцевая',
}

export interface ChartSeries { name: string; values: (number | null)[] }
export interface ReportChart {
    type: ChartType
    title: string
    /** Единица значений: «событий», «ч», «°C». */
    unit?: string
    labels: string[]
    series: ChartSeries[]
    /** Цвета по подписям (статусы: в сети / не в сети) — для круговых и одиночных столбцов. */
    labelColors?: (string | null)[]
    note?: string
}

/** Категориальная палитра (порядок фиксирован, проверен на цветовую слепоту): светлый и тёмный фон. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
export const SERIES_COLORS_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
/** Статусы — отдельные цвета, никогда не цвет серии. */
export const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#94a3b8' }

const MAX_LABELS = 200
const MAX_SERIES = 6
const MAX_SLICES = 7

const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, limit) : ''
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null

/** Проверка графика (в том числе пришедшего из браузера на рендер файла). */
export function normalizeChart(input: unknown): ReportChart | undefined {
    if (!input || typeof input !== 'object') return undefined
    const raw = input as Record<string, unknown>
    const type = CHART_TYPES.find(t => t === raw.type)
    const labels = (Array.isArray(raw.labels) ? raw.labels : []).slice(0, MAX_LABELS).map(label => clean(String(label ?? ''), 80))
    if (!type || !labels.length || !Array.isArray(raw.series)) return undefined
    let series = raw.series.slice(0, MAX_SERIES).flatMap(item => {
        const s = item as { name?: unknown; values?: unknown }
        if (!s || !Array.isArray(s.values)) return []
        return [{ name: clean(s.name, 80) || 'Значение', values: labels.map((_, i) => num((s.values as unknown[])[i])) }]
    })
    if (!series.length || series.every(s => s.values.every(v => v === null))) return undefined
    let labelColors = Array.isArray(raw.labelColors)
        ? labels.map((_, i) => { const c = (raw.labelColors as unknown[])[i]; return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null })
        : undefined
    let chartLabels = labels
    if (type === 'pie' || type === 'donut') {
        // Круговая — одна серия, без отрицательных, мелкие доли — в «Другое».
        const values = series[0].values.map(v => Math.max(0, v ?? 0))
        const order = values.map((value, index) => ({ value, index })).filter(x => x.value > 0)
        if (order.length > MAX_SLICES) {
            const keep = [...order].sort((a, b) => b.value - a.value).slice(0, MAX_SLICES - 1).map(x => x.index).sort((a, b) => a - b)
            const rest = order.filter(x => !keep.includes(x.index)).reduce((sum, x) => sum + x.value, 0)
            chartLabels = [...keep.map(i => labels[i]), 'Другое']
            labelColors = labelColors ? [...keep.map(i => labelColors![i]), STATUS_COLORS.neutral] : undefined
            series = [{ name: series[0].name, values: [...keep.map(i => values[i]), rest] }]
        } else {
            series = [{ name: series[0].name, values }]
        }
        if (!series[0].values.some(v => (v ?? 0) > 0)) return undefined
    }
    return {
        type,
        title: clean(raw.title, 160) || 'График',
        ...(clean(raw.unit, 20) ? { unit: clean(raw.unit, 20) } : {}),
        labels: chartLabels,
        series,
        ...(labelColors?.some(Boolean) ? { labelColors } : {}),
        ...(clean(raw.note, 300) ? { note: clean(raw.note, 300) } : {}),
    }
}

/** Цвет серии или подписи. */
export function chartColor(chart: ReportChart, seriesIndex: number, labelIndex: number, dark = false): string {
    const palette = dark ? SERIES_COLORS_DARK : SERIES_COLORS
    const byLabel = chart.labelColors?.[labelIndex]
    if ((chart.type === 'pie' || chart.type === 'donut')) return byLabel ?? palette[labelIndex % palette.length]
    if (chart.series.length === 1 && byLabel) return byLabel
    return palette[seriesIndex % palette.length]
}

/** «12,5» — без разрядных пробелов, десятичная запятая. */
export function chartNumber(value: number | null): string {
    if (value === null) return '—'
    return String(Math.round(value * 10) / 10).replace('.', ',')
}

/** Красивые деления оси: 0, 5, 10… */
export function niceTicks(min: number, max: number, count = 5): number[] {
    if (min === max) { max = min + 1 }
    const raw = (max - min) / count
    const power = 10 ** Math.floor(Math.log10(raw))
    const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw) ?? raw
    const start = Math.floor(min / step) * step
    const ticks: number[] = []
    for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
    if (ticks[ticks.length - 1] < max) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1e6) / 1e6)
    return ticks
}

/** Диапазон оси значений с нулём; для накопления — суммы по подписи. */
export function valueDomain(chart: ReportChart): [number, number] {
    const stacked = chart.type === 'stacked'
    const values = stacked
        ? chart.labels.map((_, i) => chart.series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0))
        : chart.series.flatMap(s => s.values.filter((v): v is number => v !== null))
    const min = Math.min(0, ...values), max = Math.max(0, ...values)
    const ticks = niceTicks(min, max)
    return [ticks[0], ticks[ticks.length - 1]]
}
