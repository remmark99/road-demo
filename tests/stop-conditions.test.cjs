const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.resolve(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  return module.exports
}
const { stopConditionAt, resolveThresholds, climateSampleHours, DEFAULT_CONDITION_THRESHOLDS: norms } = load('lib/stop-conditions.ts')
const H = 3_600_000, T = Date.parse('2026-11-10T12:30:00Z')
const series = (over = {}) => ({ climate: [[T - 30 * 60_000, 18, 50]], bins: [], incidents: [], ...over })

test('all four criteria in norm give green, one violation orange, two or more red', () => {
  assert.equal(stopConditionAt(series(), norms, T, { hasCameras: true }).level, 'ok')
  const hot = stopConditionAt(series({ climate: [[T - 60_000, 35, 50]] }), norms, T, { hasCameras: true })
  assert.deepEqual([hot.level, hot.issues], ['warn', ['Температура вне нормы']])
  const bad = stopConditionAt(series({ climate: [[T - 60_000, 35, 90]], bins: [[T - H, null]], incidents: [T - 10 * 60_000] }), norms, T, { hasCameras: true })
  assert.deepEqual([bad.level, bad.issues], ['bad', ['Температура вне нормы', 'Влажность вне нормы', 'Урна переполнена', 'Инцидент']])
})

test('history is judged at the slider moment: closed bins, old incidents and future data do not count', () => {
  const s = series({ climate: [[T - 2 * H, 18, 50], [T + 10 * 60_000, 40, 50]], bins: [[T - 3 * H, T - H], [T + H, null]], incidents: [T - 2 * H, T + 60_000] })
  const at = stopConditionAt(s, norms, T, { hasCameras: true })
  assert.deepEqual([at.level, at.temperature], ['ok', 18])
  assert.equal(stopConditionAt(s, norms, T - 2 * H, { hasCameras: true }).level, 'bad')
})

test('missing data is grey, not green; stale climate older than two hours is ignored', () => {
  assert.equal(stopConditionAt(undefined, norms, T, { hasCameras: false }).level, 'unknown')
  const stale = stopConditionAt(series({ climate: [[T - 3 * H, 40, 99]] }), norms, T, { hasCameras: false })
  assert.deepEqual([stale.level, stale.temperature], ['unknown', null])
  assert.equal(stopConditionAt(undefined, norms, T, { hasCameras: true }).level, 'ok')
})

test('a switched-off metric is not judged', () => {
  const off = { ...norms, tempEnabled: false }
  assert.equal(stopConditionAt(series({ climate: [[T - 60_000, 40, 50]] }), off, T, { hasCameras: false }).level, 'ok')
})

test('thresholds come from the settings override, then the backend catalog, then built-in defaults', () => {
  const t = resolveThresholds({ sensor_temp_max: 25, sensor_humidity_alerts_enabled: false }, { sensor_temp_min: '-10.0', sensor_temp_max: 30, sensor_humidity_max: 'bad' })
  assert.deepEqual(t, { ...norms, tempMin: -10, tempMax: 25, humidityEnabled: false })
})

test('climate is sampled hourly for a week and thinned for long periods', () => {
  assert.equal(climateSampleHours(7 * 24 * H), 1)
  assert.equal(climateSampleHours(31 * 24 * H), 4)
})
