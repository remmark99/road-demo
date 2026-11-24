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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('две копии модуля видят один кэш — как прогрев и маршрут', async () => {
  const warm = load('lib/server/shared-cache.ts'), route = load('lib/server/shared-cache.ts')
  let builds = 0
  await warm.sharedCached('t:shared', 60_000, async () => { builds++; return 'прогрето' })
  const value = await route.sharedCached('t:shared', 60_000, async () => { builds++; return 'собрано заново' })
  assert.equal(value, 'прогрето')
  assert.equal(builds, 1)
  assert.equal(warm.sharedState('t:state', () => ({ n: 1 })), route.sharedState('t:state', () => ({ n: 2 })))
})

test('одновременные запросы ждут одну сборку, после срока значение собирается заново', async () => {
  const { sharedCached } = load('lib/server/shared-cache.ts')
  let builds = 0
  const build = async () => { builds++; await wait(20); return builds }
  assert.deepEqual(await Promise.all([sharedCached('t:ttl', 30, build), sharedCached('t:ttl', 30, build)]), [1, 1])
  assert.equal(await sharedCached('t:ttl', 30, build), 1)
  await wait(40)
  assert.equal(await sharedCached('t:ttl', 30, build), 2)
})

test('прогрев пересобирает свежее значение, а остальные в это время получают прежнее', async () => {
  const { sharedCached } = load('lib/server/shared-cache.ts')
  let builds = 0
  const build = async () => { builds++; await wait(20); return builds }
  await sharedCached('t:force', 60_000, build)
  const forced = sharedCached('t:force', 60_000, build, true)
  assert.equal(await sharedCached('t:force', 60_000, build), 1)
  assert.equal(await forced, 2)
  assert.equal(await sharedCached('t:force', 60_000, build), 2)
})

test('сбой сборки не кэшируется и не стирает прежнее значение', async () => {
  const { sharedCached } = load('lib/server/shared-cache.ts')
  await assert.rejects(sharedCached('t:fail', 60_000, async () => { throw new Error('база недоступна') }))
  assert.equal(await sharedCached('t:fail', 60_000, async () => 'со второй попытки'), 'со второй попытки')
  await assert.rejects(sharedCached('t:fail', 60_000, async () => { throw new Error('база недоступна') }, true))
  assert.equal(await sharedCached('t:fail', 60_000, async () => 'не должно собираться'), 'со второй попытки')
})
