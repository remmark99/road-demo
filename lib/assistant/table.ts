import { createXlsx, type Cell, type Sheet } from '@/lib/exports/xlsx'
import type { ReportTable } from '@/lib/reports/document'

/**
 * Таблицы в окне ассистента: данные инструментов (сервер кладёт их рядом
 * с ответом) и таблицы из текста ответа. Общие для сервера и браузера:
 * Excel собирается прямо в браузере из того, что уже на экране.
 */

export interface ChatTable extends ReportTable {
    title: string
}

/** Вывод инструмента данных в окне чата: текст для модели и таблица для человека. */
export interface DataToolOutput { text: string; table?: ChatTable | null }

const NUMBER = /^[−-]?\d{1,3}(?:[\s  ]\d{3})+(?:[.,]\d+)?$|^[−-]?\d+(?:[.,]\d+)?$/

/** «25 325» и «12,5» из Markdown → числа: в Excel по ним можно считать. */
export function cellValue(text: string): string | number {
    const value = text.trim()
    if (!NUMBER.test(value) || /^0\d/.test(value)) return value
    const number = Number(value.replace(/[\s  ]/g, '').replace(',', '.').replace('−', '-'))
    return Number.isFinite(number) ? number : value
}

const SHEET_CHARS = 31

function sheetName(base: string, used: Set<string>) {
    const clean = base.replace(/[\\/?*[\]:']/g, ' ').replace(/\s+/g, ' ').trim() || 'Таблица'
    for (let n = 1; ; n++) {
        const suffix = n === 1 ? '' : ` (${n})`
        const name = clean.slice(0, SHEET_CHARS - suffix.length).trimEnd() + suffix
        if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name }
    }
}

function uniqueColumns(columns: string[]) {
    const seen = new Map<string, number>()
    return columns.map(column => {
        const name = column.trim() || 'Колонка'
        const count = (seen.get(name.toLowerCase()) ?? 0) + 1
        seen.set(name.toLowerCase(), count)
        return count === 1 ? name : `${name} (${count})`
    })
}

/** Статусы с заглавной: так Excel красит «В сети» зелёным, «Не в сети» красным. */
function excelCell(value: string | number): Cell {
    if (typeof value === 'number') return value
    if (value === '—') return null
    return /^(в сети|не в сети|частично)/.test(value) ? value[0].toUpperCase() + value.slice(1) : value
}

/** Книга Excel: по листу на таблицу, с фильтрами, числа остаются числами. */
export function tablesToXlsx(tables: ChatTable[]): Uint8Array {
    const used = new Set<string>()
    const sheets: Sheet[] = tables.map(table => {
        const columns = uniqueColumns(table.columns)
        const rows: Cell[][] = [columns, ...table.rows.map(row => columns.map((_, c) => excelCell(row[c] ?? '')))]
        const widths = columns.map((column, c) => Math.min(60, Math.max(10, column.length + 2, ...table.rows.map(row => String(row[c] ?? '').length + 2))))
        const statusColumns = columns.flatMap((_, c) => table.rows.some(row => typeof row[c] === 'string' && /^(в сети|не в сети)$/i.test(row[c] as string)) ? [c] : [])
        return { name: sheetName(table.title, used), rows, columnWidths: widths, wrapColumns: widths.flatMap((w, c) => w >= 40 ? [c] : []), statusColumns }
    })
    return createXlsx(sheets)
}

export function xlsxFileName(title: string) {
    const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Таблица'
    const day = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
    return `${base} ${day}.xlsx`
}

/** Таблица для вставки в Excel или письмо: колонки через табуляцию. */
export function tableToTsv(table: ReportTable) {
    const clean = (value: unknown) => String(value ?? '').replace(/[\t\r\n]+/g, ' ')
    return [table.columns, ...table.rows].map(row => row.map(clean).join('\t')).join('\n')
}
