const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { unzipSync, strFromU8 } = require('fflate')
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
const { parseEquipmentPeriod, buildCameraTimelines, summarizeEquipmentHours } = load('lib/exports/equipment-hours.ts')
const { createXlsx } = load('lib/exports/xlsx.ts')
const at = (hour, minute = 0) => Date.UTC(2026, 8, 11, hour - 5, minute)
const iso = (h, m = 0) => new Date(at(h, m)).toISOString()
const state = (id, status, since, location = 'same-stop') => ({ equipment_type:'camera',equipment_id:id,status,status_since:since,updated_at:iso(10),location_id:location,bus_stop_id:null,stop_name:'Тестовая остановка' })
const outage = (id, camera, start, end, resolution='recovered') => ({ id,equipment_type:'camera',equipment_id:camera,location_id:'same-stop',bus_stop_id:null,started_at:start,ended_at:end,detected_at:start,resolution })

test('UTC+5 dates, leap days, reversed/oversized/future ranges and partial hour', () => {
    assert.equal(parseEquipmentPeriod('2026-09-11','2026-09-11',at(12,30)).start,at(0))
    assert.equal(parseEquipmentPeriod('2026-09-11','2026-09-11',at(12,30)).end,at(12,30))
    for(const [a,b] of [['2026-02-30','2026-03-01'],['bad','2026-09-11'],['2026-09-12','2026-09-11'],['2024-01-01','2026-01-01'],['2026-09-11','2026-09-12']]) {
        assert.throws(()=>parseEquipmentPeriod(a,b,at(12,30)))
    }
    assert.doesNotThrow(()=>parseEquipmentPeriod('2024-02-29','2024-02-29',at(12)))
})

test('hourly counts deduplicate cameras and stops, retain unknown before evidence', () => {
    const timelines=buildCameraTimelines([state(900,'online',iso(10,20)),state(901,'online',iso(10,40))],[],at(12,30))
    const rows=summarizeEquipmentHours(timelines,at(9),at(12,30))
    assert.equal(rows[0].activeCameras,null)
    assert.equal(rows[0].unknownCameras,2)
    assert.equal(rows[1].activeCameras,2)
    assert.equal(rows[1].activeStops,1)
    assert.equal(rows.at(-1).to,'2026-09-11 12:30')
    assert.equal(rows.length,4)
})

test('outages crossing midnight, boundary recoveries and brief disconnections', () => {
    const events=[outage(1,900,iso(-1),iso(10)),outage(2,900,iso(10,10),iso(10,20)),outage(3,900,iso(11),null,null)]
    const timelines=buildCameraTimelines([state(900,'offline',iso(11))],events,at(13))
    const rows=summarizeEquipmentHours(timelines,at(9),at(12))
    assert.equal(rows[0].activeCameras,0)
    assert.equal(rows[1].activeCameras,1)
    assert.equal(rows[2].activeCameras,0)
    assert.equal(rows[1].activeStops,1)
})

test('a partially unknown inactive camera does not erase a known active stop', () => {
    const timelines=buildCameraTimelines([state(900,'online',iso(9)),state(901,'unknown',null)],[],at(12))
    const row=summarizeEquipmentHours(timelines,at(10),at(11))[0]
    assert.equal(row.activeCameras,null)
    assert.equal(row.confirmedCameras,1)
    assert.equal(row.activeStops,1)
})

test('removed devices are not kept online forever; no inventory is not zero activity', () => {
    const timelines=buildCameraTimelines([], [outage(1,900,iso(8),iso(9))], at(12))
    assert.equal(summarizeEquipmentHours(timelines,at(10),at(11))[0].activeCameras,null)
    assert.equal(summarizeEquipmentHours([],at(10),at(11))[0].activeStops,null)
})

test('unlinked cameras and conflicting offline evidence cannot inflate totals', () => {
    const s=state(999,'online',iso(9),null)
    const timelines=buildCameraTimelines([s],[{...outage(1,999,iso(10),null,null),location_id:null}],at(12))
    const row=summarizeEquipmentHours(timelines,at(10),at(11))[0]
    assert.equal(row.activeCameras,0)
    assert.equal(row.activeStops,null)
    assert.equal(row.unlinkedCameras,1)
})

test('XLSX preserves numeric counts, empty unknown values and safe literal strings', () => {
    const buffer=createXlsx([{name:'По часам',rows:[['Начало','Камеры','Неизвестно','Название'],['2026-09-11 10:00',2,null,'=HYPERLINK("bad") & <test>']]}])
    const files=unzipSync(buffer), sheet=strFromU8(files['xl/worksheets/sheet1.xml'])
    assert.match(sheet,/<c r="B2"><v>2<\/v><\/c>/)
    assert.match(sheet,/<c r="C2"\/>/)
    assert.match(sheet,/t="inlineStr"/)
    assert.doesNotMatch(sheet,/<f>/)
    assert.match(sheet,/&amp; &lt;test&gt;/)
    fs.writeFileSync(process.env.EQUIPMENT_TEST_XLSX || path.join(require('node:os').tmpdir(), 'equipment-export-test.xlsx'),buffer)
})

const { buildMapInventoryDays, mapCameraIds } = load('lib/exports/map-inventory.ts')
function client({queried=[],user=true,access=true,fail=false,cameras=[],history=[],outages=[],controllers=[],sensorEvents=[],stopIds=[],missingHistory=false}={}) {
    return {auth:{getUser:async()=>({data:{user:user?{id:'test'}:null},error:null})},
        rpc:async()=>({data:{features:stopIds.map(id=>({properties:{id,name:`Остановка ${id}`,address:`Улица ${id}`},geometry:{coordinates:[73,61]}}))},error:fail?'unavailable':null}),
        from(table){
        queried.push(table)
        let from=0,to=999
        const chain={select(){return chain},eq(){return chain},order(){return chain},gte(){return chain},lte(){return chain},lt(){return chain},or(){return chain},range(a,b){from=a;to=b;return chain},
            single:async()=>({data:{role:'user',modules:access?['stops']:[]},error:null}),
            then(resolve,reject){return Promise.resolve({data:(table==='cameras'?cameras:table==='map_inventory_history'?history:table==='bus_stops'?controllers:table==='controller_alerts'?sensorEvents:outages).slice(from,to+1),error:fail?'unavailable':missingHistory && table==='map_inventory_history'?{code:'PGRST205'}:null}).then(resolve,reject)}}
        return chain
    }}
}
async function request(options,query='from=2026-09-11&to=2026-09-11') {
    const {GET}=load('app/api/equipment/export/route.ts',{'@/lib/supabase/server':{createClient:async()=>client(options)}})
    const {NextRequest}=require('next/server')
    return GET(new NextRequest('http://localhost/api/equipment/export?'+query))
}
test('export route enforces sign-in, module access and date validation', async()=>{
    assert.equal((await request({user:false})).status,401)
    assert.equal((await request({access:false})).status,403)
    assert.equal((await request({},'from=bad&to=bad')).status,400)
})
test('map report reads all objects, counts offline objects and exports one row per day',async()=>{
    const cameras=Array.from({length:1001},(_,i)=>({camera_index:i,bus_stop_id:10,lat:61,lng:73,status:'offline'}))
    const options={cameras,stopIds:[10,11],history:[{recorded_at:iso(0),cameras:1001,stops:2}]}
    const response=await request(options)
    assert.equal(response.status,200)
    const disposition=response.headers.get('content-disposition')
    assert.match(disposition,/^attachment; filename\*=UTF-8''/)
    assert.equal(decodeURIComponent(disposition.split("UTF-8''")[1]),'Отчёт об остановках с 11.09.2026 по 11.09.2026.xlsx')
    const files=unzipSync(new Uint8Array(await response.arrayBuffer()))
    const sheet=strFromU8(files['xl/worksheets/sheet3.xml'])
    assert.match(sheet,/<v>1001<\/v>/)
    assert.equal(Object.keys(files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).length, 3)
    assert.equal((sheet.match(/<row /g)||[]).length,2)
    assert.match(sheet,/11\.09\.2026/)
    const json=await (await request(options,'from=2026-09-11&to=2026-09-11&format=json')).json()
    assert.equal(json.current.cameras,1001)
    assert.equal(json.current.stops,2)
    assert.equal(json.days[0].cameras,1001)
    assert.equal((await request({fail:true})).status,503)
})
test('missing inventory history is explicit and is never backfilled with current totals',async()=>{
    const result=await (await request({missingHistory:true,cameras:[{camera_index:1,bus_stop_id:10}],stopIds:[10]},'from=2026-09-11&to=2026-09-11&format=json')).json()
    assert.equal(result.current.cameras,1)
    assert.equal(result.days[0].cameras,null)
    assert.equal(result.days[0].stops,null)
    assert.equal(result.historyAvailable,false)
})
test('daily inventory uses the final snapshot, respects midnight, and times only incidents',()=>{
    const history=[{recorded_at:iso(1),cameras:3,stops:2},{recorded_at:iso(20),cameras:4,stops:3},{recorded_at:iso(24),cameras:5,stops:4}]
    const current={recorded_at:iso(36),cameras:6,stops:4}
    const days=buildMapInventoryDays(history,current,[outage(1,900,iso(7,20),iso(8,5))],at(0),at(36))
    assert.equal(days.length,2)
    assert.deepEqual(days.map(d=>[d.cameras,d.stops]),[[4,3],[6,4]])
    assert.match(days[0].note,/07:20 — потеря связи/)
    assert.match(days[0].note,/08:05 — связь восстановлена/)
    assert.doesNotMatch(days[0].note,/20:00/)
    assert.match(days[1].note,/день ещё не завершён/)
    const unknown=buildMapInventoryDays([],current,[],at(-24),at(36))
    assert.equal(unknown[0].cameras,null)
    assert.equal(unknown[1].cameras,null)
    assert.equal(unknown[2].cameras,6)
    const zero=buildMapInventoryDays([{recorded_at:iso(0),cameras:0,stops:0}],current,[],at(0),at(24))
    assert.equal(zero[0].cameras,0)
})
test('map inventory excludes orphaned bound cameras and deduplicates map camera ids',()=>{
    assert.deepEqual([...mapCameraIds([
        {camera_index:1,bus_stop_id:10,lat:0,lng:0},
        {camera_index:1,bus_stop_id:10,lat:0,lng:0},
        {camera_index:2,bus_stop_id:11,lat:61,lng:73},
        {camera_index:3,bus_stop_id:null,lat:61,lng:73},
        {camera_index:4,bus_stop_id:null,lat:NaN,lng:73},
    ],new Set([10]))],[1,3])
})

test('map camera aliases retain pipeline outages without changing inventory totals',async()=>{
    const data=await (await request({cameras:[{camera_index:10130,bus_stop_id:10}],stopIds:[10],history:[{recorded_at:iso(0),cameras:1,stops:1}],outages:[outage(1,130,iso(7,20),iso(8))]},'from=2026-09-11&to=2026-09-11&format=json')).json()
    assert.equal(data.days[0].cameras,1)
    assert.match(data.days[0].note,/07:20 — потеря связи: камеры: 1/)
})


test('daily report names locations and deduplicates repeated sensor faults within a day',()=>{
    const current={recorded_at:iso(24),cameras:31,stops:438,sensor_stops:10}
    const sensorEvents=[7,8,9].map(h=>({created_at:iso(h),bus_stop_id:10,element:1,category:'glass_break',alarm:'critical'}))
    const days=buildMapInventoryDays([{...current,recorded_at:iso(0)}],current,[outage(1,130,iso(7),iso(8))],at(0),at(24),{'camera:130':'Никольский — камера №130','controller:10':'Никольский'},sensorEvents)
    assert.equal(days[0].sensor_stops,10)
    assert.equal(days[0].failures,2)
    assert.equal(days[0].events.filter(e=>e.includes('инцидент')).length,1)
    assert.match(days[0].note,/Никольский/)
})

const {stopHistoryAt,historicalCameras,historicalStops}=load('lib/stop-history.ts')
test('map rewind follows actual recoveries, preserves unknown dates, aliases and both cameras',()=>{
    const history={now:iso(12),states:[state(130,'online',iso(10)),state(131,'online',iso(11)),{...state(10,'offline',iso(7)),equipment_type:'controller'}],outages:[outage(1,130,iso(7),iso(10)),outage(2,131,iso(7),iso(11))]}
    const cameras=[130,131].map(id=>({id:`cam-${10000+id}`,cameraIndex:10000+id,module:'stops',busStopId:10,status:'online'}))
    const geo={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[73,61]},properties:{id:10,sensor_data:{has_controller:true,glass_broken:true}}}]}
    function view(h){const snapshot=stopHistoryAt(history,at(h));const cams=historicalCameras(cameras,snapshot);return {cams,sd:historicalStops(geo,cams,snapshot).features[0].properties.sensor_data}}
    assert.equal(view(6).sd.activity_status,'unknown')
    assert.equal(view(8).sd.activity_status,'inactive')
    assert.equal(view(10).sd.online_camera_count,1)
    assert.equal(view(11).sd.online_camera_count,2)
    assert.equal(view(12).sd.online_camera_count,2)
    assert.equal(view(10).sd.glass_broken,undefined)
    assert.equal(view(8).cams[0].status,'offline')
    assert.equal(cameras[0].status,'online')
    assert.equal(historicalCameras(cameras,null),cameras)
})

test('history endpoint requires module access and pages past 1000 records',async()=>{
    const {NextRequest}=require('next/server')
    const rows=Array.from({length:1001},(_,id)=>outage(id,130,iso(7),null))
    for(const [options,status] of [[{user:false},401],[{access:false},403],[{outages:rows},200]]){
        const {GET}=load('app/api/stop-history/route.ts',{'@/lib/supabase/server':{createClient:async()=>client(options)}})
        const response=await GET(new NextRequest('http://localhost/api/stop-history'))
        assert.equal(response.status,status)
        if(status===200) assert.equal((await response.json()).outages.length,1001)
    }
})


test('merged live camera lookup does not confuse road IDs with VMS camera IDs',()=>{
    const {monitoredCameraOnline}=load('lib/equipment-status.ts')
    const statuses=new Map([[130,'offline'],[131,'online']])
    assert.equal(monitoredCameraOnline(statuses,10130),false)
    assert.equal(monitoredCameraOnline(statuses,10131),true)
    assert.equal(monitoredCameraOnline(statuses,130),null)
    assert.equal(monitoredCameraOnline(statuses,1000),null)
})

test('inventory preview never queries historical inventory, outages or sensor events', async()=>{
 const queried=[],db=client({queried,stopIds:[1]})
 const {GET}=load('app/api/equipment/export/route.ts',{'@/lib/supabase/server':{createClient:async()=>db}})
 const res=await GET({nextUrl:new URL('http://local/?from=2026-09-01&to=2026-09-02&format=inventory')})
 assert.equal(res.status,200);assert.equal((await res.json()).inventory.length,1)
 for(const table of ['map_inventory_history','equipment_outages','controller_alerts'])assert.ok(!queried.includes(table),table)
})
