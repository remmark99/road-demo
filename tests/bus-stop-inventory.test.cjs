const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
test('geometry supplies static inventory even when activity unavailable', async () => {
 const db = {
  rpc: async () => ({ data: { type: 'FeatureCollection', features: [{ properties: { id: 151 } }, { properties: { id: 152 } }] }, error: null }),
  from(table) { return { select() { return this }, limit: async () => ({ data: table === 'bus_stops' ? [{ id: 151, has_controller: true }, { id: 152, has_controller: false }] : [{ bus_stop_id: 151 }, { bus_stop_id: 151 }], error: null }) } },
 }
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/api/bus-stops/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
 const module = { exports: {} }
 new Function('require', 'module', 'exports', code)(id => {
  if (id === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, ...options }) } }
  if (id === '@/lib/supabase/server') return { createClient: async () => db }
  throw new Error(`Unexpected import: ${id}`)
 }, module, module.exports)
 const { body } = await module.exports.GET(new Request('http://localhost/api/bus-stops'))
 assert.equal(body.features[0].properties.sensor_data.has_controller, true)
 assert.equal(body.features[0].properties.sensor_data.total_camera_count, 2)
 assert.equal(body.features[0].properties.sensor_data.activity_status, 'unknown')
 assert.equal(body.features[1].properties.sensor_data.has_equipment, false)
})
