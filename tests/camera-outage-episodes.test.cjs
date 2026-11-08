const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'lib/notifications/camera-outage.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(require, mod, mod.exports)
const { mergeCameraLinkTypes, getCameraOutageIds, getCameraOutageEpisode, withoutOutageDuration } = mod.exports

const offline = (ids) => ({ alert_type: 'camera_offline', metadata: { outage_ids: ids } })
const rows = (...list) => new Map(list.map((row) => [row.id, row]))

test('feed asks for «не в сети» instead of «снова в сети»', () => {
  assert.deepEqual(mergeCameraLinkTypes(['smoking', 'camera_offline', 'camera_online']), ['smoking', 'camera_offline'])
  assert.deepEqual(mergeCameraLinkTypes(['camera_online']), ['camera_offline'])
})

test('only offline notices carry the outage they open', () => {
  assert.deepEqual(getCameraOutageIds(offline([4, 'x', 5])), [4, 5])
  assert.deepEqual(getCameraOutageIds({ alert_type: 'camera_online', metadata: { outage_ids: [4] } }), [])
  assert.deepEqual(getCameraOutageIds({ alert_type: 'camera_offline', metadata: null }), [])
})

test('an outage stays open until its camera is back, and closes at the recovery', () => {
  const open = rows({ id: 1, started_at: '2026-11-08T13:00:00Z', ended_at: null })
  assert.deepEqual(getCameraOutageEpisode(offline([1]), open),
    { status: 'open', started_at: '2026-11-08T13:00:00Z', ended_at: null, last_seen_at: '2026-11-08T13:00:00Z' })
  const closed = rows({ id: 1, started_at: '2026-11-08T13:00:00Z', ended_at: '2026-11-08T14:01:00Z' })
  assert.equal(getCameraOutageEpisode(offline([1]), closed).status, 'closed')
  assert.equal(getCameraOutageEpisode(offline([1]), closed).ended_at, '2026-11-08T14:01:00Z')
  assert.equal(getCameraOutageEpisode(offline([9]), closed), null)
})

test('a mass outage lasts until the last camera returns', () => {
  const list = rows(
    { id: 1, started_at: '2026-11-08T13:05:00Z', ended_at: '2026-11-08T13:30:00Z' },
    { id: 2, started_at: '2026-11-08T13:00:00Z', ended_at: '2026-11-08T14:00:00Z' },
  )
  assert.deepEqual(getCameraOutageEpisode(offline([1, 2]), list),
    { status: 'closed', started_at: '2026-11-08T13:00:00Z', ended_at: '2026-11-08T14:00:00Z', last_seen_at: '2026-11-08T14:00:00Z' })
  list.set(2, { id: 2, started_at: '2026-11-08T13:00:00Z', ended_at: null })
  assert.equal(getCameraOutageEpisode(offline([1, 2]), list).status, 'open')
})

test('the stale duration is dropped from the notice text', () => {
  assert.equal(withoutOutageDuration('Камера 22943 (Филармония) не в сети 15 мин'), 'Камера 22943 (Филармония) не в сети')
  assert.equal(withoutOutageDuration('Камера 5 не в сети 1 ч 20 мин'), 'Камера 5 не в сети')
  assert.equal(withoutOutageDuration('Филармония: не в сети 2 камеры — 1, 2 (меньше минуты)'), 'Филармония: не в сети 2 камеры — 1, 2')
  const mass = 'Массовое отключение: не в сети 9 камер на 3 остановках (А, Б, В). Вероятно, пропала связь'
  assert.equal(withoutOutageDuration(mass), mass)
})
