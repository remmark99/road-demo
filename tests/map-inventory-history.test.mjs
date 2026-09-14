import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
test('map history captures membership changes, ignores outages and restricts access', async () => {
    const db = new PGlite()
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA auth;
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            CREATE TABLE profiles(id uuid PRIMARY KEY, role text, modules text[]);
            GRANT SELECT ON profiles TO authenticated;
            GRANT USAGE ON SCHEMA auth TO authenticated;
            CREATE TABLE bus_stops(id int PRIMARY KEY, geom text, controller_status text, ip_address text);
            CREATE TABLE cameras(camera_index int PRIMARY KEY, module text, bus_stop_id int, lat double precision, lng double precision, status text);
            -- Only the PostGIS predicate is stubbed: this test exercises the real triggers and RLS.
            CREATE FUNCTION public.ST_GeometryType(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
            INSERT INTO bus_stops VALUES(10,'ST_Point','offline',null),(11,'ST_Polygon','offline',null);
            INSERT INTO cameras VALUES(1,'stops',10,61,73,'offline'),(2,'roads',null,61,73,'online');
        `)
        const migration = readFileSync(new URL('../sql/map_inventory_history.sql',import.meta.url),'utf8')
        await db.exec(migration)
        const rows = async()=> (await db.query('SELECT cameras,stops FROM map_inventory_history ORDER BY id')).rows
        assert.deepEqual(await rows(),[{cameras:1,stops:1}])
        await db.exec("UPDATE cameras SET status='online'; UPDATE bus_stops SET controller_status='online';")
        assert.equal((await rows()).length,1)
        await db.exec("INSERT INTO bus_stops VALUES(12,'ST_Point','offline',null);")
        assert.deepEqual((await rows()).at(-1),{cameras:1,stops:2})
        await db.exec("UPDATE cameras SET module='stops' WHERE camera_index=2;")
        assert.deepEqual((await rows()).at(-1),{cameras:2,stops:2})
        await db.exec("BEGIN; DELETE FROM cameras WHERE camera_index=2; ROLLBACK;")
        assert.deepEqual((await rows()).at(-1),{cameras:2,stops:2})
        await db.exec("DELETE FROM bus_stops WHERE id=10;")
        assert.deepEqual((await rows()).at(-1),{cameras:1,stops:1})
        await db.exec("UPDATE bus_stops SET ip_address='192.0.2.1' WHERE id=12;")
        assert.equal((await db.query('SELECT sensor_stops FROM map_inventory_history ORDER BY id DESC LIMIT 1')).rows[0].sensor_stops,1)
        const count=(await rows()).length
        await db.exec(migration)
        assert.equal((await rows()).length,count)
        await db.exec("INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000001','user',ARRAY['stops']); SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);")
        assert.equal((await rows()).length,count)
        await assert.rejects(db.exec('SELECT public.capture_map_inventory();'), /permission denied/)
        await assert.rejects(db.exec('DELETE FROM map_inventory_history;'), /permission denied/)
        await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);")
        assert.equal((await rows()).length,0)
        await db.exec('RESET ROLE; SET ROLE anon;')
        await assert.rejects(db.query('SELECT * FROM map_inventory_history'), /permission denied/)
        await db.exec('RESET ROLE; TRUNCATE cameras, bus_stops;')
        assert.deepEqual((await rows()).at(-1),{cameras:0,stops:0})
    } finally { await db.close() }
})
