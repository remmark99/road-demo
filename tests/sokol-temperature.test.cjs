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
test('compact current temperature and delta; stale, future and invalid samples hidden', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { SokolTemperature, PavilionTemperatureDelta } = load('components/map/sokol-temperature.tsx')
  const originalNow = Date.now
  const now = Date.parse('2026-11-17T10:00:00Z')
  Date.now = () => now
  try {
    const time = new Date(now - 60000).toISOString()
    const outdoor = { temperature: -0.2, time }
    const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))
    assert.match(render(SokolTemperature, { reading: outdoor }), /На улице -0,2 °C/)
    assert.doesNotMatch(render(SokolTemperature, { reading: outdoor }), /Сокол|измерение|UTC|2026/)
    assert.match(render(PavilionTemperatureDelta, { indoor: 13.6, measuredAt: time, outdoor }), /На 13,8 °C теплее улицы/)
    assert.match(render(PavilionTemperatureDelta, { indoor: -2, measuredAt: time, outdoor }), /На 1,8 °C холоднее улицы/)
    assert.match(render(PavilionTemperatureDelta, { indoor: -0.2, measuredAt: time, outdoor }), /Как на улице/)
    for (const bad of [new Date(now - 14400000).toISOString(), new Date(now + 60000).toISOString(), 'bad']) {
      assert.match(render(SokolTemperature, { reading: { ...outdoor, time: bad } }), /недоступна/)
      assert.equal(render(PavilionTemperatureDelta, { indoor: 13.6, measuredAt: time, outdoor: { ...outdoor, time: bad } }), '')
      assert.equal(render(PavilionTemperatureDelta, { indoor: 13.6, measuredAt: bad, outdoor }), '')
    }
    assert.match(render(SokolTemperature, { reading: null }), /недоступна/)
    assert.equal(render(PavilionTemperatureDelta, { indoor: NaN, measuredAt: time, outdoor }), '')
  } finally { Date.now = originalNow }
})
