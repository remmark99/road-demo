// Run with PGLITE_MODULE=/path/to/pglite/dist/index.js node --test tests/bin-episodes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const { getBinEpisode } = (() => {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../lib/bin-episodes.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', code)(exports)
  return exports
})()
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')

test('camera-scoped episodes, retries, closure, pagination and permissions', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE alerts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), module_name TEXT,
        alert_type TEXT, severity DOUBLE PRECISION, message TEXT, metadata JSONB,
        timestamp TIMESTAMPTZ, video_timestamp DOUBLE PRECISION, source_video TEXT,
        clip_path TEXT, camera_index INTEGER, created_at TIMESTAMPTZ DEFAULT now());
      ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON alerts TO authenticated;
      -- Deliberately restrictive fixture tests that the view does not bypass RLS.
      CREATE POLICY visible_camera ON alerts FOR SELECT TO authenticated USING (camera_index = 153);
      CREATE TABLE deliveries(alert_id UUID);
      CREATE FUNCTION enqueue_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO deliveries VALUES (NEW.id); RETURN NEW; END; $$;
      CREATE TRIGGER enqueue AFTER INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION enqueue_test();
    `)
    const migration = readFileSync(new URL('../sql/bin_episodes_migration.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(readFileSync(new URL('../sql/bin_first_clear_evidence_migration.sql', import.meta.url), 'utf8'))
    const confidenceMigration = readFileSync(new URL('../sql/bin_episode_confidence_migration.sql', import.meta.url), 'utf8')
    await db.exec(confidenceMigration)
    // Only our trained classifier sends a score; `confidence` stands in for it.
    const observe = async (camera, minute, full, image = full ? null : 'clean.jpg', confidence = null) => (await db.query(
      `SELECT record_bin_observation($1, $2, $3, $4, $5) AS result`,
      [camera, new Date(Date.UTC(2026, 0, 1, 18, minute)).toISOString(), full, image,
       confidence === null ? {} : { confidence }])).rows[0].result
    const rows = async (sql) => (await db.query(sql)).rows
    const first = await observe(153, 0, true, 'first.jpg', .97)
    assert.equal(first.action, 'opened')
    for (const minute of [30, 60, 90]) {
      assert.equal((await observe(153, minute, true, 'latest.jpg', .90)).alert_id, first.alert_id)
    }
    const duplicate = await observe(153, 90, false)
    assert.equal(duplicate.action, 'ignored')
    assert.equal((await observe(153, 0, true)).action, 'ignored')
    let alert = (await rows(`SELECT * FROM alerts WHERE camera_index=153`))[0]
    assert.equal(alert.timestamp.toISOString(), '2026-01-01T18:00:00.000Z')
    assert.equal(alert.clip_path, 'latest.jpg')
    assert.equal(getBinEpisode(alert).observation_count, 4)
    // The opening score survives every later confirmation, and an open episode
    // has no end score yet.
    assert.equal(getBinEpisode(alert).start_confidence, .97)
    assert.equal(getBinEpisode(alert).end_confidence, null)
    // The score is episode-scoped: it never leaks into the shared alert key.
    assert.equal(alert.metadata.confidence, undefined)
    const other = await observe(132, 100, true)
    assert.notEqual(other.alert_id, first.alert_id)
    assert.equal((await rows('SELECT * FROM alerts')).length, 2)
    await observe(153, 95, false, 'discarded-clean.jpg', .80)
    assert.equal((await observe(153, 95, false)).action, 'ignored')
    await observe(153, 100, true) // A positive resets the clear streak.
    assert.equal((await observe(153, 105, false, 'first-clean.jpg', .90)).action, 'updated')
    // A restart/redeployment between clear observations re-applies the current
    // migrations and must retain the candidate.
    await db.exec(confidenceMigration)
    assert.equal((await observe(153, 105, false, 'replacement.jpg')).action, 'ignored')
    assert.equal((await observe(153, 110, false, 'second-clean.jpg', .80)).action, 'closed')
    alert = (await rows(`SELECT * FROM alerts WHERE id='${first.alert_id}'`))[0]
    assert.equal(getBinEpisode(alert).status, 'closed')
    assert.equal(getBinEpisode(alert).first_image_url, 'first.jpg')
    assert.equal(getBinEpisode(alert).closed_image_url, 'first-clean.jpg')
    assert.equal(new Date(getBinEpisode(alert).ended_at).toISOString(), '2026-01-01T19:45:00.000Z')
    assert.equal((await observe(153, 109, true)).action, 'ignored')
    assert.equal(new Date(getBinEpisode(alert).closed_image_at).toISOString(), '2026-01-01T19:45:00.000Z')
    assert.equal(new Date(alert.metadata.bin_episode.confirmed_at).toISOString(), '2026-01-01T19:50:00.000Z')
    // The end score averages the whole clean streak that closed the episode; the
    // discarded candidate from the previous streak is not part of it.
    assert.equal(getBinEpisode(alert).end_confidence, .85)
    assert.equal(getBinEpisode(alert).end_confidence_samples, 2)
    assert.equal(getBinEpisode(alert).start_confidence, .97)
    const next = await observe(153, 115, true)
    assert.notEqual(next.alert_id, first.alert_id)
    assert.equal((await observe(153, 119, false, null)).action, 'ignored')
    assert.equal((await rows('SELECT clear_count FROM bin_camera_state WHERE camera_index=153'))[0].clear_count, 0)
    await observe(153, 120, true) // A fresh client/worker needs no local episode state.
    assert.equal((await rows('SELECT * FROM deliveries')).length, 3)
    // Newer ordinary events cannot push an ongoing bin incident out of page one.
    await db.exec(`INSERT INTO alerts(alert_type,camera_index,timestamp) VALUES('smoking',153,'2026-01-02');`)
    const ordered = await rows(`SELECT id FROM alerts_with_bin_episodes
      ORDER BY bin_episode_active DESC,timestamp DESC,id DESC LIMIT 2`)
    assert.deepEqual(new Set(ordered.map(r=>r.id)), new Set([next.alert_id, other.alert_id]))
    assert.equal((await rows(`SELECT count(*)::integer AS n FROM alerts_with_bin_episodes WHERE camera_index=153`))[0].n, 3)
    // Reapplying the migration must not erase current episodes or watermarks.
    await db.exec(migration)
    assert.equal((await observe(153, 120, true)).action, 'ignored')
    await db.exec('SET ROLE authenticated')
    assert.equal((await rows('SELECT * FROM alerts_with_bin_episodes')).length, 3)
    await assert.rejects(observe(153, 125, true), /permission denied/)
    await assert.rejects(rows('SELECT * FROM bin_camera_state'), /permission denied/)
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(rows('SELECT * FROM alerts_with_bin_episodes'), /permission denied/)
    await db.exec('RESET ROLE; SET ROLE service_role')
    assert.equal((await observe(153, 125, true)).alert_id, next.alert_id)
    await db.exec('RESET ROLE')
    // A failed INSERT rolls back the watermark as well; retry can still open it.
    await db.exec(`ALTER TABLE alerts ADD CONSTRAINT reject_test_camera CHECK (camera_index <> 999);`)
    await assert.rejects(observe(999, 0, true), /reject_test_camera/)
    assert.equal((await rows('SELECT * FROM bin_camera_state WHERE camera_index=999')).length, 0)
    await db.exec('ALTER TABLE alerts DROP CONSTRAINT reject_test_camera')
    assert.equal((await observe(999, 0, true)).action, 'opened')
    // Applying the confidence migration to a LIVE system: a clear streak that
    // started under the previous function version must still close. The frame
    // that predates the upgrade carries no score, so the average covers only
    // the scored frames and the start stays unscored.
    const legacyFunction = readFileSync(new URL('../sql/bin_first_clear_evidence_migration.sql', import.meta.url), 'utf8')
    await db.exec(legacyFunction)
    assert.equal((await observe(154, 0, true, 'legacy-full.jpg', .9)).action, 'opened')
    assert.equal((await observe(154, 5, false, 'legacy-clean.jpg')).action, 'updated')
    await db.exec(confidenceMigration)
    assert.equal((await observe(154, 10, false, 'fresh-clean.jpg', .70)).action, 'closed')
    const upgraded = (await rows(`SELECT * FROM alerts WHERE camera_index=154`))[0]
    assert.equal(getBinEpisode(upgraded).end_confidence, .70)
    assert.equal(getBinEpisode(upgraded).end_confidence_samples, 1)
    assert.equal(getBinEpisode(upgraded).start_confidence, null)
  } finally { await db.close() }
})

test('legacy and malformed metadata remain safe to render', () => {
  for (const metadata of [null, {}, { episode_schema: 'bin_episode_v1', bin_episode: { status: 'open' } },
    { episode_schema: 'lying_person_episode_v1' }]) {
    assert.equal(getBinEpisode({ alert_type: 'bin_full', metadata }), null)
  }
  const episode = { status: 'open', started_at: '2026-01-01', last_seen_at: '2026-01-02', ended_at: null, observation_count: 2 }
  const alert = { alert_type: 'bin_full', metadata: { episode_schema: 'bin_episode_v1', bin_episode: episode } }
  assert.equal(getBinEpisode(alert).status, 'open')
  assert.equal(getBinEpisode({ ...alert, alert_type: 'lying_person' }), null)
  assert.equal(getBinEpisode({ ...alert, metadata: { ...alert.metadata, bin_episode: { ...episode, started_at: 'bad' } } }), null)
})

test('boundary confidences are validated per episode state', () => {
  const closed = { status: 'closed', started_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-01-02T00:00:00Z',
    ended_at: '2026-01-03T00:00:00Z', observation_count: 3, start_confidence: .97, end_confidence: .85,
    end_confidence_samples: 2 }
  const read = (episode) => getBinEpisode({ alert_type: 'bin_full', metadata: { episode_schema: 'bin_episode_v1', bin_episode: episode } })
  assert.equal(read(closed).start_confidence, .97)
  assert.equal(read(closed).end_confidence, .85)
  assert.equal(read(closed).end_confidence_samples, 2)
  // Scores are probabilities; anything else is reported as unmeasured.
  for (const bad of [1.1, -0.1, '0.9', NaN, Infinity, null, undefined]) {
    const scored = read({ ...closed, start_confidence: bad, end_confidence: bad })
    assert.equal(scored.start_confidence, null)
    assert.equal(scored.end_confidence, null)
  }
  for (const bad of [0, -1, 1.5, '2', null]) assert.equal(read({ ...closed, end_confidence_samples: bad }).end_confidence_samples, null)
  // An open episode cannot claim an end score, and a VLM episode has neither.
  const open = read({ ...closed, status: 'open', ended_at: null })
  assert.equal(open.start_confidence, .97)
  assert.equal(open.end_confidence, null)
  assert.equal(open.end_confidence_samples, null)
  const vlm = read({ ...closed, start_confidence: null, end_confidence: null, end_confidence_samples: null })
  assert.equal(vlm.start_confidence, null)
  assert.equal(vlm.end_confidence, null)
})
