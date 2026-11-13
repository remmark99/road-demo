import { strToU8, zipSync } from 'fflate'
import { createXlsx } from '@/lib/exports/xlsx'
import type { ReportChart } from './chart'
import { CHART_CONTENT_TYPE, chartDataRows, chartSpaceXml, officeChartView } from './chart-ooxml'
import { REPORT_BRAND, displayNumber, displayTime, type ReportCell, type ReportDocument, type ReportTable } from './document'

/**
 * Word отчёта: настоящие стили (Заголовок, Заголовок 1, маркированный список),
 * таблицы с повторяющейся шапкой, номера страниц в колонтитуле — документ
 * можно править дальше как обычный.
 */

const FONT = 'Calibri'
const COLOR = { ink: '0F172A', text: '334155', muted: '64748B', line: 'CBD5E1', accent: '1D4ED8', header: 'EEF2F7', tile: 'F1F5F9', zebra: 'F8FAFC' }
/** A4, поля 2 см: ширина текста в twips. */
const TEXT_WIDTH = 11906 - 2 * 1134

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface Run { text: string; bold?: boolean; size?: number; color?: string; caps?: boolean }
const run = ({ text, bold, size, color, caps }: Run) =>
    `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${caps ? '<w:caps/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`

interface Para { style?: string; align?: 'left' | 'right' | 'center'; before?: number; after?: number; keepNext?: boolean; bullet?: boolean }
const para = (runs: Run[] | Run, options: Para = {}) => {
    const props = [
        options.style ? `<w:pStyle w:val="${options.style}"/>` : '',
        options.keepNext ? '<w:keepNext/>' : '',
        options.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '',
        options.before !== undefined || options.after !== undefined ? `<w:spacing${options.before !== undefined ? ` w:before="${options.before}"` : ''}${options.after !== undefined ? ` w:after="${options.after}"` : ''}/>` : '',
        options.align && options.align !== 'left' ? `<w:jc w:val="${options.align}"/>` : '',
    ].join('')
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${(Array.isArray(runs) ? runs : [runs]).map(run).join('')}</w:p>`
}

const borders = (color: string, inner = true) => ['top', 'left', 'bottom', 'right', ...(inner ? ['insideH', 'insideV'] : [])]
    .map(side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${color}"/>`).join('')

const cell = (content: string, width: number, options: { fill?: string; margins?: number } = {}) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : ''}${options.margins ? `<w:tcMar><w:top w:w="${options.margins}" w:type="dxa"/><w:left w:w="${options.margins}" w:type="dxa"/><w:bottom w:w="${options.margins}" w:type="dxa"/><w:right w:w="${options.margins}" w:type="dxa"/></w:tcMar>` : ''}</w:tcPr>${content}</w:tc>`

const cellText = (value: ReportCell) => typeof value === 'number' ? displayNumber(value) : value

function metricsTable(report: ReportDocument) {
    const perRow = report.metrics.length <= 4 ? report.metrics.length : report.metrics.length % 4 === 0 ? 4 : 3
    const gap = 120
    const width = Math.floor((TEXT_WIDTH - gap * (perRow - 1)) / perRow)
    const rows: string[] = []
    for (let start = 0; start < report.metrics.length; start += perRow) {
        const tiles = report.metrics.slice(start, start + perRow)
        const cells = tiles.flatMap((metric, index) => {
            const content = para({ text: metric.value, bold: true, size: 16, color: COLOR.accent }, { after: 40 })
                + para({ text: metric.label, size: 9, color: COLOR.ink }, { after: metric.note ? 20 : 0 })
                + (metric.note ? para({ text: metric.note, size: 8, color: COLOR.muted }, { after: 0 }) : '')
            const tile = cell(content, width, { fill: COLOR.tile, margins: 140 })
            return index < tiles.length - 1 ? [tile, cell(para({ text: '' }), gap)] : [tile]
        })
        // Неполный ряд добиваем пустыми ячейками, чтобы сетка не съезжала.
        for (let i = tiles.length; i < perRow; i++) cells.push(cell(para({ text: '' }), gap), cell(para({ text: '' }), width))
        rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`)
        if (start + perRow < report.metrics.length) rows.push(`<w:tr><w:trPr><w:trHeight w:val="120" w:hRule="exact"/></w:trPr>${Array.from({ length: perRow * 2 - 1 }, (_, i) => cell(para({ text: '' }, { after: 0 }), i % 2 ? gap : width)).join('')}</w:tr>`)
    }
    const grid = Array.from({ length: perRow * 2 - 1 }, (_, i) => `<w:gridCol w:w="${i % 2 ? gap : width}"/>`).join('')
    return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="nil"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join('')}</w:tbl>`
}

function dataTable(table: ReportTable) {
    const size = table.columns.length > 8 ? 7.5 : table.columns.length > 6 ? 8 : 9
    const numeric = table.columns.map((_, c) => table.rows.every(row => typeof row[c] === 'number' || row[c] === '—'))
    const desired = table.columns.map((column, c) => Math.min(60, Math.max(6, Math.min(column.length, 24), ...table.rows.map(row => cellText(row[c] ?? '').length))))
    const total = desired.reduce((a, b) => a + b, 0)
    const widths = desired.map(w => Math.floor(TEXT_WIDTH * w / total))
    const row = (cells: string[], header: boolean, index: number) => `<w:tr>${header ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells.map((text, c) =>
        cell(para({ text, bold: header, size, color: header ? COLOR.ink : COLOR.text }, { after: 0, align: numeric[c] ? 'right' : 'left' }), widths[c],
            { fill: header ? COLOR.header : index % 2 ? COLOR.zebra : undefined })).join('')}</w:tr>`
    return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders(COLOR.line)}</w:tblBorders><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${row(table.columns, true, 0)}${table.rows.map((cells, index) => row(cells.map(cellText), false, index)).join('')}</w:tbl>`
}

const EMU_PER_TWIP = 635
const CHART_SHEET = 'Данные'

/** Диаграмма в тексте: ссылка на часть word/charts/chartN.xml. */
function chartParagraph(index: number, chart: ReportChart) {
    const cx = TEXT_WIDTH * EMU_PER_TWIP
    const inches = chart.type === 'hbar' ? Math.min(7, 1 + chart.labels.length * 0.32 * Math.max(1, chart.series.length * 0.7)) : chart.type === 'pie' || chart.type === 'donut' ? 3.2 : 3.4
    const cy = Math.round(inches * 914400)
    return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="160"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${index}" name="Диаграмма ${index}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdChart${index}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

function body(report: ReportDocument, charts: ReportChart[]) {
    const parts: string[] = []
    parts.push(para({ text: REPORT_BRAND, bold: true, size: 8, color: COLOR.accent, caps: true }, { after: 120 }))
    parts.push(para({ text: report.title }, { style: 'Title' }))
    if (report.subtitle) parts.push(para({ text: report.subtitle }, { style: 'Subtitle' }))
    parts.push(para({ text: `Сформировано ${displayTime(report.generatedAt)} по Сургуту · ИИ-ассистент «Вектора города»`, size: 8.5, color: COLOR.muted }, { after: 240 }))
    if (report.metrics.length) parts.push(metricsTable(report), para({ text: '' }, { after: 120 }))
    if (report.summary.length) {
        parts.push(para({ text: 'Главное' }, { style: 'Heading1', keepNext: true }))
        report.summary.forEach(item => parts.push(para({ text: item, color: COLOR.ink }, { bullet: true })))
    }
    report.sections.forEach((section, index) => {
        if (section.heading) parts.push(para({ text: `${index + 1}. ${section.heading}` }, { style: 'Heading1', keepNext: true }))
        section.paragraphs.forEach(text => parts.push(para({ text })))
        section.bullets.forEach(text => parts.push(para({ text }, { bullet: true })))
        if (section.chart) {
            charts.push(section.chart)
            parts.push(chartParagraph(charts.length, section.chart))
            if (section.chart.note) parts.push(para({ text: section.chart.note, size: 8.5, color: COLOR.muted }, { after: 120 }))
        }
        if (section.table) {
            if (section.table.title) parts.push(para({ text: section.table.title, bold: true, color: COLOR.ink }, { keepNext: true, after: 80 }))
            if (section.table.rows.length) parts.push(dataTable(section.table))
            if (section.table.note) parts.push(para({ text: section.table.note, size: 8.5, color: COLOR.muted }, { before: 60 }))
            else parts.push(para({ text: '' }, { after: 60 }))
        }
    })
    return parts.join('')
}

const STYLES = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="${COLOR.text}"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLOR.ink}"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:color w:val="${COLOR.muted}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="E2E8F0"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLOR.ink}"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="${COLOR.muted}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`

const NUMBERING = `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="260"/></w:pPr><w:rPr><w:color w:val="${COLOR.accent}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`

const field = (code: string) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`

export function renderReportDocx(report: ReportDocument): Uint8Array {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const footer = `<w:ftr xmlns:w="${W}" xmlns:r="${R}"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs></w:pPr>${run({ text: `${report.title.slice(0, 90)} · ${displayTime(report.generatedAt)}` })}<w:r><w:tab/></w:r>${field('PAGE')}${run({ text: ' из ' })}${field('NUMPAGES')}</w:p></w:ftr>`
    const charts: ReportChart[] = []
    const content = body(report, charts)
    const document = `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${content}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`
    const xml = (content: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`)
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    // Каждая диаграмма — своя часть и своя встроенная книга с данными («Изменить данные» в Word).
    const chartFiles: Record<string, Uint8Array> = {}
    charts.forEach((chart, i) => {
        const n = i + 1
        chartFiles[`word/charts/chart${n}.xml`] = strToU8(chartSpaceXml(chart, CHART_SHEET, { externalDataId: 'rIdData' }))
        chartFiles[`word/charts/_rels/chart${n}.xml.rels`] = xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdData" Type="${R}/package" Target="../embeddings/chart${n}.xlsx"/></Relationships>`)
        chartFiles[`word/embeddings/chart${n}.xlsx`] = createXlsx([{ name: CHART_SHEET, rows: chartDataRows(officeChartView(chart)) }])
    })
    const chartTypes = charts.map((_, i) => `<Override PartName="/word/charts/chart${i + 1}.xml" ContentType="${CHART_CONTENT_TYPE}"/>`).join('')
    const chartRels = charts.map((_, i) => `<Relationship Id="rIdChart${i + 1}" Type="${R}/chart" Target="charts/chart${i + 1}.xml"/>`).join('')
    return zipSync({
        ...chartFiles,
        '[Content_Types].xml': xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>${chartTypes}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
        '_rels/.rels': xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
        'docProps/core.xml': xml(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(report.title)}</dc:title><dc:creator>ИИ-ассистент «Вектора города»</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`),
        'word/_rels/document.xml.rels': xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="rIdFooter" Type="${R}/footer" Target="footer1.xml"/>${chartRels}</Relationships>`),
        'word/document.xml': xml(document),
        'word/styles.xml': xml(STYLES),
        'word/numbering.xml': xml(NUMBERING),
        'word/footer1.xml': xml(footer),
    }, { level: 6 })
}
