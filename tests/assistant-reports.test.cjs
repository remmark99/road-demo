const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { unzipSync, strFromU8 } = require('fflate')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, cache = {}) {
  file = path.resolve(root, file)
  if (cache[file]) return cache[file].exports
  const module = { exports: {} }; cache[file] = module
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id in mocks) return mocks[id]
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts', mocks, cache)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), mocks, cache)
    return require(id)
  }, module, module.exports)
  return module.exports
}

const documentLib = load('lib/reports/document.ts')
const render = load('lib/reports/render.ts')

const SAMPLE = {
  title: 'Состояние остановочных павильонов за неделю',
  subtitle: '06.11.2026 — 13.11.2026, все остановки',
  summary: ['На связи 212 из 230 камер (92%). Дольше всех не в сети камера 131 на остановке «Никольский» — 31 час.', 'За неделю 48 событий безопасности, больше всего — курение (29). 🚬'],
  metrics: [{ label: 'Камер не в сети', value: '18 из 230' }, { label: 'События безопасности', value: '48', note: 'за 7 дней' }, { label: 'Переполненных урн сейчас', value: '3' }, { label: 'Остановок с нарушениями', value: '11' }],
  sections: [
    { heading: 'Отключения оборудования', paragraphs: ['Простои сосредоточены в **14-м микрорайоне**.'], bullets: ['Камера 131 — 31 ч', 'Контроллер 180 — 12 ч'],
      table: { columns: ['Оборудование', 'Номер', 'Остановка', 'Простой, мин'], rows: [['камера', 131, 'Никольский (в центр)', 1860], ['контроллер датчиков', 180, 'Никольский (из центра)', 720.5]] } },
    { heading: 'Пустой раздел без данных', table: { columns: ['Данные'], rows: [], note: 'Нет данных за выбранный период.' } },
  ],
}

test('отчёт приводится к безопасному виду', () => {
  const report = documentLib.normalizeReport(SAMPLE, '2026-11-13 18:40')
  assert.equal(report.title, SAMPLE.title)
  assert.equal(report.sections[0].paragraphs[0], 'Простои сосредоточены в 14-м микрорайоне.')
  assert.ok(!report.summary[1].includes('🚬'))
  assert.equal(report.sections[0].table.rows[0][1], 131)
  assert.throws(() => documentLib.normalizeReport({ title: '' }, ''), documentLib.ReportInputError)
  assert.throws(() => documentLib.normalizeReport({ title: 'Пусто' }, ''), documentLib.ReportInputError)
  assert.equal(documentLib.reportFileName(report, 'pdf'), 'Состояние остановочных павильонов за неделю 2026-11-13.pdf')
})

test('пояснение из значения плитки уходит в подпись', () => {
  const report = documentLib.normalizeReport({ title: 'T', summary: ['s'], metrics: [
    { label: 'События', value: '4 (2 лежачих, 2 курения)' },
    { label: 'Климат', value: '1 (Никольский в центр: -11.2°C' },
    { label: 'Камер не в сети', value: '12 из 230' },
  ] }, '2026-11-13 18:40')
  assert.deepEqual(report.metrics[0], { label: 'События', value: '4', note: '2 лежачих, 2 курения' })
  assert.equal(report.metrics[1].value, '1')
  assert.deepEqual(report.metrics[2], { label: 'Камер не в сети', value: '12 из 230' })
})

const samples = process.env.REPORT_SAMPLES_DIR

const days = ['06.11', '07.11', '08.11', '09.11', '10.11', '11.11', '12.11', '13.11']
const CHARTS = [
  { type: 'stacked', title: 'События безопасности по дням', unit: 'событий', labels: days, series: [
    { name: 'Лежачий человек', values: [3, 5, 2, 0, 4, 6, 2, 1] }, { name: 'Курение', values: [6, 4, 7, 5, 3, 8, 6, 2] }, { name: 'Оставленный предмет', values: [1, 0, 2, 1, 0, 1, 3, 0] }] },
  { type: 'line', title: 'Людей в кадре по часам суток', unit: 'чел.', labels: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), series: [
    { name: 'В среднем', values: Array.from({ length: 24 }, (_, h) => Math.round(10 * (2 + 6 * Math.exp(-((h - 8) ** 2) / 6) + 5 * Math.exp(-((h - 18) ** 2) / 5))) / 10) },
    { name: 'Пик', values: Array.from({ length: 24 }, (_, h) => Math.round(4 + 12 * Math.exp(-((h - 8) ** 2) / 6) + 10 * Math.exp(-((h - 18) ** 2) / 5))) }] },
  { type: 'hbar', title: 'Самые холодные павильоны сейчас', unit: '°C', labels: ['Никольский (в центр)', 'Взлётный', 'ТЦ Славянский', 'ул. Юности', 'Центральный рынок'], series: [{ name: 'Температура', values: [-11.2, -7.9, -3.1, 1.5, 4] }] },
  { type: 'donut', title: 'Состояние остановок сейчас', unit: 'остановок', labels: ['Норма', 'Одно нарушение', 'Два и больше', 'Нет данных'], labelColors: ['#0ca30c', '#fab219', '#d03b3b', '#94a3b8'], series: [{ name: 'Остановки', values: [61, 19, 6, 8] }] },
  { type: 'pie', title: 'События безопасности по типам', unit: 'событий', labels: ['Курение', 'Лежачий человек', 'Оставленный предмет', 'Собаки без людей'], series: [{ name: 'События', values: [41, 23, 8, 3] }] },
  { type: 'bar', title: 'Связь оборудования сейчас', unit: 'шт.', labels: ['В сети', 'Не в сети', 'Нет данных'], series: [{ name: 'Камеры', values: [212, 18, 4] }, { name: 'Контроллеры датчиков', values: [81, 9, 4] }] },
  { type: 'area', title: 'Влажность в павильоне · Никольский', unit: '%', labels: days, series: [{ name: 'Влажность', values: [62, 70, 85, 91, 88, 76, null, 64] }] },
]

test('PDF, Excel и Word собираются и содержат отчёт', () => {
  const withCharts = { ...SAMPLE, sections: [...SAMPLE.sections, ...CHARTS.map((chart, i) => ({ heading: `График ${i + 1}: ${chart.type}`, chart }))] }
  const report = documentLib.normalizeReport(withCharts, '2026-11-13 18:40')
  assert.equal(report.sections.filter(s => s.chart).length, 7)
  const pdf = render.renderReport(report, 'pdf')
  assert.equal(pdf.contentType, 'application/pdf')
  assert.equal(Buffer.from(pdf.body.slice(0, 5)).toString(), '%PDF-')
  assert.ok(pdf.body.length < 1_500_000, `PDF ${pdf.body.length} байт`)

  const xlsx = render.renderReport(report, 'xlsx')
  const book = unzipSync(xlsx.body)
  const workbook = strFromU8(book['xl/workbook.xml'])
  assert.match(workbook, /name="Отчёт"/)
  assert.match(workbook, /name="Показатели"/)
  assert.match(workbook, /name="Отключения оборудования"/)
  assert.ok(Object.keys(book).filter(name => /^xl\/charts\/chart\d+\.xml$/.test(name)).length === 7)
  assert.ok(Object.values(book).some(file => /<c:doughnutChart>/.test(strFromU8(file))))

  const docx = render.renderReport(report, 'docx')
  const word = unzipSync(docx.body)
  const xml = strFromU8(word['word/document.xml'])
  assert.match(xml, /Состояние остановочных павильонов за неделю/)
  assert.match(xml, /w:tblHeader/)
  assert.match(xml, /720,5/)
  assert.ok(word['word/footer1.xml'] && word['word/numbering.xml'])
  assert.equal(Object.keys(word).filter(name => /^word\/charts\/chart\d+\.xml$/.test(name)).length, 7)
  assert.ok(word['word/embeddings/chart1.xlsx'])
  assert.match(strFromU8(word['word/charts/chart1.xml']), /<c:grouping val="stacked"\/>/)

  if (samples) for (const file of [pdf, xlsx, docx]) fs.writeFileSync(path.join(samples, `sample.${file.fileName.split('.').pop()}`), file.body)
})

test('график: проверка, доли и «Другое» у круговой, домен оси с нулём', () => {
  const chartLib = load('lib/reports/chart.ts')
  assert.equal(chartLib.normalizeChart({ type: 'radar', labels: ['a'], series: [{ name: 'x', values: [1] }] }), undefined)
  assert.equal(chartLib.normalizeChart({ type: 'bar', labels: ['a'], series: [{ name: 'x', values: [null] }] }), undefined)
  const pie = chartLib.normalizeChart({ type: 'pie', title: 'Доли', labels: 'abcdefghij'.split(''), series: [{ name: 'x', values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] }, { name: 'лишняя', values: [1] }] })
  assert.equal(pie.labels.length, 7)
  assert.equal(pie.labels[6], 'Другое')
  assert.equal(pie.series.length, 1)
  assert.equal(pie.series[0].values[6], 10)
  assert.deepEqual(chartLib.valueDomain({ type: 'hbar', labels: ['a', 'b'], series: [{ name: 't', values: [-11.2, 4] }] }), [-15, 5])
  assert.deepEqual(chartLib.valueDomain({ type: 'stacked', labels: ['a'], series: [{ name: 'x', values: [3] }, { name: 'y', values: [4] }] }), [0, 8])
})

const tools = { VECTOR_TOOLS: [], SECURITY_TYPES: [], EVENT_LABELS: {}, runVectorTool: async () => { throw new Error('mock') } } // только outputTable
const outages = {
  period: { from: '2026-11-06 00:00', to: '2026-11-13 18:40' }, devices_with_outages: 3, outages: 5, downtime_minutes: 2600,
  worst: [
    { kind: 'камера', id: 131, stop_id: 179, stop: 'Никольский (в центр)', outages: 2, downtime_minutes: 1860, offline_now: true },
    { kind: 'контроллер датчиков', id: 180, stop_id: 180, stop: 'Никольский (из центра)', outages: 3, downtime_minutes: 740, offline_now: false },
  ],
}

test('таблица из вывода инструмента: русские заголовки, без служебных полей', () => {
  const { outputTable } = load('lib/mcp/vector/report-tool.ts', { './tools': tools })
  const table = outputTable('equipment_outages', outages)
  assert.deepEqual(table.columns, ['Оборудование', 'Номер', 'Остановка', 'Отключений', 'Простой, мин', 'Не в сети сейчас'])
  assert.deepEqual(table.rows[0], ['камера', 131, 'Никольский (в центр)', 2, 1860, 'да'])
  assert.equal(table.note, 'Показаны первые 2 из 3.')
  const events = outputTable('security_events', { group_by: 'day', total: 7, groups: [{ key: '2026-11-12', count: 2 }] })
  assert.deepEqual(events.columns, ['День', 'Событий'])
  assert.equal(events.note, undefined) // total — число событий, а не групп
  assert.deepEqual(events.rows[0], ['12.11.2026', 2])
  const status = outputTable('equipment_status', { total: 1, items: [{ kind: 'камера', id: 5, status: 'offline', since: '2026-11-13 17:10', minutes: 90 }] })
  assert.deepEqual(status.rows[0], ['камера', 5, 'не в сети', '13.11.2026 17:10', 90])
})

test('create_report берёт таблицы из инструментов данных и сообщает об ошибке параметров', async () => {
  const calls = []
  const fake = { name: 'equipment_outages', handler: async () => outages }
  const mocked = { VECTOR_TOOLS: [fake], SECURITY_TYPES: [], EVENT_LABELS: {}, runVectorTool: async (ctx, tool, args) => { calls.push(args); return tool.handler(ctx, args) } }
  const { REPORT_TOOL } = load('lib/mcp/vector/report-tool.ts', { './tools': mocked })
  const ctx = { db: null, now: Date.parse('2026-11-13T13:40:00Z') }
  const result = await REPORT_TOOL.handler(ctx, {
    title: 'Отключения за неделю', from: '2026-11-06', to: '2026-11-13', summary: ['Три устройства с простоями.'],
    sections: [{ heading: 'Самые долгие простои', table: 'equipment_outages', stop: 'Никольский' }, { heading: 'Рекомендации', bullets: ['Проверить питание'] }],
  })
  assert.equal(result.report.generatedAt, '2026-11-13 18:40')
  assert.equal(result.report.sections[0].table.rows.length, 2)
  assert.equal(result.report.sections[0].table.title, 'Самые долгие отключения оборудования')
  assert.equal(result.report.sections[1].table, undefined)
  assert.deepEqual(calls[0], { limit: 100, from: '2026-11-06', to: '2026-11-13', stop: 'Никольский' })
  await assert.rejects(REPORT_TOOL.handler(ctx, { title: 'X', summary: ['y'], sections: [{ heading: 'Погода', table: 'weather' }] }), /table должен быть/)
})
