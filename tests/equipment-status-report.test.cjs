const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file) {
  const module = { exports: {} }
  const absolute = path.resolve(root, file)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => id.startsWith('./') ? load(path.relative(root, path.resolve(path.dirname(absolute), id + '.ts'))) : require(id), module, module.exports)
  return module.exports
}
const { equipmentStatusSheets, localDateTime, humanDuration } = load('lib/exports/equipment-status-report.ts')
const { createXlsx } = load('lib/exports/xlsx.ts')
const at = Date.parse('2026-11-17T08:40:00Z') // 13:40 по Сургуту
const H = 3_600_000

test('report shows status at the moment of export and outages for the period', () => {
  const stops = new Map([[1, { id: 1, name: 'ДОСААФ', number: '104', district: 'микрорайон Хозоны' }], [2, { id: 2, name: '32 микрорайон', number: '106', district: '20а' }]])
  const states = [
    { equipment_type: 'camera', equipment_id: 10140, bus_stop_id: 1, stop_name: null, status: 'offline', status_since: new Date(at - 30 * H).toISOString() },
    { equipment_type: 'controller', equipment_id: 1, bus_stop_id: 1, stop_name: null, status: 'online', status_since: null },
    { equipment_type: 'camera', equipment_id: 150, bus_stop_id: 2, stop_name: null, status: 'online', status_since: null },
  ]
  const outages = [{ id: 7, equipment_type: 'camera', equipment_id: 10140, bus_stop_id: 1, started_at: new Date(at - 30 * H).toISOString(), ended_at: null }]
  const sheets = equipmentStatusSheets({ at, from: at - 7 * 24 * H, to: at, states, stops, outages })
  assert.deepEqual(sheets.map(s => s.name), ['Сводка', 'Устройства', 'Не работает сейчас', 'По остановкам', 'Отключения за период'])
  assert.equal(localDateTime(at), '17.11.2026 13:40')
  assert.deepEqual(sheets[0].rows[1], ['Отчёт сформирован (время Сургута)', '17.11.2026 13:40'])
  assert.deepEqual(sheets[2].rows.slice(1), [['Не в сети', '16.11.2026 07:40', '1 дн 6 ч', 30, 'ДОСААФ', '104', 'микрорайон Хозоны', 'Камера № 140']])
  assert.equal(sheets[1].rows[1][0], 'Не в сети') // неработающее — сверху
  assert.deepEqual(sheets[3].rows.slice(1).map(r => [r[0], r[1]]), [['Частично', 'ДОСААФ'], ['Всё работает', '32 микрорайон']])
  assert.equal(sheets[4].rows[1][5], 'не вернулось')
  assert.equal(humanDuration(45 * 60_000), '45 мин')
  const file = createXlsx(sheets)
  fs.writeFileSync(process.env.REPORT_OUT || path.join(require('os').tmpdir(), 'equipment-report-test.xlsx'), file)
  assert.ok(file.length > 1000)
})
