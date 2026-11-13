import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jsPDF } from 'jspdf'
import { chartColor, chartNumber, niceTicks, valueDomain, type ReportChart } from './chart'
import { REPORT_BRAND, displayNumber, displayTime, type ReportCell, type ReportDocument, type ReportTable } from './document'

/** PDF отчёта ассистента: A4, PT Sans (кириллица), плитки цифр, таблицы с переносом на страницы. */

const W = 210, H = 297, M = 16, BOTTOM = 20
const CONTENT = W - 2 * M
const PT = 0.3528
const C = {
    ink: '#0F172A', text: '#334155', muted: '#64748B', line: '#E2E8F0', accent: '#1D4ED8',
    accentSoft: '#EFF6FF', tile: '#F8FAFC', header: '#EEF2F7', zebra: '#F8FAFC',
}

let fonts: { regular: string; bold: string } | null = null
function loadFonts() {
    const read = (name: string) => readFileSync(join(process.cwd(), 'assets', 'fonts', name)).toString('base64')
    fonts ??= { regular: read('PT_Sans-Web-Regular.ttf'), bold: read('PT_Sans-Web-Bold.ttf') }
    return fonts
}

const cellText = (value: ReportCell) => typeof value === 'number' ? displayNumber(value) : value

export function renderReportPdf(report: ReportDocument): Uint8Array {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    const f = loadFonts()
    doc.addFileToVFS('PTSans-Regular.ttf', f.regular)
    doc.addFont('PTSans-Regular.ttf', 'PTSans', 'normal')
    doc.addFileToVFS('PTSans-Bold.ttf', f.bold)
    doc.addFont('PTSans-Bold.ttf', 'PTSans', 'bold')
    doc.setProperties({ title: report.title, subject: report.subtitle ?? '', creator: 'Вектор города', author: 'ИИ-ассистент «Вектора города»' })

    let y = M
    const font = (size: number, weight: 'normal' | 'bold' = 'normal', color = C.text) => {
        doc.setFont('PTSans', weight)
        doc.setFontSize(size)
        doc.setTextColor(color)
    }
    const lh = (size: number, k = 1.38) => size * PT * k
    const room = () => H - BOTTOM - y
    const newPage = () => { doc.addPage(); y = M }
    const ensure = (height: number) => { if (height > room()) newPage() }
    const split = (text: string, width: number) => doc.splitTextToSize(text, width) as string[]

    const paragraph = (text: string, size: number, options: { weight?: 'normal' | 'bold'; color?: string; indent?: number; after?: number } = {}) => {
        font(size, options.weight, options.color)
        const indent = options.indent ?? 0
        for (const line of split(text, CONTENT - indent)) {
            ensure(lh(size))
            font(size, options.weight, options.color)
            doc.text(line, M + indent, y, { baseline: 'top' })
            y += lh(size)
        }
        y += options.after ?? 0
    }

    const bullet = (text: string, size: number, color = C.text, x = M, width = CONTENT) => {
        font(size, 'normal', color)
        const lines = split(text, width - 5)
        lines.forEach((line, index) => {
            ensure(lh(size))
            font(size, 'normal', color)
            if (index === 0) {
                doc.setFillColor(C.accent)
                doc.circle(x + 1.4, y + size * PT * 0.55, 0.65, 'F')
            }
            doc.text(line, x + 5, y, { baseline: 'top' })
            y += lh(size)
        })
        y += 1
    }

    // Шапка.
    font(7.5, 'bold', C.accent)
    doc.text(REPORT_BRAND.toUpperCase(), M, y, { baseline: 'top', charSpace: 0.25 })
    y += 6
    paragraph(report.title, 20, { weight: 'bold', color: C.ink, after: 1 })
    if (report.subtitle) paragraph(report.subtitle, 11, { color: C.muted, after: 0.5 })
    paragraph(`Сформировано ${displayTime(report.generatedAt)} по Сургуту · ИИ-ассистент «Вектора города»`, 8.5, { color: C.muted })
    y += 3
    doc.setDrawColor(C.accent); doc.setLineWidth(0.8); doc.line(M, y, M + 28, y)
    doc.setDrawColor(C.line); doc.setLineWidth(0.25); doc.line(M + 28, y, W - M, y)
    y += 7

    // Плитки с ключевыми цифрами.
    if (report.metrics.length) {
        const perRow = report.metrics.length <= 4 ? report.metrics.length : report.metrics.length % 4 === 0 ? 4 : 3
        const gap = 4, width = (CONTENT - gap * (perRow - 1)) / perRow
        for (let start = 0; start < report.metrics.length; start += perRow) {
            const row = report.metrics.slice(start, start + perRow).map(metric => {
                font(16, 'bold'); const value = split(metric.value, width - 8)
                font(8.5); const label = split(metric.label, width - 8)
                font(7.5); const note = metric.note ? split(metric.note, width - 8) : []
                return { value, label, note }
            })
            const height = Math.max(...row.map(t => 9 + t.value.length * lh(16, 1.1) + t.label.length * lh(8.5, 1.3) + t.note.length * lh(7.5, 1.3)))
            ensure(height + gap)
            row.forEach((tile, index) => {
                const x = M + index * (width + gap)
                doc.setFillColor(C.tile); doc.setDrawColor(C.line); doc.setLineWidth(0.25)
                doc.roundedRect(x, y, width, height, 2, 2, 'FD')
                let ty = y + 4
                font(16, 'bold', C.accent)
                for (const line of tile.value) { doc.text(line, x + 4, ty, { baseline: 'top' }); ty += lh(16, 1.1) }
                ty += 1
                font(8.5, 'normal', C.ink)
                for (const line of tile.label) { doc.text(line, x + 4, ty, { baseline: 'top' }); ty += lh(8.5, 1.3) }
                font(7.5, 'normal', C.muted)
                for (const line of tile.note) { doc.text(line, x + 4, ty, { baseline: 'top' }); ty += lh(7.5, 1.3) }
            })
            y += height + gap
        }
        y += 3
    }

    // Главное: выводы на голубой подложке.
    if (report.summary.length) {
        font(10.5)
        const lines = report.summary.map(item => split(item, CONTENT - 14))
        const height = 12 + lines.reduce((sum, l) => sum + l.length * lh(10.5) + 1.2, 0)
        if (height < H - BOTTOM - M) {
            ensure(height)
            doc.setFillColor(C.accentSoft); doc.roundedRect(M, y, CONTENT, height, 2, 2, 'F')
            doc.setFillColor(C.accent); doc.rect(M, y, 1.4, height, 'F')
            let sy = y + 4.5
            font(10, 'bold', C.accent)
            doc.text('Главное', M + 6, sy, { baseline: 'top' })
            sy += 6
            for (const item of lines) {
                font(10.5, 'normal', C.ink)
                item.forEach((line, index) => {
                    if (index === 0) { doc.setFillColor(C.accent); doc.circle(M + 7.4, sy + 10.5 * PT * 0.55, 0.65, 'F') }
                    doc.text(line, M + 10, sy, { baseline: 'top' })
                    sy += lh(10.5)
                })
                sy += 1.2
            }
            y += height + 7
        } else {
            paragraph('Главное', 13, { weight: 'bold', color: C.ink, after: 2 })
            report.summary.forEach(item => bullet(item, 10.5, C.ink))
            y += 4
        }
    }

    const table = (t: ReportTable) => {
        if (t.title) paragraph(t.title, 9.5, { weight: 'bold', color: C.ink, after: 1 })
        if (t.rows.length) {
            const size = t.columns.length > 8 ? 7 : t.columns.length > 6 ? 7.5 : 8.5
            const pad = 1.6, rowLh = lh(size, 1.25)
            const numeric = t.columns.map((_, c) => t.rows.every(row => typeof row[c] === 'number' || row[c] === '—'))
            font(size, 'bold')
            const headerWidth = t.columns.map(column => doc.getTextWidth(column) + 2 * pad)
            font(size)
            const contentWidth = t.columns.map((_, c) => Math.max(0, ...t.rows.map(row => doc.getTextWidth(cellText(row[c] ?? '')))) + 2 * pad)
            const desired = t.columns.map((_, c) => Math.min(80, Math.max(12, contentWidth[c], Math.min(headerWidth[c], 34))))
            const scale = CONTENT / desired.reduce((a, b) => a + b, 0)
            const widths = desired.map(w => w * scale)
            const layout = (cells: string[], weight: 'normal' | 'bold') => {
                font(size, weight)
                const lines = cells.map((cell, c) => split(cell, widths[c] - 2 * pad))
                return { lines, height: Math.max(...lines.map(l => l.length)) * rowLh + 2 * pad }
            }
            const header = layout(t.columns, 'bold')
            const drawRow = (row: { lines: string[][]; height: number }, weight: 'normal' | 'bold', fill: string | null, color: string) => {
                if (fill) { doc.setFillColor(fill); doc.rect(M, y, CONTENT, row.height, 'F') }
                font(size, weight, color)
                let x = M
                row.lines.forEach((lines, c) => {
                    lines.forEach((line, i) => {
                        const ty = y + pad + i * rowLh
                        if (numeric[c]) doc.text(line, x + widths[c] - pad, ty, { baseline: 'top', align: 'right' })
                        else doc.text(line, x + pad, ty, { baseline: 'top' })
                    })
                    x += widths[c]
                })
                doc.setDrawColor(C.line); doc.setLineWidth(0.2)
                doc.line(M, y + row.height, W - M, y + row.height)
                y += row.height
            }
            const drawHeader = () => drawRow(header, 'bold', C.header, C.ink)
            ensure(header.height + rowLh * 2 + 2 * pad)
            drawHeader()
            t.rows.forEach((cells, index) => {
                const row = layout(cells.map(cellText), 'normal')
                if (row.height > room()) { newPage(); drawHeader() }
                drawRow(row, 'normal', index % 2 ? C.zebra : null, C.text)
            })
            y += 2
        }
        if (t.note) paragraph(t.note, 8, { color: C.muted })
        y += 3
    }

    /** График: столбцы, линии, области — с осью и сеткой; круговые — с легендой и долями. */
    const chartLayout = (c: ReportChart) => {
        const pie = c.type === 'pie' || c.type === 'donut'
        const legendRows = !pie && c.series.length > 1 ? Math.ceil(c.series.length / 3) : 0
        const plotHeight = pie ? 62 : c.type === 'hbar' ? Math.min(150, Math.max(36, c.labels.length * (c.series.length > 1 ? 4 + 3.2 * c.series.length : 7.2))) : 68
        return { pie, legendRows, plotHeight, height: 10 + plotHeight + 12 + legendRows * 5 }
    }
    const chart = (c: ReportChart) => {
        const { pie, legendRows, plotHeight, height } = chartLayout(c)
        ensure(height)
        font(10, 'bold', C.ink)
        doc.text(c.title, M, y, { baseline: 'top' })
        y += lh(10)
        if (c.unit || c.note) {
            font(8, 'normal', C.muted)
            doc.text([c.unit, c.note].filter(Boolean).join(' · '), M, y, { baseline: 'top' })
            y += lh(8)
        }
        y += 2
        const top = y

        if (pie) {
            const values = c.series[0].values.map(v => Math.max(0, v ?? 0))
            const total = values.reduce((a, b) => a + b, 0) || 1
            const r = 28, cx = M + 36, cy = top + r + 2
            let angle = -Math.PI / 2
            doc.setDrawColor('#FFFFFF'); doc.setLineWidth(0.6)
            values.forEach((value, i) => {
                if (value <= 0) return
                const sweep = 2 * Math.PI * value / total
                const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 90)))
                const points: [number, number][] = [[cx, cy]]
                for (let k = 0; k <= steps; k++) {
                    const a = angle + sweep * k / steps
                    points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
                }
                const deltas = points.slice(1).map((p, k) => [p[0] - points[k][0], p[1] - points[k][1]])
                doc.setFillColor(chartColor(c, 0, i))
                doc.lines(deltas, cx, cy, [1, 1], 'FD', true)
                angle += sweep
            })
            if (c.type === 'donut') {
                doc.setFillColor('#FFFFFF')
                doc.circle(cx, cy, r * 0.58, 'F')
                font(13, 'bold', C.ink)
                doc.text(chartNumber(values.reduce((a, b) => a + b, 0)), cx, cy - 1, { align: 'center', baseline: 'middle' })
                if (c.unit) { font(7.5, 'normal', C.muted); doc.text(c.unit, cx, cy + 4, { align: 'center', baseline: 'middle' }) }
            }
            // Легенда справа: цвет, подпись, значение и доля.
            let ly = top + 4
            const lx = M + 80
            c.labels.forEach((label, i) => {
                if (values[i] <= 0) return
                doc.setFillColor(chartColor(c, 0, i)); doc.circle(lx + 1.3, ly + 1.6, 1.3, 'F')
                font(9, 'normal', C.ink)
                doc.text(split(label, 62)[0], lx + 5, ly, { baseline: 'top' })
                font(9, 'bold', C.ink)
                doc.text(chartNumber(values[i]), W - M - 16, ly, { baseline: 'top', align: 'right' })
                font(8.5, 'normal', C.muted)
                doc.text(`${Math.round(100 * values[i] / total)}%`, W - M, ly, { baseline: 'top', align: 'right' })
                ly += 6.5
            })
            y = top + Math.max(2 * r + 6, ly - top) + 4
            return
        }

        const [min, max] = valueDomain(c)
        const ticks = niceTicks(min, max)
        const n = c.labels.length
        font(7.5)
        const tickWidth = Math.max(...ticks.map(t => doc.getTextWidth(chartNumber(t)))) + 2

        if (c.type === 'hbar') {
            const labelWidth = 58
            const x0 = M + labelWidth, width = CONTENT - labelWidth - 12
            const scale = (v: number) => x0 + (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]) * width
            const row = plotHeight / n
            doc.setDrawColor(C.line); doc.setLineWidth(0.15)
            ticks.forEach(t => doc.line(scale(t), top, scale(t), top + plotHeight))
            c.labels.forEach((label, i) => {
                const ry = top + i * row
                font(8, 'normal', C.ink)
                const lines = split(label, labelWidth - 3).slice(0, 2)
                const textTop = ry + row / 2 - lines.length * lh(8, 1.15) / 2
                lines.forEach((line, k) => doc.text(line, M, textTop + k * lh(8, 1.15), { baseline: 'top' }))
                const barHeight = Math.min(5, (row - 1.6) / c.series.length)
                c.series.forEach((s, k) => {
                    const v = s.values[i]
                    if (v === null) return
                    const by = ry + (row - barHeight * c.series.length) / 2 + k * barHeight
                    const left = Math.min(scale(0), scale(v)), w = Math.abs(scale(v) - scale(0))
                    doc.setFillColor(chartColor(c, k, i))
                    if (w > 0.2) doc.roundedRect(left, by + 0.25, w, barHeight - 0.5, 0.6, 0.6, 'F')
                    font(7.5, 'normal', C.text)
                    doc.text(chartNumber(v), v >= 0 ? scale(v) + 1.2 : scale(0) + 1.2, by + barHeight / 2, { baseline: 'middle' })
                })
            })
            font(7.5, 'normal', C.muted)
            ticks.forEach(t => doc.text(chartNumber(t), scale(t), top + plotHeight + 1.5, { baseline: 'top', align: 'center' }))
            y = top + plotHeight + 6
        } else {
            const x0 = M + tickWidth, width = CONTENT - tickWidth - 2
            const scaleY = (v: number) => top + plotHeight - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]) * plotHeight
            const band = width / n
            doc.setDrawColor(C.line); doc.setLineWidth(0.15)
            ticks.forEach(t => {
                doc.line(x0, scaleY(t), x0 + width, scaleY(t))
                font(7.5, 'normal', C.muted)
                doc.text(chartNumber(t), x0 - 1.5, scaleY(t), { baseline: 'middle', align: 'right' })
            })
            const center = (i: number) => x0 + band * (i + 0.5)
            if (c.type === 'line' || c.type === 'area') {
                c.series.forEach((s, k) => {
                    const color = chartColor(c, k, 0)
                    const segments: [number, number][][] = [[]]
                    s.values.forEach((v, i) => {
                        if (v === null) { if (segments[segments.length - 1].length) segments.push([]); return }
                        segments[segments.length - 1].push([center(i), scaleY(v)])
                    })
                    for (const points of segments.filter(p => p.length)) {
                        if (c.type === 'area' && points.length > 1) {
                            // Заливка — светлый оттенок цвета серии (без прозрачности, чтобы PDF печатался одинаково).
                            const tint = '#' + [1, 3, 5].map(o => Math.round(parseInt(color.slice(o, o + 2), 16) * 0.2 + 255 * 0.8).toString(16).padStart(2, '0')).join('')
                            const base = scaleY(Math.max(ticks[0], 0))
                            const polygon: [number, number][] = [[points[0][0], base], ...points, [points[points.length - 1][0], base]]
                            doc.setFillColor(tint)
                            doc.lines(polygon.slice(1).map((p, j) => [p[0] - polygon[j][0], p[1] - polygon[j][1]]), polygon[0][0], polygon[0][1], [1, 1], 'F', true)
                        }
                        doc.setDrawColor(color); doc.setLineWidth(0.6)
                        if (points.length > 1) doc.lines(points.slice(1).map((p, j) => [p[0] - points[j][0], p[1] - points[j][1]]), points[0][0], points[0][1], [1, 1], 'S', false)
                        if (n <= 31 || points.length === 1) { doc.setFillColor(color); points.forEach(p => doc.circle(p[0], p[1], 0.75, 'F')) }
                    }
                })
            } else {
                const groupWidth = Math.min(band * 0.72, 14)
                const stacked = c.type === 'stacked'
                const barWidth = stacked ? groupWidth : groupWidth / c.series.length
                c.labels.forEach((_, i) => {
                    let base = 0
                    c.series.forEach((s, k) => {
                        const v = s.values[i]
                        if (v === null || v === 0) return
                        const bx = center(i) - groupWidth / 2 + (stacked ? 0 : k * barWidth)
                        const from = stacked ? base : 0, to = stacked ? base + Math.max(0, v) : v
                        if (stacked) base = to
                        const yTop = scaleY(Math.max(from, to)), h = Math.abs(scaleY(from) - scaleY(to))
                        doc.setFillColor(chartColor(c, k, i))
                        const gap = stacked ? 0.25 : Math.min(0.3, barWidth * 0.08)
                        if (h > 0.2) doc.roundedRect(bx + gap, yTop + (stacked ? gap : 0), barWidth - 2 * gap, Math.max(0.2, h - (stacked ? 2 * gap : 0)), 0.5, 0.5, 'F')
                    })
                })
            }
            doc.setDrawColor('#CBD5E1'); doc.setLineWidth(0.25)
            doc.line(x0, scaleY(Math.max(ticks[0], 0)), x0 + width, scaleY(Math.max(ticks[0], 0)))
            // Подписи по оси: не чаще, чем помещаются.
            font(7.5, 'normal', C.muted)
            const widest = Math.max(...c.labels.map(l => doc.getTextWidth(l)))
            const every = Math.max(1, Math.ceil((widest + 2) / band))
            c.labels.forEach((label, i) => {
                if (i % every !== 0) return
                doc.text(split(label, band * every - 1)[0] ?? '', center(i), top + plotHeight + 1.5, { baseline: 'top', align: 'center' })
            })
            y = top + plotHeight + 6
        }

        if (legendRows) {
            let lx = M
            font(8, 'normal', C.ink)
            c.series.forEach((s, k) => {
                const w = doc.getTextWidth(s.name) + 9
                if (lx + w > W - M) { lx = M; y += 5 }
                doc.setFillColor(chartColor(c, k, 0)); doc.circle(lx + 1.3, y + 1.5, 1.3, 'F')
                font(8, 'normal', C.ink)
                doc.text(s.name, lx + 4, y, { baseline: 'top' })
                lx += w
            })
            y += 5
        }
        y += 2
    }

    report.sections.forEach((section, index) => {
        // Заголовок не остаётся внизу страницы отдельно от графика, которым раздел начинается.
        const opensWithChart = section.chart && !section.paragraphs.length && !section.bullets.length
        ensure(lh(13) + 14 + (opensWithChart ? chartLayout(section.chart!).height : 0))
        if (section.heading) {
            font(13, 'bold', C.accent)
            const number = `${index + 1}.`
            doc.text(number, M, y, { baseline: 'top' })
            const offset = doc.getTextWidth(number) + 2
            font(13, 'bold', C.ink)
            const lines = split(section.heading, CONTENT - offset)
            lines.forEach(line => { ensure(lh(13)); font(13, 'bold', C.ink); doc.text(line, M + offset, y, { baseline: 'top' }); y += lh(13) })
            y += 2
        }
        section.paragraphs.forEach(text => paragraph(text, 10, { after: 2 }))
        if (section.bullets.length) {
            section.bullets.forEach(text => bullet(text, 10))
            y += 1.5
        }
        if (section.chart) chart(section.chart)
        if (section.table) table(section.table)
        y += 3
    })

    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page)
        doc.setDrawColor(C.line); doc.setLineWidth(0.2)
        doc.line(M, H - 13, W - M, H - 13)
        font(7.5, 'normal', C.muted)
        const title = report.title.length > 90 ? `${report.title.slice(0, 89)}…` : report.title
        doc.text(`${title} · ${displayTime(report.generatedAt)}`, M, H - 10.5, { baseline: 'top' })
        doc.text(`${page} из ${pages}`, W - M, H - 10.5, { baseline: 'top', align: 'right' })
    }
    return new Uint8Array(doc.output('arraybuffer'))
}
