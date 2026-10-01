const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, mocks = {}) {
  const absolute = path.resolve(__dirname, '..', file)
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id in mocks) return mocks[id]
    if (id.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(absolute), id + '.ts')), mocks)
    return require(id)
  }, module, module.exports)
  return module.exports
}
const userId = '11111111-1111-1111-1111-111111111111'
const customerId = '22222222-2222-2222-2222-222222222222'
const { parseCustomerBindings, licenseStatus } = load('lib/licenses/types.ts')

test('explicit customer binding rejects malformed IDs and unsafe shapes', () => {
  assert.deepEqual(parseCustomerBindings(undefined), {})
  assert.deepEqual(parseCustomerBindings(JSON.stringify({ [userId]: customerId })), { [userId]: customerId })
  for (const input of ['null', '[]', '{"__proto__":"x"}', JSON.stringify({ [userId]: 'not-a-uuid' })]) assert.throws(() => parseCustomerBindings(input))
})
test('expiry does not overwrite revoked status and expires at the boundary', () => {
  const deadline = '2026-10-01T00:00:00Z'
  assert.equal(licenseStatus('active', deadline, Date.parse(deadline)), 'expired')
  assert.equal(licenseStatus('revoked', deadline, Date.parse(deadline)), 'revoked')
  assert.equal(licenseStatus('active', null), 'active')
})
function route(file, user, role, reader) {
  return load(file, {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }) }) },
    '@/lib/licenses/server': { readCustomerLicenses: reader },
  })
}
test('anonymous and non-admin callers cannot read customer list', async () => {
  let reads = 0
  const reader = async () => { reads++; return {} }
  assert.equal((await route('app/api/admin/licenses/route.ts', null, 'admin', reader).GET()).status, 401)
  assert.equal((await route('app/api/admin/licenses/route.ts', { id: userId }, 'user', reader).GET()).status, 403)
  assert.equal(reads, 0)
  const allowed = await route('app/api/admin/licenses/route.ts', { id: userId }, 'admin', reader).GET()
  assert.equal(allowed.status, 200)
  assert.equal(allowed.headers['Cache-Control'], 'private, no-store')
})
test('user endpoint derives owner from verified session and hides backend errors', async () => {
  let owner
  const response = await route('app/api/settings/licenses/route.ts', { id: userId }, 'user', async id => { owner = id; return { licenses: [] } }).GET(new Request('http://localhost?userId=someone-else'))
  assert.equal(owner, userId)
  assert.equal(response.status, 200)
  const failure = await route('app/api/settings/licenses/route.ts', { id: userId }, 'user', async () => { throw Error('secret-key') }).GET()
  assert.equal(failure.status, 503)
  assert.ok(!JSON.stringify(failure).includes('secret-key'))
})
test('unbound user never queries License DB', async () => {
  const old = process.env.LICENSE_USER_CUSTOMERS
  process.env.LICENSE_USER_CUSTOMERS = '{}'
  try {
    const server = load('lib/licenses/server.ts', { 'server-only': {}, '@supabase/supabase-js': { createClient: () => { throw Error('Unexpected DB access') } }, '@/lib/notifications/admin': {} })
    assert.deepEqual(await server.readCustomerLicenses(userId), { licenses: [], moduleLabels: {}, linked: false })
  } finally { if (old === undefined) delete process.env.LICENSE_USER_CUSTOMERS; else process.env.LICENSE_USER_CUSTOMERS = old }
})
test('customer filter and paginated read exclude signing credentials', async () => {
  const previous = { bindings: process.env.LICENSE_USER_CUSTOMERS, url: process.env.LICENSE_DB_URL, key: process.env.LICENSE_DB_SERVICE_ROLE_KEY }
  Object.assign(process.env, { LICENSE_USER_CUSTOMERS: JSON.stringify({ [userId]: customerId }), LICENSE_DB_URL: 'http://db', LICENSE_DB_SERVICE_ROLE_KEY: 'test' })
  const ranges = []; const filters = []
  try {
    const server = load('lib/licenses/server.ts', { 'server-only': {}, '@/lib/notifications/admin': {}, '@supabase/supabase-js': { createClient: () => ({ from: table => ({ select: selection => {
      assert.ok(!selection.includes('credential'))
      if (table === 'license_modules') return Promise.resolve({ data: [{ key: 'bin_fullness', label: 'Наполнение' }], error: null })
      let offset
      const query = { order: () => query, range: start => { offset = start; ranges.push(start); return query }, eq: (field, value) => { filters.push([field,value]); return query }, then: resolve => resolve({ error: null, count: 201, data: Array.from({ length: offset === 0 ? 200 : 1 }, (_, i) => ({ id: String(offset+i), license_id: String(offset+i), customer_id: customerId, customers: { name: 'Customer' }, modules: ['bin_fullness'], status: 'active', expires_at: '2099-01-01' })) }) }
      return query
    } }) }) } })
    const result = await server.readCustomerLicenses(userId)
    assert.equal(result.licenses.length, 201)
    assert.deepEqual(ranges, [0,200])
    assert.ok(filters.every(([field,id]) => field === 'customer_id' && id === customerId))
    assert.equal(result.moduleLabels.bin_fullness, 'Наполнение')
    assert.ok(!JSON.stringify(result).includes('credential'))
  } finally {
    for (const [name, value] of Object.entries({ LICENSE_USER_CUSTOMERS: previous.bindings, LICENSE_DB_URL: previous.url, LICENSE_DB_SERVICE_ROLE_KEY: previous.key })) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  }
})

const licenseId = '33333333-3333-3333-3333-333333333333'
const { russianModuleLabel, russianCameraName, parseResourceScopes } = load('lib/licenses/resources.ts')
test('all known license modules and camera fallback names are Russian', () => {
  for (const key of ['roads','stops','parks','shore','transport','asr','smoking','lying_person','bin_fullness','dogs_without_people','abandoned_object','busyness','stage2_verification','unknown']) {
    assert.match(russianModuleLabel(key, { [key]: 'English label' }), /[А-Яа-яЁё]/)
  }
  assert.equal(russianModuleLabel('custom', { custom: 'Особый модуль' }), 'Особый модуль')
  assert.equal(russianCameraName('Camera #15', 15, 3), 'Камера №15')
  assert.equal(russianCameraName('Вход', 15, 3), 'Вход')
})
test('resource scopes reject implicit cities, malformed IDs and duplicate stops', () => {
  assert.deepEqual(parseResourceScopes(undefined), {})
  const input = { [licenseId]: { city: 'surgut', stopIds: [42,162] } }
  assert.deepEqual(parseResourceScopes(JSON.stringify(input)), input)
  for (const scope of [null, { city: 'guess', stopIds: [42] }, { city: 'surgut', stopIds: [42,42] }, { city: 'surgut', stopIds: [-1] }, { city: 'surgut', stopIds: ['42'] }]) {
    assert.throws(() => parseResourceScopes(JSON.stringify({ [licenseId]: scope })))
  }
})
function detailRoute(file, user, role, reader) {
  return load(file, {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }) }) },
    '@/lib/licenses/server': { readLicenseDetail: reader },
  })
}
test('detail endpoints reject anonymous and non-admin callers, bind owner and mask errors', async () => {
  const context = { params: Promise.resolve({ id: licenseId }) }, request = new Request('http://localhost?userId=other')
  let reads = 0
  const reader = async () => { reads++; return {} }
  assert.equal((await detailRoute('app/api/admin/licenses/[id]/route.ts', null, 'admin', reader).GET(request, context)).status, 401)
  assert.equal((await detailRoute('app/api/admin/licenses/[id]/route.ts', { id: userId }, 'user', reader).GET(request, context)).status, 403)
  assert.equal((await detailRoute('app/api/settings/licenses/[id]/route.ts', null, 'user', reader).GET(request, context)).status, 401)
  assert.equal(reads, 0)
  const owned = await detailRoute('app/api/settings/licenses/[id]/route.ts', { id: userId }, 'user', async (...args) => { assert.deepEqual(args, [licenseId,userId]); return {} }).GET(request, context)
  assert.equal(owned.status, 200)
  assert.equal(owned.headers['Cache-Control'], 'private, no-store')
  assert.equal((await detailRoute('app/api/settings/licenses/[id]/route.ts', { id: userId }, 'user', async () => null).GET(request, context)).status, 404)
  const failure = await detailRoute('app/api/admin/licenses/[id]/route.ts', { id: userId }, 'admin', async () => { throw Error('secret') }).GET(request, context)
  assert.equal(failure.status, 503); assert.ok(!JSON.stringify(failure).includes('secret'))
})
test('detail reads only explicit stops, paginates cameras, keeps every camera and excludes stream credentials', async () => {
  const keys = ['LICENSE_USER_CUSTOMERS','LICENSE_DB_URL','LICENSE_DB_SERVICE_ROLE_KEY','LICENSE_RESOURCE_SCOPES']
  const previous = keys.map(key => process.env[key])
  Object.assign(process.env, { LICENSE_USER_CUSTOMERS: JSON.stringify({ [userId]: customerId }), LICENSE_DB_URL: 'http://db', LICENSE_DB_SERVICE_ROLE_KEY: 'test', LICENSE_RESOURCE_SCOPES: JSON.stringify({ [licenseId]: { city: 'surgut', stopIds: [42,162] } }) })
  const selections = [], ranges = [], filters = []; let inventoryReads = 0
  const license = { id: licenseId, license_id: 'SRG', customer_id: customerId, customers: { name: 'Сургут' }, modules: ['stops'], max_cameras: 30, status: 'active', expires_at: null }
  try {
    const server = load('lib/licenses/server.ts', { 'server-only': {}, '@supabase/supabase-js': { createClient: () => ({ from: table => ({ select: () => {
      if(table === 'license_modules') return Promise.resolve({ data: [], error: null })
      const q = { order: () => q, range: () => q, eq: (field,value) => { assert.equal(field,'customer_id'); assert.equal(value,customerId); return q }, then: resolve => resolve({ data: [license], count: 1 }) }; return q
    } }) }) }, '@/lib/notifications/admin': { createNotificationAdminClient: () => { inventoryReads++; return { from: table => ({ select: selection => {
      selections.push(selection); let offset=0
      const q = { in: (field,ids) => { filters.push([table,field,ids]); return q }, order: () => q, range: start => { offset=start;ranges.push(start);return q }, then: resolve => resolve(table === 'bus_stops' ? { data: [{ id:42,name:'Остановка',address:'Улица' },{ id:162,name:'Без камер',address:null }] } : { count:201, data: Array.from({length:offset === 0 ? 200 : 1},(_,i)=>({id:offset+i,camera_index:offset+i,name:'Camera',module:'stops',bus_stop_id:42,rtsp_url:'secret',hls_url:'secret'})) }) }; return q
    } }) } } } })
    const result = await server.readLicenseDetail(licenseId,userId)
    assert.equal(result.cameraCount,201)
    assert.deepEqual(ranges,[0,200]); assert.equal(result.stops.length,2)
    assert.ok(filters.every(([,field,ids]) => ['id','bus_stop_id'].includes(field) && JSON.stringify(ids)==='[42,162]'))
    assert.ok(!selections.some(s => /url|credential|ip_address/.test(s)))
    assert.ok(!JSON.stringify(result).includes('secret'))
    const before=inventoryReads
    assert.equal(await server.readLicenseDetail('44444444-4444-4444-4444-444444444444',userId),null)
    assert.equal(inventoryReads,before)
    process.env.LICENSE_RESOURCE_SCOPES='{}'
    const pending=await server.readLicenseDetail(licenseId,userId)
    assert.equal(pending.assigned,false);assert.equal(pending.city,null);assert.deepEqual(pending.stops,[])
    assert.equal(inventoryReads,before)
    const unbound=await server.readLicenseDetail(licenseId,'55555555-5555-5555-5555-555555555555')
    assert.equal(unbound,null);assert.equal(inventoryReads,before)
  } finally { keys.forEach((key,i) => { if(previous[i]===undefined) delete process.env[key]; else process.env[key]=previous[i] }) }
})

const { inventoryModules } = load('lib/licenses/resources.ts')
const { filterLicenses, formatLicenseDate } = load('lib/licenses/presentation.ts')
test('status and customer filters intersect by customer ID, dates omit seconds', () => {
  const rows=[{customer_id:customerId,status:'active'},{customer_id:userId,status:'active'},{customer_id:customerId,status:'expired'}]
  assert.deepEqual(filterLicenses(rows,'active',customerId),[rows[0]])
  assert.equal(filterLicenses(rows,'all','all').length,3)
  assert.equal(filterLicenses(rows,'revoked',customerId).length,0)
  assert.equal(formatLicenseDate('invalid'),null);assert.equal(formatLicenseDate(null),null)
  const formatted=formatLicenseDate('2026-10-01T12:34:56Z');assert.match(formatted.date,/2026/);assert.match(formatted.time,/^\d{2}:\d{2}$/)
})
test('inventory module mapping is explicit', () => {
  assert.deepEqual(inventoryModules(['smoking','lying_person','stops','roads','unrecognized']),['stops','roads'])
})
test('platform inventory fallback is explicit per customer, keeps every camera and no stream credentials', async () => {
  const env={LICENSE_USER_CUSTOMERS:JSON.stringify({[userId]:customerId}),LICENSE_DB_URL:'http://db',LICENSE_DB_SERVICE_ROLE_KEY:'test',LICENSE_RESOURCE_SCOPES:'{}',LICENSE_PLATFORM_CUSTOMER_ID:customerId};const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env)
  let reads=0
  try {
    const license={id:licenseId,license_id:'SRG',customer_id:customerId,modules:['smoking'],max_cameras:30,customers:{name:'Клиент'},status:'active',expires_at:null}
    const server=load('lib/licenses/server.ts',{'server-only':{},'@supabase/supabase-js':{createClient:()=>({from:table=>({select:()=>{
      if(table==='license_modules')return Promise.resolve({data:[]})
      const q={order:()=>q,range:()=>q,eq:()=>q,then:r=>r({data:[license],count:1})};return q
    }})})},'@/lib/notifications/admin':{createNotificationAdminClient:()=>{reads++;return {from:table=>({select:selection=>{
      assert.ok(!/url|credential|ip_address/.test(selection))
      const q={in:(field,ids)=>{if(table==='cameras'){assert.equal(field,'module');assert.deepEqual(ids,['stops'])}else assert.deepEqual(ids,[42]);return q},order:()=>q,range:()=>q,then:r=>r(table==='cameras'?{count:31,data:Array.from({length:31},(_,i)=>({id:i+1,camera_index:i,name:'Camera',module:'stops',bus_stop_id:i===30?null:42,hls_url:'secret'}))}:{data:[{id:42,name:'Остановка',address:'Адрес'}]})};return q
    }})}}}})
    const detail=await server.readLicenseDetail(licenseId,userId)
    assert.equal(detail.inventorySource,'platform');assert.equal(detail.cameraCount,31);assert.equal(detail.cameras.length,31);assert.equal(detail.license.max_cameras,30)
    assert.equal(detail.cameras[30].stopName,null);assert.equal(detail.stops.length,1);assert.ok(!JSON.stringify(detail).includes('secret'))
    const before=reads;process.env.LICENSE_PLATFORM_CUSTOMER_ID=licenseId
    const unavailable=await server.readLicenseDetail(licenseId,userId);assert.equal(unavailable.inventorySource,'unavailable');assert.equal(reads,before)
    assert.equal(await server.readLicenseDetail(licenseId,'55555555-5555-5555-5555-555555555555'),null);assert.equal(reads,before)
  }finally{for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
})
