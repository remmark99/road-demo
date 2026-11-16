const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')

// Exercise the real route, shared server client and cookie-option helper; only
// framework boundaries and Supabase's network/database transport are mocked.
function route({ authenticated = true, role = 'admin', authError = null, profileError = null } = {}) {
    const calls = { getUser: 0, profileIds: [], lists: 0, bodies: 0, writes: 0 }
    const env = {
        SUPABASE_INTERNAL_URL: 'http://vector125-supabase:8000',
        NEXT_PUBLIC_SUPABASE_COOKIE_NAME: 'sb-vector125-auth-token',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    }
    const cookies = authenticated ? [{ name: env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME, value: 'test-session' }] : []
    const service = { from(table) {
        assert.equal(table, 'profiles')
        const query = {
            select() { return query },
            eq(key, id) { assert.equal(key, 'id'); calls.profileIds.push(id); return query },
            async single() { return { data: role === null ? null : { role }, error: profileError } },
            async order() { calls.lists++; return { data: [{ id: 'verified-user', email: 'admin@example.test', role: 'admin' }], error: null } },
            update() { calls.writes++; throw new Error('Unexpected profile write') },
        }
        return query
    }, auth: { admin: { createUser() { calls.writes++; throw new Error('Unexpected account write') } } } }
    const mocks = {
        'next/server': { NextResponse: { json: (body, options = {}) => ({ status: 200, body, ...options }) } },
        'next/headers': { cookies: async () => ({ getAll: () => cookies, set() {} }) },
        '@supabase/ssr': { createServerClient(url, key, options) {
            assert.equal(url, env.SUPABASE_INTERNAL_URL)
            assert.equal(key, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
            return { auth: {
                async getUser() {
                    calls.getUser++
                    const name = options.cookieOptions?.name || 'sb-vector125-supabase-auth-token'
                    const hasSession = options.cookies.getAll().some(cookie => cookie.name === name)
                    return { data: { user: hasSession ? { id: 'verified-user' } : null }, error: authError }
                },
                getSession() { throw new Error('Must verify identity using getUser') },
            } }
        } },
        '@supabase/supabase-js': { createClient(url, key, options) {
            assert.equal(url, env.SUPABASE_INTERNAL_URL)
            assert.equal(key, env.SUPABASE_SERVICE_ROLE_KEY)
            assert.deepEqual(options.auth, { autoRefreshToken: false, persistSession: false })
            return service
        } },
    }
    function load(file) {
        const module = { exports: {} }
        const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText
        new Function('require', 'module', 'exports', 'process', code)(id => {
            if (id in mocks) return mocks[id]
            if (id.startsWith('@/')) return load(id.slice(2) + '.ts')
            throw new Error(`Unexpected import: ${id}`)
        }, module, module.exports, { env })
        return module.exports
    }
    return {
        ...load('app/api/admin/users/route.ts'), calls,
        request: { async json() { calls.bodies++; throw new Error('Stopped after authorization; no write requested') } },
    }
}

test('GET accepts a server-verified admin session stored under the configured custom cookie name', async () => {
    const api = route()
    const response = await api.GET()
    assert.equal(response.status, 200)
    assert.equal(response.body[0].email, 'admin@example.test')
    assert.equal(api.calls.getUser, 1)
    assert.deepEqual(api.calls.profileIds, ['verified-user'])
    assert.equal(api.calls.lists, 1)
})

for (const method of ['GET', 'POST', 'PUT']) {
    test(`${method} rejects anonymous requests with 401 before reading profiles or request body`, async () => {
        const api = route({ authenticated: false })
        assert.equal((await api[method](api.request)).status, 401)
        assert.deepEqual(api.calls, { getUser: 1, profileIds: [], lists: 0, bodies: 0, writes: 0 })
    })
    test(`${method} forbids a verified non-admin before listing users or processing writes`, async () => {
        const api = route({ role: 'user' })
        assert.equal((await api[method](api.request)).status, 403)
        assert.deepEqual(api.calls, { getUser: 1, profileIds: ['verified-user'], lists: 0, bodies: 0, writes: 0 })
    })
}

for (const method of ['GET', 'POST', 'PUT']) {
    test(`${method} reports profile lookup outages as server errors, not permission denials`, async () => {
        const api = route({ profileError: { message: 'Profiles unavailable', code: '42P01' } })
        const response = await api[method](api.request)
        assert.equal(response.status, 500)
        assert.equal(response.body.error, 'Profiles unavailable')
        assert.equal(api.calls.bodies, 0)
        assert.equal(api.calls.writes, 0)
    })
    test(`${method} reports auth service outages as server errors rather than missing sessions`, async () => {
        const api = route({ authError: { message: 'Auth unavailable', status: 503 } })
        const response = await api[method](api.request)
        assert.equal(response.status, 500)
        assert.equal(response.body.error, 'Auth unavailable')
        assert.deepEqual(api.calls.profileIds, [])
        assert.equal(api.calls.bodies, 0)
    })
}

test('GET rejects a missing session error with 401', async () => {
    const api = route({ authenticated: false, authError: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 } })
    assert.equal((await api.GET()).status, 401)
    assert.deepEqual(api.calls.profileIds, [])
})

test('GET forbids a verified user without an admin profile', async () => {
    const api = route({ role: null })
    assert.equal((await api.GET()).status, 403)
    assert.equal(api.calls.lists, 0)
})

for (const method of ['POST', 'PUT']) {
    test(`${method} admits verified admins through its gate without performing any write`, async () => {
        const api = route()
        const response = await api[method](api.request)
        assert.equal(response.status, 500)
        assert.match(response.body.error, /Stopped after authorization/)
        assert.deepEqual(api.calls, { getUser: 1, profileIds: ['verified-user'], lists: 0, bodies: 1, writes: 0 })
    })
}
