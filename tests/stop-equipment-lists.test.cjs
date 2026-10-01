const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
function load(file){const absolute=path.resolve(__dirname,'..',file),module={exports:{}};const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(id=>id.startsWith('.')?load(path.relative(path.resolve(__dirname,'..'),path.resolve(path.dirname(absolute),id+'.ts'))):require(id),module,module.exports);return module.exports}
const {buildStopEquipmentLists,equipmentListHref,parseEquipmentGroup}=load('lib/stop-equipment-lists.ts')
test('all four drilldowns partition the same device data as KPI cards, preserve monitor verdicts and camera offset',()=>{
 const directory={features:[{properties:{id:1,name:'Первая',address:'Адрес'}},{properties:{id:2,name:'Вторая',address:null}}]}
 const cameras=[{id:1,camera_index:10130,module:'stops',bus_stop_id:1,status:'offline',name:'Вход'}, {id:2,camera_index:10131,module:'stops',bus_stop_id:1,status:'online'}, {id:3,camera_index:130,module:'stops',bus_stop_id:2,status:'offline'}, {id:4,camera_index:999,module:'roads',bus_stop_id:1,status:'online'}, {id:5,camera_index:10132,module:'stops',bus_stop_id:999,status:'online'}, {id:6,camera_index:10133,module:'stops',bus_stop_id:null,lat:61,lng:73,status:'online'}]
 const equipment=[{equipment_type:'camera',equipment_id:130,status:'online',updated_at:'2026-10-01'}, {equipment_type:'camera',equipment_id:131,status:'unknown',updated_at:'2026-10-01'}]
 const activity={stops:{1:{has_controller:true,sensors_online:true},2:{has_controller:true,sensors_online:false},3:{has_controller:false,sensors_online:false}}}
 const groups=buildStopEquipmentLists({directory,cameras,equipment,activity})
 assert.deepEqual(groups['cameras-online'].map(c=>c.id).sort(),[1,6]);assert.deepEqual(groups['cameras-offline'].map(c=>c.id).sort(),[2,3])
 assert.deepEqual(groups['sensors-online'].map(c=>c.id),[1]);assert.deepEqual(groups['sensors-offline'].map(c=>c.id),[2])
 assert.equal(groups['cameras-online'].find(c=>c.id===1).name,'Вход');assert.equal(groups['cameras-offline'].find(c=>c.id===2).name,'Камера №131')
 assert.equal(groups['cameras-online'].find(c=>c.id===6).stopName,'Остановка не привязана')
})
test('drilldown URLs support each online/offline group and reject invalid broadening filters',()=>{
 for(const group of ['cameras-online','cameras-offline','sensors-online','sensors-offline']){const url=new URL(equipmentListHref(group),'http://localhost');assert.equal(parseEquipmentGroup(url.searchParams.get('type'),url.searchParams.get('status')),group)}
 for(const args of [[null,null],['all','online'],['camera','all'],['sensor','unknown']])assert.equal(parseEquipmentGroup(...args),null)
})
