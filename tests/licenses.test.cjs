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
