const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, cache = {}, expose = "") {
  file = path.resolve(root, file)
  if (cache[file]) return cache[file].exports
  const module = { exports: {} }; cache[file] = module
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8') + expose, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id in mocks) return mocks[id]
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts', mocks, cache)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), mocks, cache)
    return require(id)
  }, module, module.exports)
  return module.exports
}

const {buildHeatmapRows,HEATMAP_HOUR_COLUMNS}=load('lib/analytics/passenger-heatmap.ts')
const {buildSafetyPeriods,safetyNotificationsHref,bucketStart,bucketEnd}=load('lib/analytics/safety-periods.ts')
const {cityRange}=load('lib/analytics/city-time.ts')
const {notificationPeriodBounds}=load('lib/notifications/feed-filters.ts')
const range={from:new Date('2026-09-22T19:00:00Z'),to:new Date('2026-09-23T22:59:59.999Z')}
const alert=(timestamp,camera_index=151)=>({timestamp,camera_index,metadata:{location_id:'36-23'},alert_type:'smoking'})
test('heatmap uses Surgut 00–23, sample-weighted averages, and distinguishes zero from missing',()=>{
 const make=(hourKey,avgPeople,sampleCount)=>({hourKey,avgPeople,sampleCount,windows:1,locationId:'36-23'})
 const [row]=buildHeatmapRows([make('2026-09-21T19:00:00Z',10,1),make('2026-09-22T19:00:00Z',0,9),make('2026-09-22T20:00:00Z',0,2),make('2026-09-22T21:00:00Z',99,0)],HEATMAP_HOUR_COLUMNS,[{locationId:'36-23',label:'Никольский'}])
 assert.equal(HEATMAP_HOUR_COLUMNS[0].hourLabel,'00');assert.equal(HEATMAP_HOUR_COLUMNS.at(-1).hourLabel,'23')
 assert.equal(row.cells[0].value,1);assert.equal(row.cells[1].value,0);assert.equal(row.cells[2].value,null)
})
test('city range is independent of browser time zone and custom calendar dates remain selected days',()=>{
 const today=cityRange({preset:'today'},new Date('2026-09-22T20:30:00Z'))
 assert.equal(today.from.toISOString(),'2026-09-22T19:00:00.000Z')
 const custom=cityRange({preset:'custom',customRange:{from:new Date(2026,8,23)}})
 assert.equal(custom.from.toISOString(),'2026-09-22T19:00:00.000Z');assert.equal(custom.to.toISOString(),'2026-09-23T18:59:59.999Z')
})
test('safety distribution retains leading, middle, and trailing empty hours and excludes outside events',()=>{
 const hours=buildSafetyPeriods([alert('2026-09-22T18:59:59Z'),alert('2026-09-22T20:01:00Z'),alert('2026-09-22T22:01:00Z'),alert('2026-09-24T00:00:00Z')],range,'hour')
 assert.equal(hours.length,28);assert.equal(hours[0].bucketLabel,'23.09 00:00')
 assert.deepEqual(hours.slice(0,5).map(x=>x.events),[0,1,0,1,0]);assert.equal(hours.at(-1).events,0)
 assert.equal(hours.reduce((n,x)=>n+x.events,0),2)
})
test('day/week boundaries use Surgut midnight and Monday',()=>{
 const timestamp=Date.parse('2026-09-20T20:00:00Z')
 assert.equal(new Date(bucketStart(timestamp,'week')).toISOString(),'2026-09-20T19:00:00.000Z')
 assert.equal(bucketEnd(bucketStart(timestamp,'week'),'week')-bucketStart(timestamp,'week'),7*86400000)
 assert.equal(buildSafetyPeriods([],range,'day').length,2)
})
test('notification links preserve exact interval, type, cameras, and module; date-only changes clear time restriction',()=>{
 const link=new URL(safetyNotificationsHref(range,['smoking','smoking'],[151,152,151]),'http://local'),p=link.searchParams
 assert.equal(p.get('types'),'smoking');assert.equal(p.get('cameras'),'151,152');assert.equal(p.get('module'),'stops')
 assert.deepEqual(notificationPeriodBounds(Object.fromEntries(p)),{fromInclusive:range.from.toISOString(),toExclusive:'2026-09-23T23:00:00.000Z'})
 assert.deepEqual(notificationPeriodBounds({from:'2026-09-23',to:'2026-09-23'}),{fromInclusive:'2026-09-22T19:00:00.000Z',toExclusive:'2026-09-23T19:00:00.000Z'})
 assert.throws(()=>notificationPeriodBounds({from:'2026-09-23',to:'2026-09-23',start:'bad',end:'bad'}))
 assert.throws(()=>notificationPeriodBounds({from:'2026-09-23',to:'2026-09-23',start:range.from.toISOString(),end:'2026-09-24T19:00:00Z'}))
})
const route=load('app/api/stop-load-analytics/route.ts',{'@/lib/supabase/server':{}},{},'\nexport { buildStopDisplay, aggregateRows }')
test('pipeline stop code is never confused with the first number as database id',()=>{
 const stops=new Map([[36,{id:36,name:'ул. Терешковой',shortName:null,description:null}]])
 assert.equal(route.buildStopDisplay('36-23',stops).label,'Никольский')
 stops.set(999,{id:999,name:'Никольский из справочника',shortName:'36-23',description:'в сторону центра'})
 assert.equal(route.buildStopDisplay('36-23',stops).label,'Никольский из справочника')
 assert.match(route.buildStopDisplay('36-23',stops).detail,/в сторону центра/)
})
test('API retains weights for heatmap and excludes missing detections instead of counting them as zero',()=>{
 const make=(avg,count)=>({location_id:'36-23',window_start:'2026-09-22T20:00:00Z',person_count_avg:avg,person_count_max:10,sample_count:count})
 const result=route.aggregateRows([make(10,1),make(0,9),make(null,9),make(100,0)],new Map())
 assert.equal(result.locationHours[0].avgPeople,1);assert.equal(result.locationHours[0].sampleCount,10)
 assert.equal(result.locations[0].label,'Никольский')
})
function safetyApi(rows, failAt=-1) {
 const offsets=[]
 const db={from(){let start=0,end=999;const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>{offsets.push(start);resolve(start===failAt?{error:{message:'offline'}}:{data:rows.slice(start,Math.min(end+1,start+500)),error:null})};return(...args)=>{if(key==='range')[start,end]=args;return q}}});return q}}
 const api=load('lib/api/alerts.ts',{'../supabase':{supabase:db},'../request-cache':{sessionRequest:(_key,_ttl,fn)=>fn(),rangeRequestKey:()=>''}})
 return {api,offsets}
}
test('safety reads beyond server response caps; a failed page cannot turn into a zero-event chart',async()=>{
 const rows=Array.from({length:1201},(_,id)=>({id,alert_type:'smoking'})),ok=safetyApi(rows)
 assert.equal((await ok.api.fetchStopSafetyAlerts()).length,1201);assert.deepEqual(ok.offsets,[0,500,1000,1201])
 await assert.rejects(safetyApi(rows,500).api.fetchStopSafetyAlerts(),/Не удалось/)
 assert.equal((await safetyApi(rows).api.fetchStopSafetyAlerts(600)).length,600)
})
