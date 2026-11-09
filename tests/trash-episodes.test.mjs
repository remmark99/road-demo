// Run with node --test tests/trash-episodes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')

function load(path, modules = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', code)(exports, name => modules[name])
  return exports
}
const bin = load('../lib/bin-episodes.ts')
const { buildTrashOverflowEpisodes, episodeOfAlert, eventOverlapsRange, stopFeedCameraIndexes } =
  load('../lib/analytics/trash-episodes.ts', { '../bin-episodes': bin })

const alert = (started, lastSeen, ended, count) => ({
  alert_type: 'bin_full',
  metadata: {
    episode_schema: 'bin_episode_v1',
    bin_episode: { status: ended ? 'closed' : 'open', started_at: started, last_seen_at: lastSeen, ended_at: ended, observation_count: count },
  },
})
const event = (id, camera, row) => ({
  id, locationId: '69-24', timestamp: row.metadata.bin_episode.started_at, cameraIndex: camera, episode: episodeOfAlert(row),
})
const MIN = 60_000

// Записи Старого Сургута из базы: 08.11, разрыв между камерами меньше 2 часов.
const cam149 = event('a', 10149, alert('2026-11-08T08:51:31Z', '2026-11-09T08:36:01Z', '2026-11-09T08:46:07Z', 183))
const cam150 = event('b', 10150, alert('2026-11-08T10:42:27Z', '2026-11-09T01:07:24Z', '2026-11-09T03:43:34Z', 16))

test('длительность и наблюдения берутся из самого эпизода', () => {
  const [episode] = buildTrashOverflowEpisodes([cam150])
  assert.equal(Math.round(episode.durationMs / MIN), 17 * 60 + 1)
  assert.equal(episode.confirmations, 16)
  assert.equal(episode.lastSeenAt, '2026-11-09T01:07:24Z')
  assert.equal(episode.isOpen, false)
})

test('эпизоды разных камер одной остановки не склеиваются', () => {
  const episodes = buildTrashOverflowEpisodes([cam149, cam150])
  assert.deepEqual(episodes.map(e => e.id), ['a', 'b'])
  assert.deepEqual(episodes.map(e => e.cameraIndexes), [[10149], [10150]])
})

test('незавершённый эпизод длится до текущего момента', () => {
  const open = event('c', 10149, alert('2026-11-09T08:00:00Z', '2026-11-09T09:00:00Z', null, 5))
  const [episode] = buildTrashOverflowEpisodes([open], Date.parse('2026-11-09T10:00:00Z'))
  assert.equal(episode.isOpen, true)
  assert.equal(episode.durationMs, 120 * MIN)
})

test('старые записи без эпизода склеиваются по разрыву, как раньше', () => {
  const legacy = (id, timestamp) => ({ id, locationId: 'x', timestamp, cameraIndex: 130, episode: null })
  const episodes = buildTrashOverflowEpisodes([
    legacy('1', '2026-09-04T00:00:00Z'), legacy('2', '2026-09-04T01:00:00Z'), legacy('3', '2026-09-04T09:00:00Z'),
  ])
  assert.equal(episodes.length, 2)
  assert.equal(episodes[0].durationMs, 60 * MIN)
  assert.equal(episodes[0].confirmations, 2)
})

test('ссылка в ленту передаёт полные номера камер, под которыми лежат эпизоды', () => {
  const cameras = new Map([[148, 7], [149, 7], [150, 7], [131, 8]])
  assert.deepEqual(stopFeedCameraIndexes(7, cameras, [10149]), [10148, 10149, 10150])
  assert.deepEqual(stopFeedCameraIndexes(99, cameras, [10149]), [10149])
  assert.deepEqual(stopFeedCameraIndexes(null, cameras, [10149]), [10149])
  assert.deepEqual(stopFeedCameraIndexes(7, undefined, [10149]), [10149])
})

test('эпизод, начатый до периода и шедший в нём, входит в период', () => {
  const from = new Date('2026-11-09T00:00:00Z')
  assert.equal(eventOverlapsRange(cam149, from), true)
  assert.equal(eventOverlapsRange(event('d', 1, alert('2026-11-05T14:25:14Z', '2026-11-05T14:25:14Z', '2026-11-05T14:35:19Z', 1)), from), false)
  assert.equal(eventOverlapsRange(event('e', 1, alert('2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', null, 1)), from), true)
  assert.equal(eventOverlapsRange({ id: 'f', locationId: 'x', timestamp: '2026-11-08T00:00:00Z', cameraIndex: 1, episode: null }, from), false)
})
