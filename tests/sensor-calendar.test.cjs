const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, cache = {}) {
  file = path.resolve(root, file)
  if (cache[file]) return cache[file].exports
  const module = { exports: {} }; cache[file] = module
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id in mocks) return mocks[id]
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts', mocks, cache)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), mocks, cache)
    return require(id)
  }, module, module.exports)
  return module.exports
}

const {sensorCalendarBounds}=load('lib/sensor-history-period.ts')
test('calendar days include the full last day in Surgut across month/year boundaries',()=>{
 const b=sensorCalendarBounds('2026-12-31','2027-01-01')
 assert.equal(b.from.toISOString(),'2026-12-30T19:00:00.000Z')
 assert.equal(b.to.toISOString(),'2027-01-01T19:00:00.000Z')
 assert.equal(b.hours,48)
 assert.equal(sensorCalendarBounds('2024-02-29','2024-02-29').hours,24)
 assert.equal(sensorCalendarBounds(null,null),null)
 for(const pair of [['2026-02-29','2026-03-01'],['2026-09-02','2026-09-01'],['2026-09-01',null],['',''],['bad','bad']]) assert.throws(()=>sensorCalendarBounds(...pair))
})
test('sampling windows cover the whole period, newest first, in at most 48 chart points',()=>{
 const {sensorBucketMinutes,sensorSampleWindows,floorToSensorBucket,sensorCityDay}=load('lib/sensor-history-period.ts')
 const DAY=86400_000
 assert.equal(sensorBucketMinutes(3600_000),5)
 assert.equal(sensorBucketMinutes(DAY),30)
 assert.equal(sensorBucketMinutes(8*DAY),240)
 assert.equal(sensorBucketMinutes(31*DAY),1440)
 assert.equal(sensorBucketMinutes(92*DAY),2880)
 for(const span of [3600_000,DAY,8*DAY,31*DAY,92*DAY]){
  const from=new Date('2026-09-01T07:13:00Z'),to=new Date(from.getTime()+span)
  const windows=sensorSampleWindows(from,to,sensorBucketMinutes(span))
  assert.ok(windows.length<=49,`${span}: ${windows.length}`)
  assert.equal(windows[0].to,to.toISOString())
  assert.equal(windows.at(-1).from,from.toISOString())
  for(let i=1;i<windows.length;i++) assert.equal(windows[i].to,windows[i-1].from)
 }
 assert.equal(new Date(floorToSensorBucket(Date.parse('2026-09-01T20:10:00Z'),1440)).toISOString(),'2026-09-01T19:00:00.000Z')
 assert.equal(sensorCityDay(new Date('2026-09-01T19:00:00Z')),'2026-09-02')
})
const loadRoute=query=>load('app/api/stop-sensor-history/route.ts',{
 'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
 '@/lib/notifications/http':{getAuthenticatedUser:async()=>({id:'u'}),jsonError:(error,status)=>({body:{error},status})},
 '@/lib/supabase/server':{createClient:async()=>({from:table=>query(table)})}
})
const fakeQuery=(calls,rowsFor=()=>[])=>table=>{
 const entry={table,in:{}}
 calls.push(entry)
 const q={select(){return q},eq(){return q},not(){return q},order(){return q},
  in(k,v){entry.in[k]=v;return q},gte(k,v){entry.from=v;return q},lt(k,v){entry.to=v;return q},limit(n){entry.limit=n;return q},
  then(resolve){resolve({data:rowsFor(entry),error:null})}}
 return q
}
test('API samples every bucket inside the exclusive calendar bounds and rejects malformed input before querying',async()=>{
 const calls=[]
 const {GET}=loadRoute(fakeQuery(calls,c=>c.table==='bus_stops'?[{id:7},{id:9}]:[]))
 const response=await GET({nextUrl:new URL('http://local/?from=2026-09-01&to=2026-09-02')})
 assert.equal(response.status,200)
 assert.equal(response.body.bucketMinutes,60)
 const history=calls.filter(c=>c.table==='stop_sensor_history')
 assert.equal(history.length,48)
 assert.equal(history[0].to,'2026-09-02T19:00:00.000Z')
 assert.equal(history.at(-1).from,'2026-08-31T19:00:00.000Z')
 // Every window names the stops so that it can use the (bus_stop_id, recorded_at) index.
 assert.ok(history.every(c=>c.limit===300&&c.in.bus_stop_id?.join()==='7,9'))
 const alerts=calls.find(c=>c.table==='controller_alerts')
 assert.deepEqual([alerts.from,alerts.to],['2026-08-31T19:00:00.000Z','2026-09-02T19:00:00.000Z'])
 calls.length=0
 assert.equal((await GET({nextUrl:new URL('http://local/?from=2026-02-30&to=2026-03-01')})).status,400)
 assert.equal((await GET({nextUrl:new URL('http://local/?from=2026-09-01&to=2026-09-02&busStopIds=1,x')})).status,400)
 assert.deepEqual(calls,[])
})
test('API filters every query by the selected stops, stops at now, and flags capped glass events',async()=>{
 const calls=[]
 const alert=i=>({id:i,bus_stop_id:7,created_at:'2026-09-01T00:00:00Z'})
 const {GET}=loadRoute(fakeQuery(calls,c=>c.table==='controller_alerts'?Array.from({length:51},(_,i)=>alert(i)):[]))
 await GET({nextUrl:new URL('http://local/?from=2999-01-01&to=2999-01-01&busStopIds=7,9')})
 assert.equal(calls.filter(c=>c.table==='stop_sensor_history').length,0)
 calls.length=0
 const today=new Date(Date.now()+5*3600_000).toISOString().slice(0,10)
 const live=await GET({nextUrl:new URL(`http://local/?from=${today}&to=${today}&busStopIds=7,9`)})
 assert.equal(live.status,200)
 assert.equal(live.body.events.length,50)
 assert.equal(live.body.eventsTruncated,true)
 assert.ok(Date.parse(live.body.range.to)<=Date.parse(live.body.generatedAt))
 for(const c of calls.filter(c=>['stop_sensor_history','controller_alerts','stop_sensor_states'].includes(c.table))) assert.deepEqual(c.in.bus_stop_id,[7,9])
})
test('Excel has a neutral header and neutral table style',()=>{
 const {createXlsx}=load('lib/exports/xlsx.ts'),{unzipSync,strFromU8}=require('fflate')
 const files=unzipSync(createXlsx([{name:'Сводка',rows:[['Остановка'],['Никольский']]}]))
 assert.match(strFromU8(files['xl/styles.xml']),/FFFFFFFF/)
 assert.match(strFromU8(files['xl/tables/table1.xml']),/showRowStripes="0"/)
})
