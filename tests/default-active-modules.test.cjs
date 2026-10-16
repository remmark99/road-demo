const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '..', 'lib/default-active-modules.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', code)(mod, mod.exports)
const { defaultActiveModules } = mod.exports

const ALL = ['roads', 'shore', 'stops', 'parks', 'transport']

test('unset keeps every available module on', () => {
  assert.deepEqual(defaultActiveModules(ALL, undefined), ALL)
  assert.deepEqual(defaultActiveModules(ALL, ' , '), ALL)
})

test('configured list switches on only those modules', () => {
  assert.deepEqual(defaultActiveModules(ALL, 'stops'), ['stops'])
  assert.deepEqual(defaultActiveModules(ALL, 'parks, stops'), ['stops', 'parks'])
})

test('a user without the configured modules still gets something on', () => {
  assert.deepEqual(defaultActiveModules(['roads'], 'stops'), ['roads'])
})
