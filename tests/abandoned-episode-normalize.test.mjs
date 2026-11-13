// Run with: node --test tests/abandoned-episode-normalize.test.mjs
// Covers getAbandonedEpisode's object_first_seen_at normalization (no PGlite, no network).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')

function loadModule(path) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', 'require', code)(exports, id => {
    if (id === '@/lib/types') return {}
    if (id.startsWith('@/')) return loadModule('../' + id.slice(2) + '.ts')
    return require(id)
  })
  return exports
}
const { getAbandonedEpisode } = loadModule('../lib/notifications/abandoned-episode.ts')

const base = '2026-11-13T08:07:00.000Z'   // object first tracked
const fired = '2026-11-13T08:27:00.000Z'  // event fired after the 20-min hold
const ended = '2026-11-13T08:34:00.000Z'
const alert = (episode) => ({
  alert_type: 'abandoned_object',
  metadata: { episode_schema: 'abandoned_episode_v1', abandoned_episode: episode },
})

test('object_first_seen_at is kept when it precedes started_at', () => {
  const episode = { status: 'closed', started_at: fired, last_seen_at: fired, ended_at: ended,
    observation_count: 1, object_first_seen_at: base }
  const result = getAbandonedEpisode(alert(episode))
  assert.equal(result.object_first_seen_at, base)
})

test('object_first_seen_at is dropped when invalid or not before started_at', () => {
  const common = { status: 'closed', started_at: fired, last_seen_at: fired, ended_at: ended, observation_count: 1 }
  for (const value of [undefined, null, 'bad', '2026-11-13T08:27:00.000Z', '2026-11-13T09:00:00.000Z']) {
    assert.equal(getAbandonedEpisode(alert({ ...common, object_first_seen_at: value })).object_first_seen_at, null)
  }
})

test('legacy metadata without the field still parses (falls back to null)', () => {
  const episode = { status: 'open', started_at: fired, last_seen_at: fired, ended_at: null, observation_count: 2 }
  assert.equal(getAbandonedEpisode(alert(episode)).object_first_seen_at, null)
})
