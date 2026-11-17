const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
function load(file) {
 const absolute = path.resolve(__dirname, '..', file), module = { exports: {} }
 const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
 new Function('require', 'module', 'exports', code)(id => id === '../request-cache' ? { sessionRequest: (_key, _ttl, fn) => fn() } : id.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(absolute), id + '.ts'))) : require(id), module, module.exports)
 return module.exports
}
const { buildStopActivity } = load('lib/api/stop-activity.ts')
const { toSensorData, toSensorsOnlyStops, fetchBusStopsGeoJSON } = load('lib/api/bus-stops.ts')
test('missing connectivity is unknown, including sensors-only mode', () => {
 const sd = { ...toSensorData(undefined), has_controller: true }
 assert.equal(sd.activity_status, 'unknown')
 const fallback = toSensorData(undefined, { has_controller: true, has_equipment: true, total_camera_count: 2, sensors_online: true })
 assert.equal(fallback.has_controller, true)
 assert.equal(fallback.total_camera_count, 2)
 assert.equal(fallback.sensors_online, false)
 assert.equal(toSensorsOnlyStops({ type: 'FeatureCollection', features: [{ properties: { id: 151, sensor_data: sd } }] }).features[0].properties.sensor_data.activity_status, 'unknown')
})
test('failed activity fetch preserves geometry without claiming offline', async () => {
 const originalFetch = global.fetch
 const error = console.error
 console.error = () => {}
 global.fetch = async url => url === '/api/bus-stops'
  ? { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ properties: { id: 151 }, geometry: { type: 'Point', coordinates: [1, 2] } }] }) }
  : { ok: false, status: 503 }
 try {
  const result = await fetchBusStopsGeoJSON()
  assert.equal(result.features.length, 1)
  assert.equal(result.features[0].properties.sensor_data.activity_status, 'unknown')
 } finally { global.fetch = originalFetch; console.error = error }
})
const now = Date.parse('2026-11-16T06:00:00Z'), windowMs = 90_000
const at = age => new Date(now - age).toISOString()
function activity(stop = {}, equipmentRows = [], extra = {}) {
 return buildStopActivity({ busStops: [{ id: 151, has_controller: true, ...stop }], sensorRows: [{ bus_stop_id: 151, element: 13, category: 'temperature', alarm: 'normal', updated_at: at(0) }], cameraRows: [], equipmentRows, windowMs, now, ...extra })['151']
}
test('heartbeat proves installed controller even without inventory flag or readings', () => {
 const entry = buildStopActivity({ busStops: [{ id: 1, last_ok_at: new Date(now).toISOString() }], sensorRows: [], cameraRows: [], now })['1']
 assert.equal(entry.sensors_online, true)
 assert.equal(entry.has_controller, true)
 assert.equal(entry.has_equipment, true)
})
test('missing activity preserves inventory for sensors-only view', async () => {
 const originalFetch = global.fetch, error = console.error
 global.fetch = async url => url === '/api/bus-stops'
  ? { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ properties: { id: 151, sensor_data: { has_controller: true, has_equipment: true, total_camera_count: 2 } } }] }) }
  : { ok: false, status: 503 }
 console.error = () => {}
 try {
  const result = await fetchBusStopsGeoJSON()
  assert.equal(result.features[0].properties.sensor_data.has_equipment, true)
  assert.equal(toSensorsOnlyStops(result).features.length, 1)
  assert.equal(toSensorsOnlyStops(result).features[0].properties.sensor_data.activity_status, 'unknown')
 } finally { global.fetch = originalFetch; console.error = error }
})
test('unknown sensor history survives live activity conversion', () => {
 const entry = { ...activity({ last_ok_at: at(0) }), sensors_history_known: false, cameras_history_known: false }
 const sd = toSensorData(entry)
 assert.equal(sd.sensors_history_known, false)
 assert.equal(sd.cameras_history_known, false)
 assert.equal(toSensorsOnlyStops({ type: 'FeatureCollection', features: [{ properties: { id: 1, sensor_data: sd } }] }).features[0].properties.sensor_data.activity_status, 'unknown')
})
test('unknown popup never labels sensors offline or stop unequipped', () => {
 const source = fs.readFileSync(path.resolve(__dirname, '../components/map/surgut-map.tsx'), 'utf8')
 assert.match(source, /props\.activity_status === 'unknown' \? 'Нет данных' : props\.has_equipment === false \? 'Без оборудования'/)
 const modal = fs.readFileSync(path.resolve(__dirname, '../components/map/bus-stop-modal.tsx'), 'utf8')
 assert.match(modal, /!hasEquipment && activityStatus !== "unknown"/)
})
test('modal telemetry effect depends on stop identity, not changing live properties', () => {
 const source = fs.readFileSync(path.resolve(__dirname, '../components/map/bus-stop-modal.tsx'), 'utf8')
 assert.match(source, /\[busStopId, historicalAt\]/)
 assert.doesNotMatch(source, /\[busStop, historicalAt\]/)
})
test('readings cannot prove controller connectivity; only last_ok_at can', () => {
 assert.equal(activity({ controller_status: 'offline' }).sensors_online, false)
})
test('heartbeat expiry uses supplied TTL; monitor offline and open outages win', () => {
 const online = [{ equipment_type: 'controller', equipment_id: 151, status: 'online' }]
 for (const last_ok_at of [null, 'invalid', at(90_001), at(-1)]) assert.equal(activity({ last_ok_at }, online).sensors_online, false)
 assert.equal(activity({ last_ok_at: at(90_000) }, online).sensors_online, true)
 assert.equal(activity({ last_ok_at: at(90_000) }, online, { windowMs: 45_000 }).sensors_online, false)
 assert.equal(activity({ last_ok_at: at(0) }, [{ ...online[0], status: 'offline' }]).sensors_online, false)
 assert.equal(activity({ last_ok_at: at(0) }, online, { controllerOutageIds: [151] }).sensors_online, false)
 assert.equal(activity({ last_ok_at: at(0) }, online, { controllerOutageIds: [] }).sensors_online, true)
})

test('an open overfilled-bin episode makes the stop an incident; sensors-only mode keeps only the glass part', () => {
  const now = Date.parse('2026-11-17T10:00:00Z')
  const stops = buildStopActivity({
    busStops: [{ id: 1, last_ok_at: new Date(now - 1000).toISOString(), has_controller: true }, { id: 2 }],
    sensorRows: [],
    cameraRows: [{ camera_index: 140, bus_stop_id: 1, status: 'online' }, { camera_index: 158, bus_stop_id: 2, status: 'online' }],
    binFullCameraIndexes: [140],
    windowMs: 60_000,
    now,
  })
  assert.equal(stops['1'].incident, true)
  assert.equal(stops['1'].bin_full, true)
  assert.equal(stops['1'].glass_incident, false)
  assert.equal(stops['2'].incident, false)
  const sd = toSensorData(stops['1'])
  assert.equal(sd.bin_full, true)
  const only = toSensorsOnlyStops({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { id: 1, sensor_data: sd } }] })
  assert.equal(only.features[0].properties.sensor_data.incident, false)
})
