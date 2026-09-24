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

const {stopDistrictCoverage,districtShortName}=load('lib/stop-coverage.ts')
test('coverage groups by stored district_id, keeps districts without stops, counts unassigned separately',()=>{
 const districts=[{id:1,name:'2-й микрорайон'},{id:2,name:'10-й микрорайон'},{id:3,name:'микрорайон 11а'}]
 const assignments=[{id:1,district_id:1},{id:2,district_id:1},{id:3,district_id:2},{id:4,district_id:null}]
 const result=stopDistrictCoverage([1,2,3,4,5],assignments,districts,{stops:{1:{has_equipment:true},3:{has_equipment:true},4:{has_equipment:true}}})
 assert.equal(result.unassigned,2)
 assert.deepEqual(result.rows.map(r=>[r.districtName,r.total,r.equipped,r.coveragePct]),[['2-й микрорайон',2,1,50],['10-й микрорайон',1,1,100],['микрорайон 11а',0,0,0]])
})
test('short district labels fit under a bar',()=>{
 assert.deepEqual(['14-й микрорайон','микрорайон 11Б','6-й квартал','Центральный микрорайон','микрорайон Квартал А','микрорайон Железнодорожников','микрорайон ПИКС'].map(districtShortName),['14','11Б','6 кв.','Центр.','Кв. А','Ж/д','ПИКС'])
})
const {mapFaultsSheet}=load('lib/exports/map-inventory.ts')
test('fault sheet groups continuous multi-day outages, aliases and repeated sensor signals without daily repetitions',()=>{
 const names={'controller:1':'Никольский'},start=Date.parse('2026-09-01'),end=Date.parse('2026-09-10')
 const base={equipment_type:'camera',equipment_id:7,bus_stop_id:1,started_at:'2026-08-31',ended_at:null,resolution:null}
 const events=[1,2,3].map(day=>({bus_stop_id:1,element:5,category:'temperature',alarm:'warning',created_at:`2026-09-0${day}`}))
 const sheet=mapFaultsSheet([base,{...base,equipment_id:10007},{...base,equipment_id:8,started_at:'2026-09-03',ended_at:'2026-09-04',resolution:'recovered'},{...base,equipment_id:9,ended_at:'2026-09-01'}],names,start,end,events)
 assert.equal(sheet.rows.length,3)
 const outage=sheet.rows.find(r=>r[2]==='Нет связи');assert.equal(outage[1],'Камеры (2)');assert.equal(outage[4],'—');assert.equal(outage[5],'Нет связи')
 assert.equal(sheet.rows.filter(r=>r[2]==='Температура вне нормы').length,1)
 assert.ok(!JSON.stringify(sheet).includes('С начала дня'))
})
