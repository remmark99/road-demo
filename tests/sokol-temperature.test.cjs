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
const TIME = '2026-11-17T09:00:00Z'
/** Ответ метеомониторинга: индикатор 4 — температура, индикатор 6 — влажность, точка Сокол (1). */
const indicators = (temperature, humidity, { temperatureTime = TIME, humidityTime = TIME, temperaturePoint = 1, humidityPoint = 1 } = {}) => [
  { id: 4, current_values: [{ pointId: temperaturePoint, value: temperature, time: temperatureTime }] },
  { id: 5, current_values: [{ pointId: 1, value: '1020.9', time: TIME }] },
  { id: 6, current_values: [{ pointId: humidityPoint, value: humidity, time: humidityTime }] },
]
test('Сокол parsing: temperature and humidity, signed delta', () => {
  const { parseSokolTemperature: parse, temperatureDelta: delta } = load('lib/sokol-temperature.ts')
  assert.deepEqual(parse(indicators('-12.5', '94')), {
    temperature: -12.5, temperatureTime: '2026-11-17T09:00:00.000Z',
    humidity: 94, humidityTime: '2026-11-17T09:00:00.000Z',
  })
  assert.equal(delta(10, 5), '+5.0 °C')
  assert.equal(delta(-10, -5), '−5.0 °C')
  assert.equal(delta(5, 5), '0.0 °C')
  for (const value of [undefined, null, NaN, Infinity]) assert.equal(delta(value, 5), null)
  assert.equal(delta(5, undefined), null)
})
test('Сокол parsing: each value is validated on its own', () => {
  const { parseSokolTemperature: parse } = load('lib/sokol-temperature.ts')
  // Недоступен весь метеомониторинг — недоступно и всё показание.
  for (const data of [null, {}, [], [{ id: 5, current_values: [{ pointId: 1, value: '1', time: TIME }] }]]) assert.equal(parse(data), null)
  // Мусор во влажности не гасит температуру и наоборот.
  for (const value of ['', ' ', null, true, 'NaN', 'Infinity', '12x']) {
    assert.deepEqual(parse(indicators('-12.5', value)), {
      temperature: -12.5, temperatureTime: '2026-11-17T09:00:00.000Z', humidity: null, humidityTime: null,
    })
    assert.deepEqual(parse(indicators(value, '94')), {
      temperature: null, temperatureTime: null, humidity: 94, humidityTime: '2026-11-17T09:00:00.000Z',
    })
  }
  // Чужая точка и битое время — значение недоступно, второе остаётся.
  assert.equal(parse(indicators('-12.5', '94', { humidityPoint: 2 })).humidity, null)
  assert.equal(parse(indicators('-12.5', '94', { humidityPoint: 2 })).temperature, -12.5)
  assert.equal(parse(indicators('-12.5', '94', { temperatureTime: 'bad' })).temperature, null)
  assert.equal(parse(indicators('-12.5', '94', { humidityTime: 'bad' })).humidity, null)
  // Своё время у каждого значения: старую влажность видно отдельно от свежей температуры.
  const mixed = parse(indicators('-12.5', '94', { humidityTime: '2026-11-17T05:00:00Z' }))
  assert.equal(mixed.temperatureTime, '2026-11-17T09:00:00.000Z')
  assert.equal(mixed.humidityTime, '2026-11-17T05:00:00.000Z')
})
test('route handles upstream failures and invalid data', async () => {
  const original = global.fetch
  try {
    const { GET } = load('app/api/sokol-temperature/route.ts', { 'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } } })
    for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }, { ok: true, json: async () => [] }]) {
      global.fetch = async () => response
      assert.equal((await GET()).status, 503)
    }
    global.fetch = async () => { throw new Error('timeout') }
    assert.equal((await GET()).status, 503)
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api-meteor.admsurgut.ru/api/v2/indicators')
      assert.equal(options.next.revalidate, 300)
      assert.ok(options.signal)
      return { ok: true, json: async () => indicators('0', '94') }
    }
    const ok = await GET()
    assert.equal(ok.body.temperature, 0)
    assert.equal(ok.body.humidity, 94)
    // Одно отсутствующее значение — это не отказ метеомониторинга.
    global.fetch = async () => ({ ok: true, json: async () => indicators('-0.2', '', { humidityPoint: 2 }) })
    const partial = await GET()
    assert.equal(partial.status, 200)
    assert.equal(partial.body.temperature, -0.2)
    assert.equal(partial.body.humidity, null)
  } finally { global.fetch = original }
})
test('compact outdoor readout: icons with values, delta for temperature and humidity', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { SokolTemperature, PavilionTemperatureDelta, PavilionHumidityDelta } = load('components/map/sokol-temperature.tsx')
  const originalNow = Date.now
  const now = Date.parse('2026-11-17T10:00:00Z')
  Date.now = () => now
  try {
    const time = new Date(now - 60000).toISOString()
    const outdoor = { temperature: -0.2, temperatureTime: time, humidity: 94, humidityTime: time }
    const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))
    const readout = render(SokolTemperature, { reading: outdoor })
    assert.match(readout, /-0,2 °C/)
    assert.match(readout, /94 %/)
    // Словесных подписей у показаний нет — только значки, значения и доступное имя для скринридера.
    assert.doesNotMatch(readout, /На улице/)
    assert.doesNotMatch(readout, /Сокол|измерение|UTC|2026/)
    assert.match(readout, /Температура воздуха на улице/)
    assert.match(readout, /Относительная влажность на улице/)
    assert.match(render(PavilionTemperatureDelta, { indoor: 13.6, measuredAt: time, outdoor }), /На 13,8 °C теплее улицы/)
    assert.match(render(PavilionTemperatureDelta, { indoor: -2, measuredAt: time, outdoor }), /На 1,8 °C холоднее улицы/)
    assert.match(render(PavilionTemperatureDelta, { indoor: -0.2, measuredAt: time, outdoor }), /Как на улице/)
    assert.match(render(PavilionHumidityDelta, { indoor: 68.7, measuredAt: time, outdoor }), /На 25,3 п\.п\. суше улицы/)
    assert.match(render(PavilionHumidityDelta, { indoor: 97.4, measuredAt: time, outdoor }), /На 3,4 п\.п\. влажнее улицы/)
    assert.match(render(PavilionHumidityDelta, { indoor: 94, measuredAt: time, outdoor }), /Как на улице/)
    // Старое, будущее и битое время скрывает каждое значение по своему полю.
    for (const bad of [new Date(now - 14400000).toISOString(), new Date(now + 60000).toISOString(), 'bad']) {
      const stale = render(SokolTemperature, { reading: { ...outdoor, temperatureTime: bad } })
      assert.match(stale, /—/)
      assert.doesNotMatch(stale, /-0,2 °C/)
      assert.match(stale, /94 %/)
      const staleHumidity = render(SokolTemperature, { reading: { ...outdoor, humidityTime: bad } })
      assert.doesNotMatch(staleHumidity, /94 %/)
      assert.match(staleHumidity, /-0,2 °C/)
      assert.equal(render(PavilionTemperatureDelta, { indoor: 13.6, measuredAt: time, outdoor: { ...outdoor, temperatureTime: bad } }), '')
      assert.equal(render(PavilionTemperatureDelta, { indoor: 13.6, measuredAt: bad, outdoor }), '')
      assert.equal(render(PavilionHumidityDelta, { indoor: 68.7, measuredAt: time, outdoor: { ...outdoor, humidityTime: bad } }), '')
      assert.equal(render(PavilionHumidityDelta, { indoor: 68.7, measuredAt: bad, outdoor }), '')
    }
    // Метеомониторинг недоступен: значки остаются, значений нет — вместо них прочерк.
    const unavailable = render(SokolTemperature, { reading: null })
    assert.match(unavailable, /Метеомониторинг недоступен/)
    assert.doesNotMatch(unavailable, /°C|94 %/)
    // Влажность без улицы не сравниваем: второго значения просто нет.
    assert.equal(render(PavilionHumidityDelta, { indoor: 68.7, measuredAt: time, outdoor: { ...outdoor, humidity: null, humidityTime: null } }), '')
    assert.equal(render(PavilionTemperatureDelta, { indoor: NaN, measuredAt: time, outdoor }), '')
    assert.equal(render(PavilionHumidityDelta, { indoor: undefined, measuredAt: time, outdoor }), '')
  } finally { Date.now = originalNow }
})
