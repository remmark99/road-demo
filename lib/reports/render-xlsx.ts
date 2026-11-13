import { createXlsx, type Cell, type Sheet } from '@/lib/exports/xlsx'
import { chartDataRows, chartSpaceXml, officeChartView } from './chart-ooxml'
import { REPORT_BRAND, displayTime, type ReportDocument, type ReportTable } from './document'
import type { ReportChart } from './chart'

/**
 * Excel отчёта: лист «Отчёт» с выводами и текстом разделов, лист «Показатели»
 * и по листу на каждую таблицу — числа остаются числами, у таблиц есть фильтры.
 */

const SHEET_NAME_CHARS = 31

function sheetName(base: string, used: Set<string>) {
    const clean = base.replace(/[\\/?*[\]:']/g, ' ').replace(/\s+/g, ' ').trim() || 'Таблица'
    for (let n = 1; ; n++) {
        const suffix = n === 1 ? '' : ` (${n})`
        const name = clean.slice(0, SHEET_NAME_CHARS - suffix.length).trimEnd() + suffix
        if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name }
    }
}

/** Заголовки таблицы Excel должны быть уникальными и непустыми. */
function uniqueColumns(columns: string[]) {
    const seen = new Map<string, number>()
    return columns.map(column => {
        const name = column.trim() || 'Колонка'
        const count = (seen.get(name.toLowerCase()) ?? 0) + 1
        seen.set(name.toLowerCase(), count)
        return count === 1 ? name : `${name} (${count})`
    })
}

function tableSheet(table: ReportTable, name: string): Sheet {
    const columns = uniqueColumns(table.columns)
    const rows: Cell[][] = [columns, ...table.rows.map(row => columns.map((_, c) => row[c] ?? null))]
    const widths = columns.map((column, c) => Math.min(60, Math.max(10, column.length + 2, ...table.rows.map(row => String(row[c] ?? '').length + 2))))
    return { name, rows, columnWidths: widths, wrapColumns: widths.flatMap((width, c) => width >= 40 ? [c] : []) }
}

/** Лист с данными графика и самой диаграммой справа от них. */
function chartSheet(chart: ReportChart, name: string): Sheet {
    const rows = chartDataRows(officeChartView(chart))
    const columns = uniqueColumns(rows[0] as string[])
    const widths = columns.map((column, c) => Math.min(48, Math.max(12, column.length + 2, ...rows.slice(1).map(row => String(row[c] ?? '').length + 2))))
    const left = columns.length + 1
    const height = chart.type === 'hbar' ? Math.max(18, chart.labels.length * 2 + 6) : 20
    return {
        name, rows: [columns, ...rows.slice(1)], columnWidths: widths,
        chart: { xml: chartSpaceXml(chart, name), from: { col: left, row: 0 }, to: { col: left + 10, row: height } },
    }
}

export function renderReportXlsx(report: ReportDocument): Uint8Array {
    const used = new Set<string>()
    const main = sheetName('Отчёт', used)
    const metrics = report.metrics.length ? sheetName('Показатели', used) : null
    const tableNames = report.sections.map(section => section.table?.rows.length ? sheetName(section.table.title || section.heading || 'Таблица', used) : null)
    const chartNames = report.sections.map(section => section.chart ? sheetName(`График — ${section.chart.title}`, used) : null)
    const text: Cell[][] = [['Раздел', 'Содержание']]
    text.push(['Отчёт', report.title])
    if (report.subtitle) text.push(['Период и охват', report.subtitle])
    text.push(['Сформировано', `${displayTime(report.generatedAt)} по Сургуту, ИИ-ассистент «Вектора города»`])
    text.push(['Источник', REPORT_BRAND])
    for (const item of report.summary) text.push(['Главное', item])
    report.sections.forEach((section, index) => {
        const heading = `${index + 1}. ${section.heading || 'Раздел'}`
        for (const paragraph of section.paragraphs) text.push([heading, paragraph])
        for (const item of section.bullets) text.push([heading, `• ${item}`])
        if (chartNames[index]) text.push([heading, `График на листе «${chartNames[index]}»`])
        if (section.table) text.push([heading, tableNames[index] ? `Таблица на листе «${tableNames[index]}»` : section.table.note ?? 'Нет данных'])
    })
    const sheets: Sheet[] = [{ name: main, rows: text, columnWidths: [34, 110], wrapColumns: [0, 1] }]
    if (metrics) {
        sheets.push({
            name: metrics,
            rows: [['Показатель', 'Значение', 'Пояснение'], ...report.metrics.map(m => [m.label, m.value, m.note ?? null])],
            columnWidths: [44, 22, 60],
            wrapColumns: [0, 2],
        })
    }
    report.sections.forEach((section, index) => {
        if (section.chart && chartNames[index]) sheets.push(chartSheet(section.chart, chartNames[index]))
        if (section.table && tableNames[index]) sheets.push(tableSheet(section.table, tableNames[index]))
    })
    return createXlsx(sheets)
}
