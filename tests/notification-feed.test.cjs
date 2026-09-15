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
const { notificationPeriodBounds, notificationDate, formatEventDuration, buildCameraPlaces, filteredCameraIndexes } = load('lib/notifications/feed-filters.ts')
test('one local day includes midnight and uses an exclusive next-day bound in UTC+5', () => {
  assert.deepEqual(notificationPeriodBounds({ from: '2026-09-03', to: '2026-09-03' }), { fromInclusive: '2026-09-02T19:00:00.000Z', toExclusive: '2026-09-03T19:00:00.000Z' })
  assert.deepEqual(notificationPeriodBounds({from:'',to:''}), { fromInclusive:undefined,toExclusive:undefined })
  assert.equal(notificationDate(Date.parse('2026-09-03T20:00:00Z')), '2026-09-04')
  assert.equal(notificationPeriodBounds({from:'2024-02-29',to:''}).fromInclusive,'2024-02-28T19:00:00.000Z')
  for(const value of [{from:'2026-02-30',to:''},{from:'bad',to:''},{from:'2026-09-04',to:'2026-09-03'}]) assert.throws(()=>notificationPeriodBounds(value))
})
test('duration preserves total hours across days and does not invent negative durations', () => {
  assert.equal(formatEventDuration('2026-09-03T00:00:00Z','2026-09-04T00:00:00Z'), '24 ч.')
  assert.equal(formatEventDuration('2026-09-03T00:00:00Z','2026-09-05T01:12:00Z'), '49 ч. 12 мин.')
  assert.equal(formatEventDuration('2026-09-03T00:00:00Z','2026-09-02T00:00:00Z'), 'нет данных')
})
test('directory groups both cameras by live address and number, search intersects selection', () => {
  const cameras=[{cameraIndex:10151,module:'stops',busStopId:10,name:'Камера 10151'}, {cameraIndex:10152,module:'stops',busStopId:10}, {cameraIndex:130,module:'roads',description:'Улица 30 лет Победы'}]
  const places=buildCameraPlaces(cameras,[{id:10,name:'Никольский',address:'Улица Никольская',short_name:'86-22'}])
  assert.equal(places.length,2)
  assert.equal(places.find(p=>p.key==='stop:10').detail,'Никольский · № 86-22')
  assert.deepEqual(filteredCameraIndexes(places,'НИКОЛЬСКАЯ',[]),[10151,10152])
  assert.deepEqual(filteredCameraIndexes(places,'86-22',[10152,130]),[10152])
  assert.deepEqual(filteredCameraIndexes(places,'Несуществующая',[]),[])
  assert.equal(filteredCameraIndexes(places,'',[]),undefined)
  assert.equal(places.find(p=>p.key==='camera:130').label,'Улица 30 лет Победы')
})
function api(file, options) {
  const calls=[]
  const query=new Proxy({}, { get(_,key) { if(key==='then') return resolve=>resolve({data:[],count:42,error:null});return (...args)=>{ calls.push([key,...args]);return query } } })
  const supabase={ from:table=>{calls.push(['from',table]);return query} }
  return { calls, promise:load(file,{'@/lib/supabase':{supabase},'../supabase':{supabase}})[file.includes('controller')?'fetchControllerAlerts':'fetchAlerts'](options) }
}
test('camera filter is applied in the DB with exact count, pagination and stop-only aliases', async()=>{
  const bounds=notificationPeriodBounds({from:'2026-09-03',to:'2026-09-04'})
  const {calls,promise}=api('lib/api/alerts.ts',{...bounds,cameraIndexes:[10151],limit:25,offset:50})
  await promise
  assert.ok(calls.some(c=>c[0]==='gte' && c[1]==='timestamp' && c[2]===bounds.fromInclusive))
  assert.ok(calls.some(c=>c[0]==='lt' && c[1]==='timestamp' && c[2]===bounds.toExclusive))
  assert.ok(calls.some(c=>c[0]==='range' && c[1]===50 && c[2]===74))
  assert.ok(calls.some(c=>c[0]==='or' && c[1]==='camera_index.in.(10151),and(module_name.eq.stops,camera_index.in.(151))'))
  assert.equal((await api('lib/api/alerts.ts',{cameraIndexes:[]}).promise).total,0)
})
test('sensor filter uses the same date boundaries before pagination', async()=>{
  const bounds=notificationPeriodBounds({from:'2026-09-03',to:'2026-09-03'})
  const {calls,promise}=api('lib/api/controller-alerts.ts',{...bounds,limit:10,offset:20})
  await promise
  assert.ok(calls.some(c=>c[0]==='gte' && c[1]==='created_at' && c[2]===bounds.fromInclusive))
  assert.ok(calls.some(c=>c[0]==='lt' && c[1]==='created_at' && c[2]===bounds.toExclusive))
  assert.ok(calls.some(c=>c[0]==='range' && c[1]===20 && c[2]===29))
})

const {cameraConfidence, formatCameraConfidence, closedEpisodeImage} = load('lib/notifications/camera-evidence.ts')
test('accuracy uses recorded model scores, never priority or appearance matching', () => {
  const alert={alert_type:'bin_full', severity:.7, metadata:{model_response:'YOLO Classifier: label=overfilled, confidence=0.999'}}
  assert.equal(formatCameraConfidence(alert), '99,9 %')
  assert.equal(formatCameraConfidence({...alert,metadata:{}}),'Нет данных')
  for(const value of [NaN,Infinity,-.1,1.1,'0.99',null]) assert.equal(cameraConfidence({...alert,metadata:{confidence:value}}),null)
  assert.equal(formatCameraConfidence({...alert,metadata:{confidence:0}}),'0 %')
  assert.equal(formatCameraConfidence({...alert,metadata:{confidence:1}}),'100 %')
  assert.equal(cameraConfidence({...alert,metadata:{model_response:'YOLO Classifier: label=not_overfilled, confidence=0.999'}}),null)
  assert.equal(cameraConfidence({alert_type:'lying_person',metadata:{spatial_evidence:{pose_evidence:{detection_confidence:.91}},lying_subject:{appearance_confidence:1}}}),.91)
  assert.equal(cameraConfidence({alert_type:'smoking',metadata:{detections:[{class:'person',confidence:.99},{class:'smoking',confidence:.87}]}}),.87)
  assert.equal(formatCameraConfidence({alert_type:'smoking',metadata:{detections:[{class:'cigarette',conf:.6816961765289307}]}}),'68,2 %')
})
test('last positive frame is never substituted for recovery evidence', () => {
  assert.equal(closedEpisodeImage({latest_image_url:'incident.jpg',image_url:'incident.jpg'}),null)
  assert.equal(closedEpisodeImage({closed_image_url:'clean.jpg'}),'clean.jpg')
})
