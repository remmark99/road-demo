// node --test tests/vandalism-episode.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const { getVandalismEpisode, vandalismKindLabel, vandalismReactionSeconds } = (() => {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../lib/notifications/vandalism-episode.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', code)(exports)
  return exports
})()

// Форма строки — как её пишет сервис vandalism-alerts (bus_stop_analytics, src/vandalism_alerts/episode.py).
const storage = 'http://db/storage/v1/object/public/alert_images/vandalism/149/acf8'
const episode = (patch = {}) => ({
  status: 'open',
  started_at: '2026-11-17T20:39:15.000+00:00',
  last_seen_at: '2026-11-17T20:39:15.000+00:00',
  ended_at: null,
  observation_count: 1,
  first_noticed_at: '2026-11-17T20:38:00.000+00:00',
  first_image_url: `${storage}/appeared_after.png`,
  first_image_at: '2026-11-17T20:39:15.000+00:00',
  closed_image_url: null,
  closed_image_at: null,
  before_image_url: `${storage}/appeared_before.png`,
  incident_id: 'acf8',
  asset: 'glass',
  asset_label: 'Стекло',
  kind: 'paper_or_sticker',
  replay: false,
  stages: [{ event_id: 'acf8_target_appeared', type: 'appeared', at: '2026-11-17T20:39:15.000+00:00', kind: 'paper_or_sticker',
    images: { before: `${storage}/appeared_before.png`, after: `${storage}/appeared_after.png`, detail: `${storage}/appeared_detail.jpg` } }],
  candidates: [{ track: '1-2', frames: 17, event_id: 'acf8_target_appeared', images: [
    { url: `${storage}/appeared_candidate-1-1.jpg`, at: '2026-11-17T20:37:07.876+00:00' },
    { url: `${storage}/appeared_candidate-1-3.jpg`, at: '2026-11-17T20:37:23.941+00:00' } ] }],
  candidates_state: 'ready',
  ...patch,
})
const alert = (patch, type = 'vandalism', schema = 'vandalism_episode_v1') =>
  ({ alert_type: type, metadata: { episode_schema: schema, vandalism_episode: episode(patch) } })

test('открытый инцидент читается целиком: кадры, люди рядом, время реакции', () => {
  const read = getVandalismEpisode(alert())
  assert.equal(read.status, 'open')
  assert.equal(read.ended_at, null)
  assert.equal(read.asset_label, 'Стекло')
  assert.equal(read.before_image_url, `${storage}/appeared_before.png`)
  assert.deepEqual(read.stages.map(stage => [stage.type, Object.keys(stage.images)]), [['appeared', ['before', 'after', 'detail']]])
  assert.deepEqual(read.candidates.map(person => [person.track, person.frames, person.images.length]), [['1-2', 17, 2]])
  assert.equal(read.candidates_state, 'ready')
  assert.equal(vandalismReactionSeconds(read), 75)
  assert.equal(vandalismKindLabel(read.kind), 'Бумага или наклейка')
})

test('закрытый инцидент требует времени закрытия не раньше последнего наблюдения', () => {
  const closed = { status: 'closed', last_seen_at: '2026-11-18T08:00:00.000+00:00',
    closed_image_url: `${storage}/removed_after.png` }
  const read = getVandalismEpisode(alert({ ...closed, ended_at: '2026-11-19T08:50:08.133+00:00' }))
  assert.equal(read.status, 'closed')
  assert.equal(read.closed_image_url, `${storage}/removed_after.png`)
  assert.equal(getVandalismEpisode(alert({ ...closed, ended_at: null })), null)
  assert.equal(getVandalismEpisode(alert({ ...closed, ended_at: '2026-11-17T21:00:00.000+00:00' })), null)
})

test('у открытого инцидента кадр устранения не показывается, даже если он записан', () => {
  assert.equal(getVandalismEpisode(alert({ closed_image_url: `${storage}/removed_after.png` })).closed_image_url, null)
})

test('чужой тип, чужая схема и битые даты не превращаются в эпизод', () => {
  assert.equal(getVandalismEpisode(alert({}, 'bin_full')), null)
  assert.equal(getVandalismEpisode(alert({}, 'vandalism', 'bin_episode_v1')), null)
  assert.equal(getVandalismEpisode(alert({ started_at: 'вчера' })), null)
  assert.equal(getVandalismEpisode(alert({ status: 'unknown' })), null)
  assert.equal(getVandalismEpisode({ alert_type: 'vandalism', metadata: null }), null)
})

test('мусор в кадрах и людях отбрасывается, а не ломает карточку', () => {
  const read = getVandalismEpisode(alert({
    stages: [{ type: 'exploded', at: '2026-11-17T20:39:15.000+00:00', images: {} }, 'x',
      { event_id: 'e', type: 'updated', at: '2026-11-17T21:00:00.000+00:00', kind: 'painted_mark', images: { after: 'u', frame: 7 } }],
    candidates: [{ track: 'a', frames: 3, images: [{ url: '', at: '2026-11-17T20:37:07.876+00:00' }] },
      { track: 'b', frames: 1, images: [{ url: 'p1', at: '2026-11-17T20:37:07.876+00:00' }, { url: 'p2', at: '2026-11-17T20:37:09.876+00:00' }] }],
    candidates_state: 'pending',
  }))
  assert.deepEqual(read.stages, [{ event_id: 'e', type: 'updated', at: '2026-11-17T21:00:00.000+00:00', kind: 'painted_mark', images: { after: 'u' } }])
  assert.deepEqual(read.candidates.map(person => [person.track, person.frames]), [['b', 2]])
  assert.equal(read.candidates_state, 'ready')
})

test('пока кадры людей собираются, состояние — «ожидание»; прогон записи помечен', () => {
  const read = getVandalismEpisode(alert({ candidates: [], candidates_state: 'pending', replay: true }))
  assert.equal(read.candidates_state, 'pending')
  assert.equal(read.replay, true)
  assert.equal(getVandalismEpisode(alert({ candidates: [], candidates_state: 'whatever' })).candidates_state, 'none')
})

test('время реакции не считается без момента первого появления', () => {
  assert.equal(vandalismReactionSeconds(getVandalismEpisode(alert({ first_noticed_at: null }))), null)
  // Момент «замечено» позже подтверждения — ошибка данных, а не отрицательная реакция.
  assert.equal(getVandalismEpisode(alert({ first_noticed_at: '2026-11-17T21:00:00.000+00:00' })).first_noticed_at, null)
  assert.equal(vandalismKindLabel('something_new'), 'Изменение поверхности')
})
