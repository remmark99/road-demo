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

const {cameraConfidence, formatCameraConfidence, binEpisodeConfidences, closedEpisodeImage} = load('lib/notifications/camera-evidence.ts')
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
test('bin episodes report a score per boundary and never borrow the VLM answer', () => {
  const episode = {status:'closed', started_at:'2026-01-01T00:00:00Z', last_seen_at:'2026-01-01T01:00:00Z',
    ended_at:'2026-01-01T02:00:00Z', observation_count:3, start_confidence:.97, end_confidence:.85, end_confidence_samples:2}
  const bin = (bin_episode, extra={}) => ({alert_type:'bin_full', severity:.7, metadata:{episode_schema:'bin_episode_v1', bin_episode, ...extra}})
  assert.deepEqual(binEpisodeConfidences(bin(episode)), {start:.97, end:.85, samples:2})
  // The episode's own boundary score outranks the shared legacy key.
  assert.equal(binEpisodeConfidences(bin(episode, {model_response:'YOLO Classifier: label=overfilled, confidence=0.55'})).start, .97)
  // Open episodes have no end score yet; abandoned objects reuse the shape.
  assert.equal(binEpisodeConfidences(bin({...episode, status:'open', ended_at:null})).end, null)
  assert.deepEqual(binEpisodeConfidences({alert_type:'abandoned_object', metadata:{episode_schema:'abandoned_episode_v1',
    abandoned_episode:episode}}), {start:null, end:null, samples:null})
  // Alerts written before the structured fields keep the recorded classifier
  // line for the start and show no end score.
  const legacy = {alert_type:'bin_full', severity:.7, metadata:{model_response:'YOLO Classifier: label=overfilled, confidence=0.999'}}
  assert.deepEqual(binEpisodeConfidences(legacy), {start:.999, end:null, samples:null})
  // The column is defined for bin episodes: the start score, not the last frame.
  assert.equal(cameraConfidence(bin(episode)), .97)
  // A VLM episode (no probability) shows no number rather than a guess.
  const vlm = bin({...episode, start_confidence:null, end_confidence:null, end_confidence_samples:null})
  assert.deepEqual(binEpisodeConfidences(vlm), {start:null, end:null, samples:null})
  assert.equal(formatCameraConfidence(vlm), 'Нет данных')
})
test('last positive frame is never substituted for recovery evidence', () => {
  assert.equal(closedEpisodeImage({latest_image_url:'incident.jpg',image_url:'incident.jpg'}),null)
  assert.equal(closedEpisodeImage({closed_image_url:'clean.jpg'}),'clean.jpg')
})

test('Shift selects and clears whole visible stop ranges in either direction', () => {
  const {selectCameraPlaceRange}=load('lib/notifications/feed-filters.ts')
  const places=[{key:'a',cameraIndexes:[1,2]},{key:'b',cameraIndexes:[3]},{key:'c',cameraIndexes:[4,5]}]
  assert.deepEqual(selectCameraPlaceRange(places,[99,1,2],'c','a',true),[99,1,2,3,4,5])
  assert.deepEqual(selectCameraPlaceRange(places,[99,1,2,3,4,5],'a','c',false),[99])
  assert.deepEqual(selectCameraPlaceRange(places,[99],'b','hidden-by-search',true),[99,3])
  assert.deepEqual(selectCameraPlaceRange(places,[99],'c',null,true),[99,4,5])
})

const { buildStopPlaces, findStopPlace } = load('lib/notifications/feed-filters.ts')
const { controllerAlertMessage, isRecoveryAlert, getCategoryColor, RECOVERY_COLOR, CATEGORY_COLORS } = load('lib/api/controller-alerts.ts', { '../request-cache': { sessionRequest: (_k, _t, f) => f() }, '../supabase': { supabase: {} } })
test('sensor feed: stops stand in for camera places and are found by bus_stop_id', () => {
  const places = buildStopPlaces([
    { id: 7, name: 'Центр', short_name: 'ост. 1-2', address: 'Ленина, 1', description: null },
    { id: 3, name: 'Вокзал', short_name: null, address: null, description: null },
  ])
  assert.deepEqual(places.map(p => p.key), ['stop:3', 'stop:7'])
  assert.deepEqual(places[1], { key: 'stop:7', label: 'Ленина, 1', detail: 'Центр · № 1-2', cameraIndexes: [7] })
  assert.deepEqual(filteredCameraIndexes(places, 'вокзал', []), [3])
  assert.equal(findStopPlace(places, 7)?.label, 'Ленина, 1')
  assert.equal(findStopPlace(places, null), undefined)
})
test('sensor feed: the operator reads what happened, not a controller label', () => {
  const own = 'Высокая температура на остановке: 35.2 °C (порог 30 °C)'
  assert.equal(controllerAlertMessage({ category: 'temperature', alarm: 'critical', value: 35.2, message: own }), own)
  assert.equal(controllerAlertMessage({ category: 'temperature', alarm: 'critical', value: 35.2, message: 'Temperature DIO alarm' }), 'Температура вне допустимых пределов: 35,2 °C')
  assert.equal(controllerAlertMessage({ category: 'humidity', alarm: 'normal', value: 40, message: '' }), 'Влажность вернулась в норму: 40 %')
  // The poller's old row: Cyrillic, but no reading in it — the value column has one.
  assert.equal(controllerAlertMessage({ category: 'humidity', alarm: 'alarm', value: 91.04, message: 'Зафиксировано срабатывание: Влажность (элемент 13, адрес 1)' }), 'Влажность вне допустимых пределов: 91 %')
  assert.equal(controllerAlertMessage({ category: 'humidity', alarm: 'alarm', value: 91, message: 'Влажность вне допустимых пределов: 91.0 % (порог задан на контроллере)' }), 'Влажность вне допустимых пределов: 91.0 % (порог задан на контроллере)')
  assert.equal(controllerAlertMessage({ category: 'digital input', alarm: 'critical', value: 1, message: 'DIO1' }), 'Сработал датчик разбития стекла')
  assert.equal(controllerAlertMessage({ category: 'digital input', alarm: 'normal', value: 0, message: 'DIO1' }), 'Датчик разбития стекла вернулся в норму')
  assert.equal(controllerAlertMessage({ category: 'controller_offline', alarm: 'critical', value: 12, message: '' }), 'Контроллер остановки не на связи 12 мин')
  assert.equal(controllerAlertMessage({ category: 'controller_online', alarm: 'normal', value: 48, message: 'ONLINE' }), 'Контроллер остановки снова на связи. Не отвечал 48 мин')
  assert.equal(isRecoveryAlert({ alarm: 'alarm' }), false)
  assert.equal(getCategoryColor({ category: 'temperature', alarm: 'normal' }), RECOVERY_COLOR)
  assert.equal(getCategoryColor({ category: 'incident', alarm: 'alarm' }), CATEGORY_COLORS.incident)
})
