const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'lib/notifications/feed-kind.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', code)(mod, mod.exports)
const { feedKindTypes, controllerKindFilter } = mod.exports

const EQUIPMENT = ['camera_offline', 'camera_online']
const ALL = ['smoking', 'bin_full', 'camera_offline', 'camera_online']
const LINK = ['controller_offline', 'controller_online']

test('camera feed: events and equipment split the requested types', () => {
  assert.deepEqual(feedKindTypes(ALL, 'all', EQUIPMENT), ALL)
  assert.deepEqual(feedKindTypes(ALL, 'events', EQUIPMENT), ['smoking', 'bin_full'])
  assert.deepEqual(feedKindTypes(ALL, 'equipment', EQUIPMENT), EQUIPMENT)
})

test('camera feed: a mode outside the selected types yields nothing, not everything', () => {
  assert.deepEqual(feedKindTypes(['smoking'], 'equipment', EQUIPMENT), [])
  assert.deepEqual(feedKindTypes(['camera_online'], 'events', EQUIPMENT), [])
})

test('controller feed: modes over selected categories', () => {
  assert.deepEqual(controllerKindFilter([], 'all', LINK), { categories: undefined, empty: false })
  assert.deepEqual(controllerKindFilter([], 'events', LINK), { excludeCategories: LINK, empty: false })
  assert.deepEqual(controllerKindFilter([], 'equipment', LINK), { categories: LINK, empty: false })
  assert.deepEqual(controllerKindFilter(['incident', 'controller_online'], 'events', LINK), { categories: ['incident'], empty: false })
  assert.deepEqual(controllerKindFilter(['incident'], 'equipment', LINK), { categories: [], empty: true })
})
