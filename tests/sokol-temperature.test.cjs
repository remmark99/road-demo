const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
function load(file, mocks = {}) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id in mocks) return mocks[id]
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts', mocks)
    return require(id)
  }, mod, mod.exports)
  return mod.exports
}
const sample = value => [{ id: 4, current_values: [{ pointId: 1, value, time: '2026-11-17T09:00:00Z' }] }]
test('Сокол parsing and signed delta', () => {
  const { parseSokolTemperature: parse, temperatureDelta: delta } = load('lib/sokol-temperature.ts')
  assert.deepEqual(parse(sample('-12.5')), { temperature: -12.5, time: '2026-11-17T09:00:00.000Z' })
  for (const data of [[], {}, [{ id: 5 }], [{ id: 4, current_values: [{ pointId: 2, value: 1, time: '2026-11-17' }] }], [{ id: 4, current_values: [{ pointId: 1, value: 1, time: 'bad' }] }]]) assert.equal(parse(data), null)
  assert.equal(delta(10, 5), '+5.0 °C')
  assert.equal(delta(-10, -5), '−5.0 °C')
  assert.equal(delta(5, 5), '0.0 °C')
  for (const value of [undefined, null, NaN, Infinity]) assert.equal(delta(value, 5), null)
  assert.equal(delta(5, undefined), null)
  for (const value of ['', ' ', null, true, 'NaN', 'Infinity', '12x']) assert.equal(parse(sample(value)), null)
  for (const data of [null, {}, [], [{ id: 5, current_values: sample('1')[0].current_values }], [{ id: 4, current_values: [{ pointId: 2, value: '1', time: '2026-11-17T09:00:00Z' }] }], [{ id: 4, current_values: [{ pointId: 1, value: '1', time: 'bad' }] }]]) assert.equal(parse(data), null)
  assert.equal(delta(5, 2), '+3.0 °C')
  assert.equal(delta(-5, 2), '−7.0 °C')
  assert.equal(delta(2, 2), '0.0 °C')
  for (const indoor of [undefined, null, NaN, Infinity]) assert.equal(delta(indoor, 2), null)
})
test('route handles upstream failures and invalid data', async () => {
  const original = global.fetch
  try {
    const { GET } = load('app/api/sokol-temperature/route.ts', { 'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } } })
    for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }]) {
      global.fetch = async () => response
      assert.equal((await GET()).status, 503)
    }
    global.fetch = async () => { throw new Error('timeout') }
    assert.equal((await GET()).status, 503)
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api-meteor.admsurgut.ru/api/v2/indicators')
      assert.equal(options.next.revalidate, 300)
      assert.ok(options.signal)
      return { ok: true, json: async () => sample('0') }
    }
    assert.equal((await GET()).body.temperature, 0)
  } finally { global.fetch = original }
})
test('map shares outdoor sample with modal; readout preserves historical measurement time', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { SokolTemperature } = load('components/map/sokol-temperature.tsx')
  const html = renderToStaticMarkup(React.createElement(SokolTemperature, { reading: { temperature: -12.5, time: '2025-12-03T04:20:00Z' } }))
  assert.match(html, /Сокол/)
  assert.match(html, /2025/)
  assert.match(html, /Последнее измерение/)
  assert.doesNotMatch(html, /сейчас|актуальн/i)
  assert.match(renderToStaticMarkup(React.createElement(SokolTemperature, { reading: null })), /нет данных/)
  const map = fs.readFileSync(path.join(__dirname, '../components/map/surgut-map.tsx'), 'utf8')
  assert.match(map, /<SokolTemperature reading=\{outdoorTemperature\}/)
  assert.match(map, /outdoorTemperature=\{outdoorTemperature\}/)
  assert.match(map, /fetch\("\/api\/sokol-temperature"/)
  const modal = fs.readFileSync(path.join(__dirname, '../components/map/bus-stop-modal.tsx'), 'utf8')
  assert.match(modal, /indoor=\{sensorsOnline && !historicalAt \? temperature : undefined\}/)
  assert.match(modal, /const sensorsOnline = Boolean\(busStop.sensor_data\?\.sensors_online\)/)
  assert.match(modal, /measuredAt=\{climate\?\.temperatureUpdatedAt\}/)
  assert.match(modal, /<PavilionTemperatureDelta/)
})

test('delta UI names last-known samples, warmer/colder/equal and missing data', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { PavilionTemperatureDelta } = load('components/map/sokol-temperature.tsx')
  const render = (indoor, measuredAt = '2025-12-03T04:20:00Z', outdoor = { temperature: 2, measuredAt: '2025-12-03T04:00:00Z' }) => renderToStaticMarkup(React.createElement(PavilionTemperatureDelta, { indoor, measuredAt, outdoor }))
  for (const [value, text, delta] of [[5, 'теплее', '+3.0'], [-5, 'холоднее', '−7.0'], [2, 'одинаковая', '0.0']]) {
    const html = render(value)
    assert.ok(html.includes(text))
    assert.ok(html.includes(delta))
    assert.match(html, /по последним измерениям/)
    assert.match(html, /2025/)
  }
  for (const html of [render(undefined), render(5, 'bad'), render(5, null), render(5, undefined, null)]) {
    assert.match(html, /—/)
    assert.doesNotMatch(html, /теплее|холоднее|одинаковая/)
  }
})
