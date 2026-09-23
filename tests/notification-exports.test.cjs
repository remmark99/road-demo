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

const {cameraEventSheet,sensorEventSheet}=load('lib/exports/notification-events.ts')
const {createXlsx}=load('lib/exports/xlsx.ts')
const {unzipSync,strFromU8}=require('fflate')
test('simple camera report preserves 24-hour episodes and never invents legacy durations',()=>{
 const event={id:'a',alert_type:'abandoned_object',timestamp:'2026-09-03T19:00:00Z',metadata:{episode_schema:'abandoned_episode_v1',abandoned_episode:{status:'closed',started_at:'2026-09-03T19:00:00Z',last_seen_at:'2026-09-04T18:00:00Z',ended_at:'2026-09-04T19:00:00Z'}}}
 const sheet=cameraEventSheet([event,{...event,metadata:null}],new Map(),()=>'=Никольский',()=> 'Оставлен предмет')
 assert.equal(sheet.rows[1][2],'04.09.2026 00:00');assert.equal(sheet.rows[1][4],'24 ч.');assert.equal(sheet.rows[2][4],'—')
 assert.equal(sheet.rows[0].length,6)
 const xml=strFromU8(unzipSync(createXlsx([sheet]))['xl/worksheets/sheet1.xml'])
 assert.ok(xml.includes('Оставлен предмет'));assert.ok(xml.includes('=Никольский'));assert.ok(!xml.includes('<f>'))
})
test('sensor recovery shows the measured outage; point measurements do not invent duration',()=>{
 const a={category:'controller_online',value:60,created_at:'2026-09-04T02:00:00Z',alarm:'normal'}
 const sheet=sensorEventSheet([a,{...a,category:'temperature',value:20}],()=> 'Никольский',()=> 'Связь восстановлена',()=> 'Норма')
 assert.equal(sheet.rows[1][2],'04.09.2026 06:00');assert.equal(sheet.rows[1][3],'04.09.2026 07:00');assert.equal(sheet.rows[1][4],'1 ч.')
 assert.equal(sheet.rows[2][3],'—');assert.equal(sheet.rows[2][4],'—')
})
function endpoint({user={id:'user'},profile={role:'user',modules:['stops']},rows=[],cameras=[],features=[]}={}){
 const calls=[]
 const db={auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>({data:{features},error:null}),from(table){
  const state={a:0,b:999};const query=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:table==='profiles'?profile:table==='cameras'?cameras:table==='alerts_with_bin_episodes'||table==='controller_alerts'?rows.slice(state.a,state.b+1):[],error:null});return(...args)=>{calls.push([table,key,...args]);if(key==='range'){state.a=args[0];state.b=args[1]}return query}}});return query
 }}
 const mod=load('app/api/notifications/export/route.ts',{'@/lib/supabase/server':{createClient:async()=>db},'@/lib/api/alerts':{ALERT_TYPE_CONFIG:{}},'@/lib/api/controller-alerts':{CATEGORY_LABELS:{},ALARM_CONFIG:{}}})
 return {calls,...mod}
}
test('exports enforce authentication, module access and valid dates',async()=>{
 const req=q=>({nextUrl:new URL('http://local/api/notifications/export?'+q)})
 assert.equal((await endpoint({user:null}).GET(req('channel=cameras'))).status,401)
 assert.equal((await endpoint({profile:{role:'user',modules:['roads']}}).GET(req('channel=sensors'))).status,403)
 assert.equal((await endpoint().GET(req('channel=cameras&from=2026-09-04&to=2026-09-03'))).status,400)
 assert.equal((await endpoint().GET(req('channel=cameras&cameras=evil'))).status,400)
 const api=endpoint();const response=await api.GET(req('channel=cameras&from=2026-09-03&to=2026-09-03&types=bin_full'))
 assert.equal(response.status,200);assert.ok(decodeURIComponent(response.headers.get('content-disposition')).includes('События камер'))
 assert.ok(api.calls.some(c=>c[0]==='alerts_with_bin_episodes'&&c[1]==='in'&&c[2]==='module_name'&&c[3][0]==='stops'))
 assert.ok(api.calls.some(c=>c[1]==='lt'&&c[2]==='timestamp'&&c[3]==='2026-09-03T19:00:00.000Z'))
})
test('report reads every page and fails closed when a page is unavailable',async()=>{
 const {readReportRows}=load('lib/exports/read-report-rows.ts'),rows=Array.from({length:1001},(_,id)=>({id})),pages=[]
 assert.equal((await readReportRows(async(a,b)=>{pages.push(a);return {data:rows.slice(a,b+1),error:null}})).length,1001)
 assert.deepEqual(pages,[0,1000]);await assert.rejects(readReportRows(async()=>({data:null,error:{message:'offline'}})))
})

test('camera export resolves pipeline aliases within the event module and preserves events for deleted cameras',async()=>{
 const rows=[{id:'a',alert_type:'smoking',module_name:'stops',camera_index:7,timestamp:'2026-09-03T12:00:00Z'}]
 const cameras=[{camera_index:7,module:'roads',description:'Чужой адрес'}, {camera_index:10007,module:'stops',description:'Нужный адрес',lat:61,lng:73}]
 const req={nextUrl:new URL('http://local/api/notifications/export?channel=cameras')}
 const result=await endpoint({rows,cameras}).GET(req)
 assert.equal(result.status,200)
 const xml=strFromU8(unzipSync(new Uint8Array(await result.arrayBuffer()))['xl/worksheets/sheet1.xml'])
 assert.ok(xml.includes('Нужный адрес'));assert.ok(!xml.includes('Чужой адрес'))
 const missing=await endpoint({rows:[{...rows[0],module_name:'roads',camera_index:999999}]}).GET(req)
 assert.equal(missing.status,200);assert.match(strFromU8(unzipSync(new Uint8Array(await missing.arrayBuffer()))['xl/worksheets/sheet1.xml']),/Камера №999999/)
})

test('legacy smoking camera 145 resolves by recorded stop, never the roads camera with same index', async()=>{
 const row={id:'6645e050-5efd-4ca0-b703-bd8639cd1016',module_name:'smoking_detector',alert_type:'smoking',camera_index:145,metadata:{location_id:'66-24'},timestamp:'2026-09-03T12:00:00Z'}
 const cameras=[{camera_index:145,module:'roads',description:'Чужой адрес'},{camera_index:10145,module:'stops',description:'10 Микрорайон'}]
 const api=endpoint({rows:[row],cameras}),res=await api.GET({nextUrl:new URL('http://local/?channel=cameras')})
 assert.equal(res.status,200)
 const xml=strFromU8(unzipSync(new Uint8Array(await res.arrayBuffer()))['xl/worksheets/sheet1.xml'])
 assert.match(xml,/10 Микрорайон/);assert.doesNotMatch(xml,/Чужой адрес/)
 const {eventCameraModule}=load('lib/exports/event-camera.ts')
 assert.equal(eventCameraModule({...row,metadata:{location_id:'36-23'}}),'smoking_detector')
 assert.equal(eventCameraModule({...row,module_name:'roads'}),'roads')
})

 test('empty camera selection exports all events without an empty database filter',async()=>{
 const rows=[7,8].map(camera_index=>({id:String(camera_index),alert_type:'smoking',module_name:'stops',camera_index,timestamp:'2026-09-03T12:00:00Z'}))
 for(const suffix of ['', '&cameras=']){
  const api=endpoint({rows}),res=await api.GET({nextUrl:new URL('http://local/?channel=cameras'+suffix)})
  assert.equal(res.status,200)
  const xml=strFromU8(unzipSync(new Uint8Array(await res.arrayBuffer()))['xl/worksheets/sheet1.xml'])
  assert.match(xml,/Камера №7/);assert.match(xml,/Камера №8/)
  assert.ok(!api.calls.some(c=>c[1]==='in'&&c[2]==='camera_index'))
 }
})

 test('analytics links export the same exact interval and module as the notification feed',async()=>{
 const api=endpoint(),start='2026-09-23T05:00:00.000Z',end='2026-09-23T06:00:00.000Z'
 const query=new URLSearchParams({channel:'cameras',from:'2026-09-23',to:'2026-09-23',start,end,module:'stops',types:'smoking',cameras:'151'})
 const response=await api.GET({nextUrl:new URL('http://local/?'+query)})
 assert.equal(response.status,200)
 for(const [method,col,val] of [['gte','timestamp',start],['lt','timestamp',end],['eq','module_name','stops']]) assert.ok(api.calls.some(c=>c[0]==='alerts_with_bin_episodes'&&c[1]===method&&c[2]===col&&c[3]===val))
 assert.ok(api.calls.some(c=>c[1]==='in'&&c[2]==='camera_index'&&c[3].includes(151)))
 })
