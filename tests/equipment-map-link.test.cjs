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
const { equipmentMapHref, parseStopMapLink } = load('lib/equipment-map-link.ts')
const { timeRangeFromParams, timeRangeToParams } = load('lib/analytics/period-params.ts')

test('camera and sensor rows link to their stop on the map, a device without a stop has no link', () => {
  const camera = { equipment_type: 'camera', equipment_id: 151, bus_stop_id: 12, location_id: '36-23' }
  assert.equal(equipmentMapHref(camera, undefined, []), '/?stop=12&tab=cameras&camera=151')
  const controller = { equipment_type: 'controller', equipment_id: 44, bus_stop_id: null, location_id: null }
  assert.equal(equipmentMapHref(controller, undefined, []), '/?stop=44&tab=sensors')
  const outage = { ...camera, bus_stop_id: null, location_id: null }
  assert.equal(equipmentMapHref(outage, { bus_stop_id: 7, location_id: null }, []), '/?stop=7&tab=cameras&camera=151')
  const byLocation = { ...camera, bus_stop_id: null }
  assert.equal(equipmentMapHref(byLocation, undefined, [{ id: 9, short_name: '36-23' }]), '/?stop=9&tab=cameras&camera=151')
  assert.equal(equipmentMapHref(byLocation, undefined, []), null)
})

test('map link parameters survive parsing and reject garbage', () => {
  const parse = query => parseStopMapLink(new URLSearchParams(query))
  assert.deepEqual(parse('stop=12&tab=cameras&camera=151'), { stopId: 12, tab: 'cameras', cameraIndex: 151 })
  assert.deepEqual(parse('stop=12&tab=sensors'), { stopId: 12, tab: 'sensors', cameraIndex: undefined })
  for (const query of ['', 'stop=abc', 'stop=-1', 'stop=1.5']) assert.equal(parse(query), null)
})

test('the period round-trips through the address', () => {
  const roundTrip = result => {
    const params = new URLSearchParams('view=stop_equipment&period=week')
    timeRangeToParams(result, params)
    assert.equal(params.get('view'), 'stop_equipment')
    return timeRangeFromParams(params)
  }
  assert.deepEqual(roundTrip({ preset: 'today' }), { preset: 'today' })
  assert.deepEqual(roundTrip({ preset: 'month' }), { preset: 'month' })
  const custom = roundTrip({ preset: 'custom', customRange: { from: new Date(2026, 10, 1), to: new Date(2026, 10, 5) } })
  assert.equal(custom.customRange.from.getDate(), 1)
  assert.equal(custom.customRange.to.getDate(), 5)
  assert.deepEqual(timeRangeFromParams(new URLSearchParams('period=bogus')), { preset: 'today' })
  assert.deepEqual(timeRangeFromParams(new URLSearchParams('period=custom&from=2026-02-30&to=2026-03-01')), { preset: 'today' })
})
