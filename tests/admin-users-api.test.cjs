const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')

// profiles.id is a uuid. Postgres matches a uuid column without regard to case or
// hyphenation, so fixtures are canonical and the mock resolves rows the same way.
const SELF_ID = 'a1b2c3d4-1111-4111-8111-111111111111'
const OTHER_ID = 'b1c2d3e4-2222-4222-8222-222222222222'
const ELEVATED_ID = 'c1d2e3f4-3333-4333-8333-333333333333'
const UNKNOWN_ID = 'd1e2f3a4-4444-4444-8444-444444444444'
const CREATED_ID = 'e1f2a3b4-5555-4555-8555-555555555555'
const canonical = value => String(value).replace(/[{}-]/g, '').toLowerCase()

// Состав лицензии, выданной инстансу под тестом. Полный каталог платформы — по
// умолчанию; стенд заказчика лицензирован на подмножество ('stops'), и именно это
// сужение проверяют кейсы ниже.
const FULL_LICENSE = ['stops', 'roads', 'shore', 'transport', 'parks', 'asr']

// Exercise the real route, shared server client and cookie-option helper; only
// framework boundaries and Supabase's network/database transport are mocked.
function route({ authenticated = true, role = 'admin', authError = null, profileError = null, target = null, targetId = OTHER_ID, targetError = null, elevatedCount = 2, deleteError = null, license = FULL_LICENSE, demoModules = '' } = {}) {
    const calls = { getUser: 0, profileIds: [], lists: 0, bodies: 0, writes: 0 }
    const deletes = []
    const writes = []
    const accounts = []
    const env = {
        SUPABASE_INTERNAL_URL: 'http://vector125-supabase:8000',
        NEXT_PUBLIC_SUPABASE_COOKIE_NAME: 'sb-vector125-auth-token',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service',
        LICENSE_DEMO_MODULES: demoModules,
    }
    const cookies = authenticated ? [{ name: env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME, value: 'test-session' }] : []
    // A uuid column matches the same value in any encoding; a missing row is null
    // for maybeSingle() and a PGRST116 error for single().
    const resolve = value => {
        if (canonical(value) === canonical(SELF_ID)) {
            return { data: role === null ? null : { id: SELF_ID, role }, error: profileError }
        }
        return { data: target ? { id: value, ...target } : null, error: targetError }
    }
    const service = { from(table) {
        assert.equal(table, 'profiles')
        let lastId = null
        const query = {
            select() { return query },
            eq(key, value) {
                if (key === 'id') { lastId = value; calls.profileIds.push(value) }
                else if (key !== 'role') throw new Error(`Unexpected filter: ${key}`)
                return query
            },
            async maybeSingle() { return resolve(lastId) },
            async single() {
                return resolve(lastId) || {
                    data: null,
                    error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
                }
            },
            async order() { calls.lists++; return { data: [{ id: SELF_ID, email: 'admin@example.test', role: 'admin' }], error: null } },
            update(patch) { calls.writes++; writes.push(patch); return query },
            delete() { calls.writes++; throw new Error('Unexpected profile delete') },
            then(resolve) { resolve({ count: elevatedCount, data: null, error: null }) },
        }
        return query
    }, auth: { admin: {
        async deleteUser(id) { deletes.push(id); return { data: deleteError ? null : { user: { id } }, error: deleteError } },
        async createUser(payload) { accounts.push(payload); return { data: { user: { id: CREATED_ID } }, error: null } },
    } } }
    const mocks = {
        // Лицензия читается из файла на диске; в тесте она задаётся составом модулей.
        '@/lib/license': { getActiveLicense: () => license === null ? null : {
            license_id: 'TEST-2026-001', customer: 'Тестовый заказчик', hardware_id: null,
            issued_at: '2026-01-01', expires_at: '2030-01-01', modules: license, max_cameras: 30,
        } },
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
                    return { data: { user: hasSession ? { id: SELF_ID } : null }, error: authError }
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
        ...load('app/api/admin/users/route.ts'), calls, deletes, writes, accounts,
        payloadRequest: (payload) => ({ url: 'http://localhost/api/admin/users', async json() { calls.bodies++; return payload } }),
        request: { async json() { calls.bodies++; throw new Error('Stopped after authorization; no write requested') } },
        writeRequest: (id) => ({ url: 'http://localhost/api/admin/users', async json() { calls.bodies++; return { id } } }),
        queryRequest: (id) => ({ url: `http://localhost/api/admin/users?id=${encodeURIComponent(id)}`, async json() { calls.bodies++; throw new Error('No request body') } }),
    }
}

test('GET accepts a server-verified admin session stored under the configured custom cookie name', async () => {
    const api = route()
    const response = await api.GET()
    assert.equal(response.status, 200)
    assert.equal(response.body[0].email, 'admin@example.test')
    assert.equal(api.calls.getUser, 1)
    assert.deepEqual(api.calls.profileIds, [SELF_ID])
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
        assert.deepEqual(api.calls, { getUser: 1, profileIds: [SELF_ID], lists: 0, bodies: 0, writes: 0 })
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
        assert.deepEqual(api.calls, { getUser: 1, profileIds: [SELF_ID], lists: 0, bodies: 1, writes: 0 })
    })
}

test('DELETE rejects anonymous requests with 401 before parsing a target id', async () => {
    const api = route({ authenticated: false })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 401)
    assert.deepEqual(api.calls, { getUser: 1, profileIds: [], lists: 0, bodies: 0, writes: 0 })
    assert.deepEqual(api.deletes, [])
})

test('DELETE forbids a verified non-admin before parsing a target id', async () => {
    const api = route({ role: 'user' })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 403)
    assert.deepEqual(api.calls, { getUser: 1, profileIds: [SELF_ID], lists: 0, bodies: 0, writes: 0 })
    assert.deepEqual(api.deletes, [])
})

test('DELETE preserves the missing-session 401 classification', async () => {
    const api = route({ authenticated: false, authError: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 } })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 401)
    assert.deepEqual(api.deletes, [])
})

test('DELETE requires a target id and answers 400 in Russian without deleting', async () => {
    const api = route()
    const response = await api.DELETE(api.writeRequest(undefined))
    assert.equal(response.status, 400)
    assert.match(response.body.error, /идентификатор/)
    assert.deepEqual(api.deletes, [])
    assert.equal(api.calls.writes, 0)
})

test('DELETE refuses to delete the signed-in admin own account before touching any profile', async () => {
    const api = route()
    const response = await api.DELETE(api.writeRequest(SELF_ID))
    assert.equal(response.status, 403)
    assert.deepEqual(api.calls.profileIds, [SELF_ID])
    assert.deepEqual(api.deletes, [])
    assert.equal(api.calls.writes, 0)
})

test('DELETE refuses to delete the last remaining administrator', async () => {
    const api = route({ target: { role: 'admin' }, targetId: ELEVATED_ID, elevatedCount: 1 })
    const response = await api.DELETE(api.writeRequest(ELEVATED_ID))
    assert.equal(response.status, 409)
    assert.deepEqual(api.deletes, [])
    assert.equal(api.calls.writes, 0)
})

test('DELETE answers 404 for an unknown target without deleting', async () => {
    const api = route({ target: null, targetId: UNKNOWN_ID })
    const response = await api.DELETE(api.writeRequest(UNKNOWN_ID))
    assert.equal(response.status, 404)
    assert.deepEqual(api.deletes, [])
    assert.equal(api.calls.writes, 0)
})

test('DELETE removes another user exactly once, without listing users or writing profiles', async () => {
    const api = route({ target: { role: 'user' }, targetId: OTHER_ID, elevatedCount: 2 })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 200)
    assert.deepEqual(api.deletes, [OTHER_ID])
    assert.equal(api.calls.lists, 0)
    assert.equal(api.calls.writes, 0)
})

test('DELETE accepts the target id from a query parameter', async () => {
    const api = route({ target: { role: 'user' }, targetId: OTHER_ID, elevatedCount: 2 })
    const response = await api.DELETE(api.queryRequest(OTHER_ID))
    assert.equal(response.status, 200)
    assert.deepEqual(api.deletes, [OTHER_ID])
})

test('DELETE reports a profile lookup outage as a server error without deleting', async () => {
    const api = route({ profileError: { message: 'Profiles unavailable', code: '42P01' } })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 500)
    assert.equal(response.body.error, 'Profiles unavailable')
    assert.deepEqual(api.deletes, [])
})

test('DELETE maps an auth deletion failure carrying a client status to 400', async () => {
    const api = route({ target: { role: 'user' }, targetId: OTHER_ID, elevatedCount: 2, deleteError: { message: 'User not found', status: 404 } })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 400)
    assert.equal(response.body.error, 'User not found')
    assert.deepEqual(api.deletes, [OTHER_ID])
})

test('DELETE reports an auth deletion failure without a client status as a server error', async () => {
    const api = route({ target: { role: 'user' }, targetId: OTHER_ID, elevatedCount: 2, deleteError: { message: 'Auth unavailable' } })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 500)
    assert.equal(response.body.error, 'Auth unavailable')
    assert.deepEqual(api.deletes, [OTHER_ID])
})

test('DELETE rejects a target id that is not a uuid without deleting', async () => {
    const api = route({ target: { role: 'user' }, elevatedCount: 2 })
    const response = await api.DELETE(api.writeRequest('not-a-uuid'))
    assert.equal(response.status, 400)
    assert.equal(response.body.error, 'Некорректный идентификатор пользователя')
    assert.deepEqual(api.deletes, [])
    assert.equal(api.calls.writes, 0)
})

test('DELETE refuses the signed-in account even when the same uuid is sent in a different case', async () => {
    const api = route()
    const response = await api.DELETE(api.writeRequest(SELF_ID.toUpperCase()))
    assert.equal(response.status, 403)
    assert.equal(response.body.error, 'Нельзя удалить собственную учётную запись')
    assert.deepEqual(api.deletes, [])
    assert.equal(api.calls.writes, 0)
})

test('DELETE reports a target-profile lookup outage as a server error without deleting', async () => {
    const api = route({ target: null, targetError: { message: 'Target lookup unavailable', code: '42P01' } })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 500)
    assert.equal(response.body.error, 'Target lookup unavailable')
    assert.deepEqual(api.deletes, [])
})

test('DELETE refuses the signed-in account when the stored profile row is the caller under any encoding', async () => {
    // Defence in depth: the guard compares the row actually returned by the
    // database, so relaxing the request-id canonicalisation cannot drop it.
    const api = route({ target: { id: SELF_ID.toUpperCase(), role: 'user' }, elevatedCount: 2 })
    const response = await api.DELETE(api.writeRequest(OTHER_ID))
    assert.equal(response.status, 403)
    assert.equal(response.body.error, 'Нельзя удалить собственную учётную запись')
    assert.deepEqual(api.deletes, [])
    assert.equal(api.calls.writes, 0)
})

// --- Выдача доступов сверяется с лицензией ---------------------------------
//
// Заказчик покупает модули, а не «всё, что видно в интерфейсе». Модуль вне
// лицензии не работает: воркеры бэкенда не проходят require_module(...), а
// раздел оператору не виден. Поэтому админка обязана сверяться с лицензией, и
// сверка стоит на сервере: интерфейс обходится запросом, API — нет.

const CUSTOMER_LICENSE = ['stops']

test('POST rejects a module outside the license before creating the account', async () => {
    const api = route({ license: CUSTOMER_LICENSE })
    const response = await api.POST(api.payloadRequest({
        email: 'new@example.test', password: 'secret1', modules: ['stops', 'roads'], role: 'user',
    }))
    assert.equal(response.status, 403)
    assert.match(response.body.error, /В лицензию не входит: Состояние дорог/)
    assert.deepEqual(response.body.modules_outside_license, ['roads'])
    assert.deepEqual(response.body.modules_licensed, ['stops'])
    assert.deepEqual(api.accounts, [])
    assert.equal(api.calls.writes, 0)
})

test('PUT rejects a module outside the license without touching the profile', async () => {
    const api = route({ license: CUSTOMER_LICENSE })
    const response = await api.PUT(api.payloadRequest({ id: OTHER_ID, modules: ['roads'], role: 'user' }))
    assert.equal(response.status, 403)
    assert.match(response.body.error, /Состояние дорог/)
    assert.deepEqual(api.writes, [])
})

test('a module the platform does not sell is a bad request, not a licence refusal', async () => {
    // Разные причины — разные ответы: «не куплено» это разговор о допродаже,
    // «неизвестный модуль» — ошибка в запросе.
    const api = route({ license: CUSTOMER_LICENSE })
    const response = await api.POST(api.payloadRequest({
        email: 'new@example.test', password: 'secret1', modules: ['smoking'], role: 'user',
    }))
    assert.equal(response.status, 400)
    assert.match(response.body.error, /Неизвестный модуль: Курение/)
    assert.deepEqual(api.accounts, [])
})

test('POST refuses to hand out anything when there is no valid license', async () => {
    const api = route({ license: null })
    const response = await api.POST(api.payloadRequest({
        email: 'new@example.test', password: 'secret1', modules: [], role: 'user',
    }))
    assert.equal(response.status, 403)
    assert.match(response.body.error, /Лицензия недействительна/)
    assert.deepEqual(api.accounts, [])
})

test('POST admits a licensed module and writes exactly the licensed set', async () => {
    const api = route({ license: CUSTOMER_LICENSE })
    const response = await api.POST(api.payloadRequest({
        email: 'new@example.test', password: 'secret1', modules: ['stops'], role: 'user',
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(api.writes, [{ role: 'user', modules: ['stops'] }])
})

test('PUT writes the licensed set the administrator sent', async () => {
    const api = route({ license: CUSTOMER_LICENSE })
    const response = await api.PUT(api.payloadRequest({ id: OTHER_ID, modules: ['stops'], role: 'admin' }))
    assert.equal(response.status, 200)
    assert.deepEqual(api.writes, [{ modules: ['stops'], role: 'admin' }])
})

test('POST without a modules field still creates the account with an empty set', async () => {
    const api = route({ license: CUSTOMER_LICENSE })
    const response = await api.POST(api.payloadRequest({ email: 'new@example.test', password: 'secret1', role: 'user' }))
    assert.equal(response.status, 200)
    assert.deepEqual(api.writes, [{ role: 'user', modules: [] }])
})

test('demo modules are assignable because /api/license reports them too', async () => {
    // LICENSE_DEMO_MODULES расширяет состав лицензии и на витрине, и здесь: иначе
    // админка предлагала бы модуль, который сервер отказывается выдать.
    const api = route({ license: CUSTOMER_LICENSE, demoModules: 'roads, parks' })
    const response = await api.POST(api.payloadRequest({
        email: 'new@example.test', password: 'secret1', modules: ['stops', 'roads', 'parks'], role: 'user',
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(api.writes[0].modules, ['stops', 'roads', 'parks'])
})
