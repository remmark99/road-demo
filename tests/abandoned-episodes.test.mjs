import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
test('abandoned episode retries, first clear evidence, recurrence, occlusion and permissions',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE alerts(id UUID PRIMARY KEY,module_name TEXT,alert_type TEXT,severity FLOAT,message TEXT,metadata JSONB,timestamp TIMESTAMPTZ,video_timestamp FLOAT,source_video TEXT,clip_path TEXT,camera_index INT);
 CREATE TABLE deliveries(id UUID);CREATE FUNCTION test_delivery() RETURNS TRIGGER LANGUAGE plpgsql AS $$BEGIN INSERT INTO deliveries VALUES(NEW.id);RETURN NEW;END;$$;CREATE TRIGGER delivery AFTER INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION test_delivery();`)
 const migration=readFileSync(new URL('../sql/abandoned_episodes_migration.sql',import.meta.url),'utf8');await db.exec(migration)
 const id='00000000-0000-4000-8000-000000000153',base=Date.parse('2026-01-01T00:00:00Z'),at=s=>new Date(base+s*1000).toISOString()
 const open=()=>db.query('SELECT open_abandoned_episode($1,153,$2,$3,$4)',[id,at(0),'first.jpg',{abandoned_regions:[[.1,.2,.2,.4]]}])
 await open();await open();assert.equal((await db.query('SELECT count(*)::int AS n FROM deliveries')).rows[0].n,1)
 const observe=async(s,present,url=null)=>(await db.query('SELECT record_abandoned_observation($1,$2,$3,$4) AS r',[id,at(s),present,url])).rows[0].r
 const episode=async()=>(await db.query('SELECT metadata FROM alerts WHERE id=$1',[id])).rows[0].metadata.abandoned_episode
 assert.equal((await observe(1,false,null)).action,'ignored')
 await observe(5,false,'discard.jpg');await observe(10,true);await observe(15,false,'also-discard.jpg');await observe(20,null)
 await observe(25,false,'first-clean.jpg');await observe(30,false,'second-clean.jpg');assert.equal((await episode()).status,'open')
 await db.exec(migration) // persisted candidate survives deployments/restarts
 assert.equal((await observe(25,true)).action,'ignored')
 await observe(40,false,'third-clean.jpg')
 const e=await episode();assert.equal(e.status,'closed');assert.equal(e.first_image_url,'first.jpg');assert.equal(e.closed_image_url,'first-clean.jpg');assert.equal(Date.parse(e.ended_at),base+25000)
 await observe(45,true);assert.equal((await episode()).status,'closed')
 assert.equal((await db.query('SELECT count(*)::int AS n FROM deliveries')).rows[0].n,1)
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(observe(50,true),/permission denied/);await assert.rejects(open(),/permission denied/);await db.exec('RESET ROLE')}
 }finally{await db.close()}
})
