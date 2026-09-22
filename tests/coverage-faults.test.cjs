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

const {exactStopCoverage}=load('lib/stop-coverage.ts')
const district=(id,coordinates,type='Polygon')=>({id,name:`Район ${id}`,geom:{type,coordinates}})
const square=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]
const geo=points=>({type:'FeatureCollection',features:points.map((coordinates,i)=>({properties:{id:i+1},geometry:{type:'Point',coordinates}}))})
test('coverage counts actual polygon containment, holes and islands; outside is not nearest district',()=>{
 const districts=[district(1,[square(0,0,10),square(2,2,2)]),district(2,[[square(20,20,2)],[square(30,30,2)]],'MultiPolygon'),district(3,[square(50,50,2)])]
 const result=exactStopCoverage(geo([[1,1],[3,3],[21,21],[31,31],[100,100]]),districts,{stops:{1:{has_equipment:true},3:{has_equipment:true}}})
 assert.equal(result.unassigned,2);assert.equal(result.ambiguous,0)
 assert.deepEqual(result.rows.map(r=>[r.total,r.equipped,r.coveragePct]),[[1,1,100],[2,1,50],[0,0,0]])
})
test('shared boundaries and overlapping districts never double-count stops',()=>{
 const result=exactStopCoverage(geo([[10,5],[15,5],[0,0]]),[district(1,[square(0,0,10)]),district(2,[square(10,0,10)])],null)
 assert.equal(result.ambiguous,1);assert.equal(result.unassigned,0)
 assert.deepEqual(result.rows.map(r=>r.total),[1,1])
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
