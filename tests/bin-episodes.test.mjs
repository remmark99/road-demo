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
    const observe = async (camera, minute, full, image = full ? null : 'clean.jpg') => (await db.query(
      `SELECT record_bin_observation($1, $2, $3, $4) AS result`,
      [camera, new Date(Date.UTC(2026, 0, 1, 18, minute)).toISOString(), full, image])).rows[0].result
    const rows = async (sql) => (await db.query(sql)).rows
    const first = await observe(153, 0, true, 'first.jpg')
    assert.equal(first.action, 'opened')
    for (const minute of [30, 60, 90]) {
      assert.equal((await observe(153, minute, true, 'latest.jpg')).alert_id, first.alert_id)
    }
    const duplicate = await observe(153, 90, false)
    assert.equal(duplicate.action, 'ignored')
    assert.equal((await observe(153, 0, true)).action, 'ignored')
    let alert = (await rows(`SELECT * FROM alerts WHERE camera_index=153`))[0]
    assert.equal(alert.timestamp.toISOString(), '2026-01-01T18:00:00.000Z')
    assert.equal(alert.clip_path, 'latest.jpg')
    assert.equal(getBinEpisode(alert).observation_count, 4)
    const other = await observe(132, 100, true)
    assert.notEqual(other.alert_id, first.alert_id)
    assert.equal((await rows('SELECT * FROM alerts')).length, 2)
    await observe(153, 95, false, 'discarded-clean.jpg')
    assert.equal((await observe(153, 95, false)).action, 'ignored')
    await observe(153, 100, true) // A positive resets the clear streak.
    assert.equal((await observe(153, 105, false, 'first-clean.jpg')).action, 'updated')
    // A restart/redeployment between clear observations must retain the candidate.
    await db.exec(readFileSync(new URL('../sql/bin_first_clear_evidence_migration.sql', import.meta.url), 'utf8'))
    assert.equal((await observe(153, 105, false, 'replacement.jpg')).action, 'ignored')
    assert.equal((await observe(153, 110, false, 'second-clean.jpg')).action, 'closed')
    alert = (await rows(`SELECT * FROM alerts WHERE id='${first.alert_id}'`))[0]
    assert.equal(getBinEpisode(alert).status, 'closed')
    assert.equal(getBinEpisode(alert).first_image_url, 'first.jpg')
    assert.equal(getBinEpisode(alert).closed_image_url, 'first-clean.jpg')
    assert.equal(new Date(getBinEpisode(alert).ended_at).toISOString(), '2026-01-01T19:45:00.000Z')
    assert.equal((await observe(153, 109, true)).action, 'ignored')
    assert.equal(new Date(getBinEpisode(alert).closed_image_at).toISOString(), '2026-01-01T19:45:00.000Z')
    assert.equal(new Date(alert.metadata.bin_episode.confirmed_at).toISOString(), '2026-01-01T19:50:00.000Z')
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
