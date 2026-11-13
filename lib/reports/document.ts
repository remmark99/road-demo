/**
 * Отчёт ассистента: структура, которую модель собирает из данных инструментов,
 * а сервер превращает в PDF, Excel или Word. Модель присылает что угодно —
 * здесь всё приводится к безопасному виду с ограничениями размеров.
 */

import { normalizeChart, type ReportChart } from './chart'

export type ReportFormat = 'pdf' | 'xlsx' | 'docx'
export const REPORT_FORMATS: ReportFormat[] = ['pdf', 'xlsx', 'docx']

export interface ReportMetric { label: string; value: string; note?: string }
export type ReportCell = string | number
export interface ReportTable { title?: string; columns: string[]; rows: ReportCell[][]; note?: string }
export interface ReportSection {
    heading: string
    paragraphs: string[]
    bullets: string[]
    chart?: ReportChart
    table?: ReportTable
}
export interface ReportDocument {
    title: string
    subtitle?: string
    /** Время по Сургуту, «2026-11-13 18:40». */
    generatedAt: string
    summary: string[]
    metrics: ReportMetric[]
    sections: ReportSection[]
}

export class ReportInputError extends Error {}

const LIMITS = { title: 160, text: 2000, cell: 240, metrics: 12, sections: 20, paragraphs: 12, bullets: 40, columns: 12, rows: 300 }

function text(value: unknown, limit: number): string {
    if (value === null || value === undefined) return ''
    const raw = typeof value === 'number' || typeof value === 'boolean' ? String(value) : typeof value === 'string' ? value : ''
    return raw
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        // Эмодзи и символы вне шрифта отчёта превратились бы в квадраты.
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE00-\uFE0F\u200D]/g, '')
        .replace(/[\u00a0\u202f]/g, ' ')
        .replace(/\*\*|__/g, '').trim().slice(0, limit)
}

function list(value: unknown, limit: number, itemLimit: number): string[] {
    const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
    return items.map(item => text(item, itemLimit)).filter(Boolean).slice(0, limit)
}

/** Число остаётся числом — в Excel по нему можно считать. */
function cell(value: unknown): ReportCell {
    return typeof value === 'number' && Number.isFinite(value) ? value : text(value, LIMITS.cell)
}

function table(value: unknown): ReportTable | undefined {
    if (!value || typeof value !== 'object') return undefined
    const raw = value as { title?: unknown; columns?: unknown; rows?: unknown }
    const columns = list(raw.columns, LIMITS.columns, LIMITS.cell)
    if (!columns.length || !Array.isArray(raw.rows)) return undefined
    const rows = raw.rows.slice(0, LIMITS.rows)
        .map(row => Array.isArray(row) ? row : row && typeof row === 'object' ? Object.values(row) : [])
        .map(row => columns.map((_, i) => cell(row[i])))
        .filter(row => row.some(value => value !== ''))
    const title = text(raw.title, LIMITS.title), note = text((value as { note?: unknown }).note, LIMITS.text)
    return { ...(title ? { title } : {}), columns, rows, ...(note ? { note } : {}) }
}

const METRIC_VALUE_CHARS = 18

/**
 * Плитка — это цифра. Модель любит дописывать пояснения прямо в значение
 * («4 (2 лежачих, 2 курения)»): пояснение уходит в подпись под плиткой.
 */
function splitMetric(value: string, note: string): { value: string; note: string } {
    if (value.length <= METRIC_VALUE_CHARS) return { value, note }
    const match = /^([^(:;,—]{1,18}?)\s*(?:\(|:|;|,|—)\s*(.+?)\)?$/.exec(value)
    if (match) return { value: match[1].trim(), note: [match[2].trim(), note].filter(Boolean).join('; ').slice(0, 160) }
    const cut = value.slice(0, METRIC_VALUE_CHARS + 1).replace(/\s+\S*$/, '')
    return { value: `${cut || value.slice(0, METRIC_VALUE_CHARS)}…`, note: [value, note].filter(Boolean).join('; ').slice(0, 160) }
}

/** Отчёт из аргументов инструмента create_report. */
export function normalizeReport(input: unknown, generatedAt: string): ReportDocument {
    if (!input || typeof input !== 'object') throw new ReportInputError('Нужен объект отчёта')
    const raw = input as Record<string, unknown>
    const title = text(raw.title, LIMITS.title)
    if (!title) throw new ReportInputError('Нужен заголовок отчёта (title)')
    const metrics = (Array.isArray(raw.metrics) ? raw.metrics : []).slice(0, LIMITS.metrics).flatMap(item => {
        const m = item as Record<string, unknown>
        const label = text(m?.label, 80)
        const { value, note } = splitMetric(text(m?.value, 200), text(m?.note, 160))
        return label && value ? [{ label, value, ...(note ? { note } : {}) }] : []
    })
    const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, LIMITS.sections).flatMap(item => {
        const s = item as Record<string, unknown>
        const section: ReportSection = {
            heading: text(s?.heading, LIMITS.title),
            paragraphs: list(s?.paragraphs, LIMITS.paragraphs, LIMITS.text),
            bullets: list(s?.bullets, LIMITS.bullets, LIMITS.cell),
            ...(normalizeChart(s?.chart) ? { chart: normalizeChart(s?.chart) } : {}),
            ...(table(s?.table) ? { table: table(s?.table) } : {}),
        }
        return section.heading || section.paragraphs.length || section.bullets.length || section.table || section.chart ? [section] : []
    })
    const summary = list(raw.summary, 8, LIMITS.text)
    if (!summary.length && !metrics.length && !sections.length) throw new ReportInputError('Отчёт пустой: добавьте summary, metrics или sections')
    return { title, ...(text(raw.subtitle, LIMITS.title) ? { subtitle: text(raw.subtitle, LIMITS.title) } : {}), generatedAt, summary, metrics, sections }
}

export function reportFileName(report: ReportDocument, format: ReportFormat) {
    const base = report.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Отчёт'
    return `${base} ${report.generatedAt.slice(0, 10)}.${format}`
}

/** «2026-11-13 18:40» → «13.11.2026 18:40». */
export function displayTime(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(value)
    return match ? `${match[3]}.${match[2]}.${match[1]}${match[4] ? ` ${match[4]}` : ''}` : value
}

/** Число в ячейке: без разрядных пробелов (номера камер), десятичная запятая. */
export function displayNumber(value: number): string {
    return String(Math.round(value * 10) / 10).replace('.', ',')
}

export const REPORT_BRAND = 'Вектор города · Остановочные павильоны Сургута'
