import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { getSupabaseUrl, getSupabaseCookieOptions, localStorageData, sameOriginSupabaseFetch } from '../lib/supabase/endpoint.ts'

const saved = { ...process.env }
const originalFetch = globalThis.fetch
afterEach(() => {
    for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_INTERNAL_URL', 'NEXT_PUBLIC_SUPABASE_SAME_ORIGIN', 'NEXT_PUBLIC_SUPABASE_COOKIE_NAME']) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
    }
    delete globalThis.window
    globalThis.fetch = originalFetch
})

test('existing deployments retain their configured public endpoint', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://existing.example'
    delete process.env.SUPABASE_INTERNAL_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_SAME_ORIGIN
    globalThis.window = { location: { origin: 'https://another.example' } }
    assert.equal(getSupabaseUrl(), 'https://existing.example')
    assert.equal(getSupabaseCookieOptions(), undefined)
})

for (const origin of ['https://192.168.205.125', 'https://217.114.177.10:8445']) {
    test(`browser API follows the actual site origin ${origin}`, () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://192.168.205.125'
        process.env.SUPABASE_INTERNAL_URL = 'http://supabase-replica-kong:8000'
        process.env.NEXT_PUBLIC_SUPABASE_SAME_ORIGIN = 'true'
        globalThis.window = { location: { origin } }
        assert.equal(getSupabaseUrl(), origin)
    })
}

test('SSR uses the internal API and the explicit cookie name', () => {
    process.env.SUPABASE_INTERNAL_URL = 'http://supabase-replica-kong:8000'
    process.env.NEXT_PUBLIC_SUPABASE_SAME_ORIGIN = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME = 'sb-vector125-auth-token'
    assert.equal(getSupabaseUrl(), 'http://supabase-replica-kong:8000')
    assert.deepEqual(getSupabaseCookieOptions(), { name: 'sb-vector125-auth-token' })
})

test('nested local Storage URLs follow the viewer; unrelated URLs are preserved', () => {
    const body = [{ metadata: { image_url: 'https://192.168.205.125/storage/v1/object/public/alerts/a.jpg?x=1' }, other: 'https://other.example/storage/v1/object/public/a.jpg' }]
    assert.deepEqual(localStorageData(body, 'https://217.114.177.10:8445', 'https://192.168.205.125'), [{ metadata: { image_url: 'https://217.114.177.10:8445/storage/v1/object/public/alerts/a.jpg?x=1' }, other: body[0].other }])
    assert.equal(localStorageData('http://supabase-replica-kong:8000/storage/v1/object/public/a.jpg', 'https://192.168.205.125', 'https://192.168.205.125'), 'https://192.168.205.125/storage/v1/object/public/a.jpg')
})

test('Storage normalization preserves pagination headers and HTTP status', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://192.168.205.125'
    globalThis.window = { location: { origin: 'https://217.114.177.10:8445' } }
    globalThis.fetch = async () => new Response(JSON.stringify([{ image: 'https://192.168.205.125/storage/v1/object/public/a.jpg' }]), { status: 206, headers: { 'content-type': 'application/json', 'content-range': '0-0/42', 'content-length': '123' } })
    const response = await sameOriginSupabaseFetch('https://217.114.177.10:8445/rest/v1/alerts')
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-range'), '0-0/42')
    assert.equal(response.headers.has('content-length'), false)
    assert.deepEqual(await response.json(), [{ image: 'https://217.114.177.10:8445/storage/v1/object/public/a.jpg' }])
})
