const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, cache = {}) {
  file = path.resolve(root, file)
  if (cache[file]) return cache[file].exports
  const module = { exports: {} }; cache[file] = module
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id in mocks) return mocks[id]
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts', mocks, cache)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), mocks, cache)
    return require(id)
  }, module, module.exports)
  return module.exports
}

const NOW = Date.parse('2026-11-13T13:40:00Z') // 18:40 по Сургуту
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString()
const tables = {
  bus_stops: [
    { id: 179, name: 'Никольский', short_name: '36-23', description: 'в центр', address: 'пр. Мира, 31', district_id: 1, ip_address: '192.168.1.1', has_controller: true },
    { id: 180, name: 'Никольский', short_name: '36-24', description: 'из центра', address: 'пр. Мира, 30', district_id: 1, ip_address: '192.168.1.2', has_controller: true },
    { id: 601, name: 'ул. Юности', short_name: '50-1', description: null, address: null, district_id: 2, ip_address: null, has_controller: false },
  ],
  districts: [{ id: 1, name: '14-й микрорайон' }, { id: 2, name: 'Центральный' }],
  cameras: [{ camera_index: 10131, bus_stop_id: 179, name: null, module: 'stops' }, { camera_index: 10132, bus_stop_id: 180, name: null, module: 'stops' }, { camera_index: 130, bus_stop_id: 601, name: 'дорожная', module: 'roads' }],
  equipment_state: [
    { equipment_type: 'camera', equipment_id: 131, bus_stop_id: 179, location_id: '73-24', status: 'offline', status_since: iso(90) },
    { equipment_type: 'camera', equipment_id: 132, bus_stop_id: 180, location_id: '73-25', status: 'online', status_since: iso(3000) },
    { equipment_type: 'controller', equipment_id: 179, bus_stop_id: 179, location_id: null, status: 'online', status_since: iso(5000) },
    { equipment_type: 'controller', equipment_id: 180, bus_stop_id: 180, location_id: null, status: 'offline', status_since: iso(30) },
  ],
  alerts: [
    { id: 'a1', alert_type: 'lying_person', camera_index: 10131, timestamp: iso(20), location_id: '73-24', metadata: {} },
    { id: 'a2', alert_type: 'lying_person', camera_index: 10131, timestamp: iso(600), location_id: '73-24', metadata: {} },
    { id: 'a3', alert_type: 'smoking', camera_index: 10132, timestamp: iso(100), location_id: '73-25', metadata: {} },
    { id: 'a4', alert_type: 'smoking', camera_index: 99999, timestamp: iso(5), location_id: '73-25', metadata: {} },
    { id: 'b1', alert_type: 'bin_full', camera_index: 10132, timestamp: iso(200), metadata: { episode_schema: 'bin_episode_v1', bin_episode: { status: 'open', started_at: iso(200), last_seen_at: iso(10), ended_at: null, observation_count: 4 } } },
  ],
  equipment_outages: [
    { equipment_type: 'camera', equipment_id: 131, bus_stop_id: 179, started_at: iso(90), ended_at: null },
    { equipment_type: 'controller', equipment_id: 180, bus_stop_id: 180, started_at: iso(2 * 1440), ended_at: iso(2 * 1440 - 120) },
    { equipment_type: 'controller', equipment_id: 180, bus_stop_id: 180, started_at: iso(500), ended_at: iso(497) },
  ],
  stop_sensor_states: [
    { bus_stop_id: 179, element: 13, category: 'temperature', name: 't', value: -11.2, alarm: 'normal', updated_at: iso(1) },
    { bus_stop_id: 179, element: 13, category: 'humidity', name: 'h', value: 91, alarm: 'normal', updated_at: iso(1) },
    { bus_stop_id: 180, element: 13, category: 'temperature', name: 't', value: 4, alarm: 'normal', updated_at: iso(1) },
  ],
  stop_sensor_history: [
    { bus_stop_id: 179, category: 'temperature', value: -11.2, recorded_at: iso(2) },
    { bus_stop_id: 179, category: 'humidity', value: 91, recorded_at: iso(2) },
    { bus_stop_id: 180, category: 'temperature', value: 4, recorded_at: iso(2) },
    { bus_stop_id: 180, category: 'humidity', value: 50, recorded_at: iso(2) },
  ],
  controller_alerts: [],
  busyness_windows: [{ location_id: '73-24', window_start: iso(3), person_count_avg: 4, person_count_max: 6 }],
  profiles: [],
}
function fakeDb(rpc = {}) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])], one = false
      const q = {
        select() { return q }, order() { return q },
        or(expr) {
          const m = expr.match(/^ended_at\.is\.null,ended_at\.(gt|gte)\.(.+)$/)
          if (m) rows = rows.filter(r => r.ended_at === null || (m[1] === 'gt' ? r.ended_at > m[2] : r.ended_at >= m[2]))
          return q
        },
        eq(k, v) { rows = rows.filter(r => r[k] === v); return q },
        in(k, v) { rows = rows.filter(r => v.includes(r[k])); return q },
        gte(k, v) { rows = rows.filter(r => r[k] >= v); return q },
        lt(k, v) { rows = rows.filter(r => r[k] < v); return q },
        range(a, b) { rows = rows.slice(a, b + 1); return q },
        limit(n) { rows = rows.slice(0, n); return q },
        maybeSingle() { one = true; return q }, single() { one = true; return q },
        then(resolve) { resolve({ data: one ? rows[0] ?? null : rows, error: null }) },
      }
      return q
    },
    rpc(name, args) { return Promise.resolve(rpc[name] ? { data: rpc[name](args), error: null } : { data: null, error: { message: 'no rpc' } }) },
  }
}
const admin = { createNotificationAdminClient: () => fakeDb() }
const server = load('lib/mcp/vector/server.ts', { '@/lib/notifications/admin': admin })
const ctx = (rpc) => ({ db: fakeDb(rpc), now: NOW })
const call = async (name, args, rpc) => {
  const result = await server.callVectorTool(ctx(rpc), name, args)
  return { error: result.isError ? result.content[0].text : null, data: result.isError ? null : JSON.parse(result.content[0].text) }
}

test('protocol: initialize, read-only tool list, unknown method and tool', async () => {
  const init = await server.handleVectorRpc(ctx(), 'initialize', { protocolVersion: '2025-06-18' })
  assert.equal(init.protocolVersion, '2025-06-18'); assert.equal(init.serverInfo.name, 'vector-city'); assert.match(init.instructions, /Сургут/)
  assert.equal((await server.handleVectorRpc(ctx(), 'initialize', { protocolVersion: '1999-01-01' })).protocolVersion, '2025-11-25')
  const { tools } = await server.handleVectorRpc(ctx(), 'tools/list', {})
  assert.equal(tools.length, 13)
  assert.ok(['create_report', 'create_chart'].every(name => tools.some(t => t.name === name)))
  assert.ok(tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint && t.inputSchema.additionalProperties === false))
  await assert.rejects(server.handleVectorRpc(ctx(), 'resources/list', {}), e => e.code === -32601)
  await assert.rejects(server.handleVectorRpc(ctx(), 'tools/call', { name: 'drop_table' }), e => e.code === -32602)
})

test('bad arguments come back as a readable tool error, not an exception', async () => {
  assert.match((await call('find_stops', { limit: 'много' })).error, /limit/)
  assert.match((await call('security_events', { from: 'вчера' })).error, /YYYY-MM-DD/)
  assert.match((await call('security_events', { from: '2026-01-01', to: '2026-11-13' })).error, /92/)
  assert.match((await server.callVectorTool(ctx(), 'find_stops', [1])).content[0].text, /объектом/)
})

test('stops are found by words, an ambiguous name lists candidates with ids', async () => {
  const found = (await call('find_stops', { query: 'никольский' })).data
  assert.equal(found.total, 2)
  assert.deepEqual(found.stops.map(s => [s.id, s.name, s.district, s.cameras, s.cameras_online]), [[179, 'Никольский (в центр)', '14-й микрорайон', 1, 0], [180, 'Никольский (из центра)', '14-й микрорайон', 1, 1]])
  assert.equal((await call('find_stops', { offline_only: true })).data.total, 2)
  const ambiguous = await call('get_stop', { stop: 'Никольский' })
  assert.match(ambiguous.error, /179 — Никольский \(в центр\)/)
  assert.match((await call('get_stop', { stop: 'Сатурн' })).error, /не найдена/)
})

test('a stop card joins equipment, sensors, events, outages and people', async () => {
  const card = (await call('get_stop', { stop: '179' })).data
  assert.equal(card.stop.name, 'Никольский (в центр)')
  assert.deepEqual(card.equipment.map(e => [e.kind, e.status]), [['камера', 'offline'], ['контроллер датчиков', 'online']])
  assert.equal(card.security_events_24h.total, 2)
  assert.deepEqual(card.condition.issues.slice(0, 2), ['Температура вне нормы', 'Влажность вне нормы'])
  assert.equal(card.people_now, 4)
  assert.equal(card.outages_7d.count, 1)
})

test('security events map cameras to stops and group them', async () => {
  const events = (await call('security_events', { group_by: 'stop' })).data
  assert.equal(events.total, 4)
  assert.deepEqual(events.by_type, { 'Лежачий человек': 2, 'Курение': 2 })
  // Камера 99999 не из справочника: остановка находится по направлению 73-25.
  assert.deepEqual(events.groups.map(({ key, count }) => ({ key, count })), [{ key: 'Никольский (в центр)', count: 2 }, { key: 'Никольский (из центра)', count: 2 }])
  // Разбивка группы по типам (для графиков с накоплением) сходится с числом событий.
  assert.ok(events.groups.every(g => Object.values(g.by_type).reduce((a, b) => a + b, 0) === g.count))
  const lying = (await call('security_events', { types: ['lying_person'], stop: 179, group_by: 'hour_of_day' })).data
  assert.equal(lying.total, 2)
})

test('equipment status and outages: offline first by duration, short blips skipped, downtime clipped to the period', async () => {
  const status = (await call('equipment_status', {})).data
  assert.deepEqual(status.items.map(i => [i.id, i.minutes]), [[131, 90], [180, 30]])
  const outages = (await call('equipment_outages', { from: '2026-11-13' })).data
  assert.equal(outages.devices_with_outages, 1)
  assert.equal(outages.worst[0].offline_now, true)
  const week = (await call('equipment_outages', { min_minutes: 0 })).data
  assert.equal(week.outages, 3); assert.equal(week.downtime_minutes, 90 + 120 + 3)
})

test('overview, conditions, climate, bins and passenger load run end to end', async () => {
  const overview = (await call('system_overview', {})).data
  assert.equal(overview.stops.total, 3); assert.equal(overview.bins_full_now, 1)
  assert.equal(overview.security_events_24h['Лежачий человек'], 2)
  const bad = (await call('stop_conditions', {})).data
  assert.equal(bad.stops[0].stop_id, 179)
  const cold = (await call('stop_climate', { sort: 'coldest' })).data
  assert.deepEqual([cold.stops[0].stop_id, cold.out_of_norm.temperature, cold.out_of_norm.humidity], [179, 1, 1])
  assert.equal((await call('bin_episodes', { status: 'open' })).data.open_now, 1)
  const load = (await call('passenger_load', {}, { get_stop_load_hourly: () => ({ hours: [['73-24', iso(60), 40, 10, 7, 60], ['73-24', iso(120), 20, 10, 3, 60]], latest: [] }) })).data
  assert.deepEqual(load.rows[0], { key: 'Никольский (в центр)', average_people: 3, peak_people: 7 })
})

test('create_report: таблица раздела берётся из базы, а не из текста модели', async () => {
  const result = await call('create_report', {
    title: 'Связь оборудования', subtitle: 'на 13.11.2026', summary: ['Камера 131 не в сети полтора часа.'],
    metrics: [{ label: 'Не в сети', value: '1' }],
    from: '2026-11-13', to: '2026-11-13',
    sections: [{ heading: 'Что не в сети', paragraphs: ['Список из мониторинга.'], table: 'equipment_offline_now' }, { heading: 'Отключения за день', table: 'equipment_outages' }],
  })
  assert.equal(result.error, null)
  const table = result.data.report.sections[0].table
  assert.equal(table.columns[0], 'Оборудование')
  assert.ok(table.rows.some(row => row.includes(131) && row.includes('не в сети')))
  assert.equal(result.data.report.generatedAt, '2026-11-13 18:40')
  assert.ok(Array.isArray(result.data.report.sections[1].table.rows))
  assert.match((await call('create_report', { title: 'Отчёт', summary: ['x'], sections: [{ heading: 'Погода', table: 'weather' }] })).error, /table должен быть/)
  assert.match((await call('create_report', { summary: ['x'] })).error, /title/)
})

test('вежливые фразы — готовым ответом без модели, вопросы — модели', () => {
  const assistant = load('lib/assistant/vector-assistant.ts', { '@/lib/notifications/admin': admin })
  const ask = text => assistant.cannedReply([{ id: '1', role: 'user', parts: [{ type: 'text', text }] }])
  assert.match(ask('Привет!'), /^Здравствуйте!/)
  assert.equal(ask('Что ты умеешь?'), assistant.ABILITIES_REPLY)
  assert.match(ask('Спасибо большое'), /^Пожалуйста/)
  assert.equal(ask('Привет, что с урнами?'), null)
  assert.equal(ask('Дай рецепт печенья'), null)
  assert.match(assistant.OFF_TOPIC_REPLY, /только по остановочным павильонам/)
})

test('create_chart: графики из базы разных форм, ошибки — понятным текстом', async () => {
  const byDay = await call('create_chart', { chart: 'security_by_day', from: '2026-11-07', to: '2026-11-13' })
  assert.equal(byDay.error, null)
  assert.equal(byDay.data.chart.type, 'stacked')
  assert.equal(byDay.data.chart.labels.length, 7)
  assert.equal(byDay.data.chart.labels[6], '13.11')
  const total = byDay.data.chart.series.reduce((sum, s) => sum + s.values.reduce((a, b) => a + (b ?? 0), 0), 0)
  const events = (await call('security_events', { from: '2026-11-07', to: '2026-11-13' })).data.total
  assert.equal(total, events)
  const equipment = await call('create_chart', { chart: 'equipment_status_now', type: 'pie' })
  assert.equal(equipment.data.chart.type, 'pie')
  assert.equal(equipment.data.chart.series.length, 1)
  const conditions = await call('create_chart', { chart: 'stop_conditions_now' })
  assert.equal(conditions.data.chart.type, 'donut')
  assert.ok(conditions.data.chart.labelColors.every(Boolean))
  assert.match((await call('create_chart', { chart: 'climate_temperature' })).error, /stop/)
  assert.match((await call('create_chart', { chart: 'weather' })).error, /График должен быть/)
  const report = await call('create_report', { title: 'С графиком', from: '2026-11-07', to: '2026-11-13', summary: ['x'],
    sections: [{ heading: 'События', chart: 'security_by_day', chart_type: 'line' }] })
  assert.equal(report.data.report.sections[0].chart.type, 'line')
})
