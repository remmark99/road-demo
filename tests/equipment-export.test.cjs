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

function client({user=true,access=true,fail=false,states=[],outages=[]}={}) {
    return {auth:{getUser:async()=>({data:{user:user?{id:'test'}:null},error:null})},from(table){
        let from=0,to=999
        const chain={select(){return chain},eq(){return chain},order(){return chain},range(a,b){from=a;to=b;return chain},
            single:async()=>({data:{role:'user',modules:access?['stops']:[]},error:null}),
            then(resolve,reject){return Promise.resolve({data:(table==='equipment_state'?states:outages).slice(from,to+1),error:fail?'unavailable':null}).then(resolve,reject)}}
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
test('export route reads beyond 1000 rows and returns a real workbook, never a partial success on DB failure',async()=>{
    const states=Array.from({length:1001},(_,i)=>state(1000+i,'online',iso(0),'stop-'+i))
    const response=await request({states})
    assert.equal(response.status,200)
    assert.match(response.headers.get('content-type'),/spreadsheetml.sheet/)
    const files=unzipSync(new Uint8Array(await response.arrayBuffer()))
    assert.match(strFromU8(files['xl/worksheets/sheet1.xml']),/<v>1001<\/v>/)
    assert.equal((await request({fail:true})).status,503)
})
