const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')

function route({ ttl = 123, error = null, authenticated = true } = {}) {
    const queries = []
    const admin = { from(table) {
        queries.push(table)
        const q = { select() { return q }, eq() { return q }, is() { return q }, order() { return q }, limit() { return q },
            async maybeSingle() { return { data: ttl === null ? null : { applied: { equipment_stale_sec: ttl } }, error } },
            then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve) } }
        return q
    } }
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/api/stop-activity/route.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', code)((id) => {
        if (id === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ status: 200, body, ...options }) } }
        if (id === '@/lib/notifications/http') return { getAuthenticatedUser: async () => authenticated ? { id: 'test' } : null, jsonError: (message, status) => ({ status, message }) }
        if (id === '@/lib/notifications/admin') return { createNotificationAdminClient: () => admin }
        if (id === '@/lib/supabase/server') return { createClient: async () => admin }
        if (id === '@/lib/api/stop-activity') return { buildStopActivity: () => [] }
        throw new Error(`Unexpected import: ${id}`)
    }, module, module.exports)
    return { GET: module.exports.GET, queries }
}

test('API uses monitor effective TTL with empty settings catalog and no overrides', async () => {
    const { GET, queries } = route()
    const response = await GET()
    assert.equal(response.status, 200)
    assert.equal(response.body.freshnessMs, 123000)
    assert.equal(response.headers['Cache-Control'], 'no-store')
    assert.ok(queries.includes('pipeline_settings_agents'))
    assert.ok(!queries.includes('pipeline_settings_catalog'))
    assert.ok(!queries.includes('pipeline_settings'))
})

test('API never invents TTL when effective monitor config unavailable or invalid', async () => {
    for (const ttl of [null, 0, -1, '90', NaN, Infinity]) {
        assert.equal((await route({ ttl }).GET()).status, 503)
    }
    assert.equal((await route({ error: { message: 'DB unavailable' } }).GET()).status, 503)
})

test('API rejects unauthenticated request before querying configuration', async () => {
    const { GET, queries } = route({ authenticated: false })
    assert.equal((await GET()).status, 401)
    assert.deepEqual(queries, [])
})
