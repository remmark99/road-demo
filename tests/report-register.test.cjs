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

const {stopRegister,registerSheets,cameraPlace}=load('lib/exports/stop-register.ts')
const {createXlsx}=load('lib/exports/xlsx.ts')
const {unzipSync,strFromU8}=require('fflate')
const geometry={type:'FeatureCollection',features:[1,2,3,4].map(id=>({type:'Feature',properties:{id,name:`Остановка ${id}`,short_name:`86-${id}`,address:`Улица ${id}`},geometry:{type:'Point',coordinates:[73,61]}}))}
const cameras=[1,2].map(id=>({camera_index:10000+id,bus_stop_id:id,name:`Камера ${id}`,lat:61,lng:73}))
const controllers=[1,3].map(id=>({id,has_controller:true,ip_address:null}))
test('inventory groups overlap deliberately; exclusive groups partition stops and offline equipment remains included',()=>{
 const rows=stopRegister(geometry,cameras,controllers),sheets=registerSheets(rows,cameras,geometry)
 assert.deepEqual(sheets.map(s=>s.rows.length-1),[4,2,2,1,1,1,2])
 assert.equal(rows[0].number,'86-1');assert.equal(rows[0].equipment,'Камеры и датчики')
 assert.ok(sheets[6].rows[1][3].includes('Улица 1'))
 assert.ok(cameraPlace({...cameras[0],bus_stop_id:null,description:null},geometry).includes('61.000000'))
 assert.throws(()=>cameraPlace({...cameras[0],bus_stop_id:null,lat:null,lng:null},geometry),/нет места установки/)
})
test('every Excel sheet has a unique editable table with filters, borders and frozen header, including empty groups',()=>{
 const sheets=registerSheets(stopRegister(geometry,cameras,controllers),cameras,geometry)
 sheets.push({name:'Пустой',rows:[['Место','Событие']]})
 const files=unzipSync(createXlsx(sheets))
 for(let i=1;i<=sheets.length;i++){
  const table=strFromU8(files[`xl/tables/table${i}.xml`]),sheet=strFromU8(files[`xl/worksheets/sheet${i}.xml`])
  assert.ok(table.includes(`displayName="Report${i}"`));assert.ok(table.includes('<autoFilter'));assert.ok(table.includes('showRowStripes="0"'))
  assert.ok(sheet.includes('state="frozen"'));assert.ok(sheet.includes('<tablePart r:id="table"'))
  assert.ok(files[`xl/worksheets/_rels/sheet${i}.xml.rels`])
 }
 const empty=strFromU8(files['xl/tables/table8.xml']);assert.ok(empty.includes('ref="A1:B2"'))
})
test('short cache coalesces concurrent reads, isolates sessions/parameters, expires and retries failures',async()=>{
 const {createRequestCache}=load('lib/request-cache.ts',{'./supabase/client':{createClient:()=>{throw Error('pure test')}}})
 const read=createRequestCache();let calls=0,resolve
 const pending=new Promise(r=>resolve=r),loader=()=>{calls++;return pending}
 const requests=[read('user-a','map',10000,loader),read('user-a','map',10000,loader)]
 await Promise.resolve();assert.equal(calls,1);resolve(42);assert.deepEqual(await Promise.all(requests),[42,42])
 assert.equal(await read('user-a','map',10000,async()=>99),42)
 assert.equal(await read('user-b','map',10000,async()=>99),99)
 assert.equal(await read('user-a','other-period',10000,async()=>7),7)
 await assert.rejects(read('user-a','failed',10000,async()=>{throw Error('offline')}))
 assert.equal(await read('user-a','failed',10000,async()=>8),8)
 await read('user-a','expire',0,async()=>1);assert.equal(await read('user-a','expire',0,async()=>2),2)
})
