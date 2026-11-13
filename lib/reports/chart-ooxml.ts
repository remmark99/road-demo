import { chartColor, type ReportChart } from './chart'

/**
 * Диаграмма Office (DrawingML) для Excel и Word: настоящий график, который
 * можно править в Office. Данные лежат на листе (Excel) или во встроенной
 * книге (Word), в самой диаграмме — их кэш, по нему она и рисуется.
 */

export const CHART_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const column = (index: number) => {
    let name = ''
    for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name
    return name
}

/**
 * В Office горизонтальные столбцы рисуются снизу вверх: переворачиваем
 * порядок, чтобы первая строка (самое большое значение) была сверху.
 */
export function officeChartView(chart: ReportChart): ReportChart {
    if (chart.type !== 'hbar') return chart
    return {
        ...chart,
        labels: [...chart.labels].reverse(),
        series: chart.series.map(s => ({ ...s, values: [...s.values].reverse() })),
        ...(chart.labelColors ? { labelColors: [...chart.labelColors].reverse() } : {}),
    }
}

/** Таблица данных диаграммы: шапка и строки, начиная с A1. */
export function chartDataRows(chart: ReportChart): (string | number | null)[][] {
    return [['Показатель', ...chart.series.map(s => s.name)], ...chart.labels.map((label, i) => [label, ...chart.series.map(s => s.values[i])])]
}

const text = (size: number, color: string, bold = false) =>
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="ru-RU"/></a:p></c:txPr>`
const fill = (hex: string) => `<a:solidFill><a:srgbClr val="${hex.slice(1).toUpperCase()}"/></a:solidFill>`

/** Диаграмма; данные — на листе sheet: A1 — шапка, со строки 2 — подписи и серии. */
export function chartSpaceXml(source: ReportChart, sheet: string, options: { externalDataId?: string } = {}): string {
    const chart = officeChartView(source)
    const n = chart.labels.length
    const ref = (col: number, from: number, to?: number) => `'${sheet.replace(/'/g, "''")}'!$${column(col)}$${from}${to !== undefined ? `:$${column(col)}$${to}` : ''}`
    const strCache = (values: string[]) => `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`
    const numCache = (values: (number | null)[]) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`
    const tx = (k: number) => `<c:tx><c:strRef><c:f>${ref(k + 1, 1)}</c:f>${strCache([chart.series[k].name])}</c:strRef></c:tx>`
    const cat = `<c:cat><c:strRef><c:f>${ref(0, 2, n + 1)}</c:f>${strCache(chart.labels)}</c:strRef></c:cat>`
    const val = (k: number) => `<c:val><c:numRef><c:f>${ref(k + 1, 2, n + 1)}</c:f>${numCache(chart.series[k].values)}</c:numRef></c:val>`
    const pie = chart.type === 'pie' || chart.type === 'donut'
    const many = n > 31

    let body: string
    if (pie) {
        const points = chart.labels.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(chartColor(chart, 0, i))}<a:ln w="19050">${fill('#FFFFFF')}</a:ln></c:spPr></c:dPt>`).join('')
        // Подписи долей тёмным текстом: у круговой — снаружи, у кольцевой — на кольце.
        const labels = '<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>'
            + `${text(900, '0F172A', true)}${chart.type === 'pie' ? '<c:dLblPos val="outEnd"/>' : ''}<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`
        const series = `<c:ser><c:idx val="0"/><c:order val="0"/>${tx(0)}${points}${labels}${cat}${val(0)}</c:ser>`
        body = chart.type === 'donut'
            ? `<c:doughnutChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`
            : `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`
    } else {
        const series = chart.series.map((s, k) => {
            const color = chartColor(chart, k, 0)
            if (chart.type === 'line') {
                const marker = many ? '<c:marker><c:symbol val="none"/></c:marker>' : `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(color)}<a:ln>${fill(color)}</a:ln></c:spPr></c:marker>`
                return `<c:ser><c:idx val="${k}"/><c:order val="${k}"/>${tx(k)}<c:spPr><a:ln w="28575" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr>${marker}${cat}${val(k)}<c:smooth val="0"/></c:ser>`
            }
            if (chart.type === 'area') {
                return `<c:ser><c:idx val="${k}"/><c:order val="${k}"/>${tx(k)}<c:spPr><a:solidFill><a:srgbClr val="${color.slice(1).toUpperCase()}"><a:alpha val="22000"/></a:srgbClr></a:solidFill><a:ln w="22225">${fill(color)}</a:ln></c:spPr>${cat}${val(k)}</c:ser>`
            }
            const points = chart.series.length === 1 && chart.labelColors
                ? chart.labels.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${fill(chartColor(chart, 0, i))}</c:spPr></c:dPt>`).join('')
                : ''
            return `<c:ser><c:idx val="${k}"/><c:order val="${k}"/>${tx(k)}<c:spPr>${fill(color)}</c:spPr><c:invertIfNegative val="0"/>${points}${cat}${val(k)}</c:ser>`
        }).join('')
        const axes = '<c:axId val="50010"/><c:axId val="50020"/>'
        body = chart.type === 'line' ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/>${axes}</c:lineChart>`
            : chart.type === 'area' ? `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${axes}</c:areaChart>`
            : `<c:barChart><c:barDir val="${chart.type === 'hbar' ? 'bar' : 'col'}"/><c:grouping val="${chart.type === 'stacked' ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${series}<c:gapWidth val="60"/>${chart.type === 'stacked' ? '<c:overlap val="100"/>' : ''}${axes}</c:barChart>`
        const horizontal = chart.type === 'hbar'
        body += `<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/>`
            + '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>'
            + `<c:spPr><a:ln w="6350">${fill('#CBD5E1')}</a:ln></c:spPr>${text(900, '475569')}<c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
            + `<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/>`
            + `<c:majorGridlines><c:spPr><a:ln w="6350">${fill('#E2E8F0')}</a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="0"/>`
            + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${text(900, '64748B')}`
            + '<c:crossAx val="50010"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>'
    }

    const title = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="ru-RU" sz="1200" b="1">${fill('#0F172A')}</a:rPr><a:t>${esc(chart.title + (chart.unit ? `, ${chart.unit}` : ''))}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    const legend = pie || chart.series.length > 1
        ? `<c:legend><c:legendPos val="${pie ? 'r' : 'b'}"/><c:overlay val="0"/>${text(900, '334155')}</c:legend>`
        : ''
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:date1904 val="0"/><c:lang val="ru-RU"/><c:roundedCorners val="0"/>`
        + `<c:chart>${title}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${body}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
        + `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${text(1000, '334155')}`
        + `${options.externalDataId ? `<c:externalData r:id="${options.externalDataId}"><c:autoUpdate val="0"/></c:externalData>` : ''}</c:chartSpace>`
}
