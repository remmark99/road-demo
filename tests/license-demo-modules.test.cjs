const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '..', 'lib/license-modules.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', code)(mod, mod.exports)
const { withDemoModules, filterModulesByLicense } = mod.exports

test('no demo variable keeps the signed license as is', () => {
  assert.deepEqual(withDemoModules(['stops'], undefined), { modules: ['stops'], demo: [] })
  assert.deepEqual(withDemoModules(['stops'], ''), { modules: ['stops'], demo: [] })
})

test('demo modules are added once, licensed ones are not marked as demo', () => {
  assert.deepEqual(
    withDemoModules(['stops'], 'roads, shore,parks,transport,stops,roads'),
    { modules: ['stops', 'roads', 'shore', 'parks', 'transport'], demo: ['roads', 'shore', 'parks', 'transport'] },
  )
})

test('profile modules then pass the license filter', () => {
  const { modules } = withDemoModules(['stops'], 'roads,shore,parks,transport')
  assert.deepEqual(filterModulesByLicense(['roads', 'shore', 'stops', 'parks', 'transport'], modules), ['roads', 'shore', 'stops', 'parks', 'transport'])
})
