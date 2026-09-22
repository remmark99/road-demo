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
test('API applies exclusive calendar bounds to every page and rejects malformed ranges before querying',async()=>{
 const calls=[]
 const query={select(){return this},in(){return this},gte(k,v){calls.push(['gte',v]);return this},lt(k,v){calls.push(['lt',v]);return this},order(){return this},range(){return this},then(resolve){resolve({data:[],count:1001,error:null})}}
 const {GET}=load('app/api/stop-sensor-history/route.ts',{
 'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
 '@/lib/api/stop-sensor-history':{SENSOR_HISTORY_PERIODS:[1,6,24,168]},
 '@/lib/supabase/server':{createClient:async()=>({from:()=>query})}
 })
 const response=await GET({nextUrl:new URL('http://local/?from=2026-09-01&to=2026-09-02')})
 assert.equal(response.status,200)
 assert.deepEqual(calls,[['gte','2026-08-31T19:00:00.000Z'],['lt','2026-09-02T19:00:00.000Z'],['gte','2026-08-31T19:00:00.000Z'],['lt','2026-09-02T19:00:00.000Z']])
 calls.length=0
 assert.equal((await GET({nextUrl:new URL('http://local/?from=2026-02-30&to=2026-03-01')})).status,400)
 assert.deepEqual(calls,[])
})
test('Excel has a neutral header and neutral table style',()=>{
 const {createXlsx}=load('lib/exports/xlsx.ts'),{unzipSync,strFromU8}=require('fflate')
 const files=unzipSync(createXlsx([{name:'Сводка',rows:[['Остановка'],['Никольский']]}]))
 assert.match(strFromU8(files['xl/styles.xml']),/FFFFFFFF/)
 assert.match(strFromU8(files['xl/tables/table1.xml']),/showRowStripes="0"/)
})
