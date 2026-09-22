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


test('notification pages reuse requests and fetch one lookahead row without counting the entire feed',async()=>{
 const before=global.window;global.window={}
 try{
  for(const [file,fn] of [['alerts','fetchAlerts'],['controller-alerts','fetchControllerAlerts']]){
   const calls=[];let reads=0,token='user-a'
   const data=Array.from({length:26},(_,id)=>({id:String(id)}))
   const query=new Proxy({}, {get(_,key){if(key==='then')return resolve=>{reads++;resolve({data,count:null,error:null})};return(...args)=>{calls.push([key,...args]);return query}}})
   const mod=load('lib/api/'+file+'.ts',{'../supabase':{supabase:{from:()=>query}},'./supabase/client':{createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}})}})
   const options={limit:25,offset:0,countExact:false}
   const [a,b]=await Promise.all([mod[fn](options),mod[fn](options)])
   assert.equal(reads,1);assert.equal(a.alerts.length,25);assert.equal(a.hasMore,true);assert.deepEqual(a,b)
   assert.ok(calls.some(c=>c[0]==='range'&&c[1]===0&&c[2]===25))
   assert.ok(calls.some(c=>c[0]==='select'&&!c[2].count))
   await mod[fn]({...options,offset:25});assert.equal(reads,2)
   token='user-b';await mod[fn](options);assert.equal(reads,3)
  }
 }finally{global.window=before}
})
test('white workbook uses thin borders on normal, header and wrapped cells without stripes',()=>{
 const {createXlsx}=load('lib/exports/xlsx.ts'),{unzipSync,strFromU8}=require('fflate')
 const files=unzipSync(createXlsx([{name:'Сводка',rows:[['Место','Количество'],['Тест',3]],wrapColumns:[0]}]))
 const styles=strFromU8(files['xl/styles.xml']);assert.match(styles,/<left style="thin">/);assert.match(styles,/<bottom style="thin">/)
 assert.equal((styles.match(/applyBorder="1"/g)||[]).length,3)
 assert.match(styles,/FFFFFFFF/);assert.match(strFromU8(files['xl/tables/table1.xml']),/showRowStripes="0"/)
})
