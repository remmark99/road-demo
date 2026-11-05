import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')

test('glass episodes survive retries/restarts, require complete fresh evidence, and notify once', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE bus_stops(id INTEGER PRIMARY KEY);
      INSERT INTO bus_stops VALUES(7), (8);
      CREATE TABLE controller_alerts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        module_name TEXT, bus_stop_id INTEGER, element INTEGER, address INTEGER,
        category TEXT, value DOUBLE PRECISION, alarm TEXT, message TEXT, clip_path TEXT);
      CREATE TABLE deliveries(id UUID);
      CREATE FUNCTION enqueue_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO deliveries VALUES(NEW.id); RETURN NEW; END; $$;
      CREATE TRIGGER enqueue AFTER INSERT ON controller_alerts
        FOR EACH ROW EXECUTE FUNCTION enqueue_test();
    `)
    const migration = readFileSync(new URL('../sql/glass_episodes_migration.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    const evidence = (minute, cameras = [130, 131]) => cameras.map(camera_index => ({
      camera_index, before: { url: 'before.jpg', timestamp: 100 },
      after: { url: 'after.jpg', timestamp: minute * 60 + 1000 },
    }))
    const observe = async (minute, broken, id = null, images = evidence(minute), stop = 7) =>
      (await db.query('SELECT record_glass_observation($1,$2,$3,$4,$5,$6,$7) AS result',
        [stop, new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(), broken,
          JSON.stringify(images), 'visible cracks', 2, id])).rows[0].result
    const rows = async sql => (await db.query(sql)).rows
    assert.equal((await observe(0, false)).action, 'clear')
    assert.equal((await rows('SELECT * FROM controller_alerts')).length, 0)
    const first = await observe(1, true)
    assert.equal(first.action, 'opened')
    assert.equal((await observe(1, true)).action, 'ignored')
    assert.equal((await observe(2, true)).action, 'ignored') // competing initial verification
    assert.equal((await observe(2, true, first.alert_id)).action, 'updated')
    assert.equal((await observe(3, false, first.alert_id, evidence(3, [130]))).action, 'ignored')
    const partialFresh = evidence(4)
    partialFresh[1].after.timestamp = evidence(2)[1].after.timestamp
    assert.equal((await observe(4, false, first.alert_id, partialFresh)).action, 'ignored')
    await assert.rejects(observe(4, false, first.alert_id, [{camera_index: 130}]))
    assert.equal((await observe(5, false, first.alert_id)).action, 'updated')
    assert.equal((await observe(5, false, first.alert_id)).action, 'ignored')
    assert.equal((await observe(6, true, first.alert_id)).action, 'updated') // reset clear streak
    assert.equal((await observe(7, false, first.alert_id)).action, 'updated')
    await db.exec(migration) // no in-memory lifecycle required
    assert.equal((await observe(8, false, first.alert_id)).action, 'closed')
    assert.equal((await rows('SELECT * FROM controller_alerts')).length, 1)
    const closed = (await rows('SELECT * FROM controller_alerts'))[0]
    assert.equal(closed.metadata.glass_episode.status, 'closed')
    assert.equal(closed.alarm, 'normal')
    assert.deepEqual(closed.metadata.glass_episode.first_evidence, evidence(1))
    assert.equal((await rows('SELECT * FROM deliveries')).length, 1)
    const second = await observe(9, true)
    assert.notEqual(second.alert_id, first.alert_id)
    assert.equal((await observe(10, false, first.alert_id)).action, 'ignored')
    const other = await observe(10, true, null, evidence(10), 8)
    assert.notEqual(other.alert_id, second.alert_id)
    await db.exec('SET ROLE authenticated')
    await assert.rejects(db.query('SELECT * FROM glass_stop_state'))
    await assert.rejects(observe(11, true))
  } finally { await db.close() }
})
