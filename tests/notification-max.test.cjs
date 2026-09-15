const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { X509Certificate } = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, cache = {}) {
  file = path.resolve(root, file)
  if (cache[file]) return cache[file].exports
  const module = { exports: {} }; cache[file] = module
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'server-only') return {}
    if (id in mocks) return mocks[id]
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts', mocks, cache)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), mocks, cache)
    return require(id)
  }, module, module.exports)
  return module.exports
}

test('notification buttons serialize Russian domains as ASCII HTTP URLs', () => {
  const previous = process.env.APP_BASE_URL
  const { getEventLink } = load('lib/notifications/render.ts')
  try {
    process.env.APP_BASE_URL = 'https://векторгорода.рф/'
    assert.equal(getEventLink({ source: 'controller_alerts', event_id: 'test' }),
      'https://xn--80added4a2abarct.xn--p1ai/notifications')
    assert.equal(getEventLink({ source: 'alerts', event_id: 'a&b' }),
      'https://xn--80added4a2abarct.xn--p1ai/notifications?alertId=a%26b')
    for (const invalid of ['', 'not a URL', 'javascript:alert(1)']) {
      process.env.APP_BASE_URL = invalid
      assert.equal(getEventLink({ source: 'alerts', event_id: 'test' }), null)
    }
  } finally {
    if (previous === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = previous
  }
})

test('MAX transport keeps CA and hostname validation scoped, sends JSON, preserves retry headers', async () => {
  let options, payload, agentOptions
  const transport = load('lib/notifications/max-http.ts', {
    'node:https': {
      Agent: class { constructor(value) { agentOptions = value } },
      request(value, callback) {
        options = value
        const req = new EventEmitter()
        req.end = body => {
          payload = JSON.parse(body)
          const res = new EventEmitter()
          res.statusCode = 429; res.headers = { 'retry-after': '120' }
          callback(res)
          res.emit('data', Buffer.from('{"error":"rate limited"}'))
          res.emit('end')
        }
        return req
      },
    },
  })
  const response = await transport.requestMax('/messages?user_id=123', 'test-token', { text: 'Событие' })
  assert.equal(options.hostname, 'platform-api2.max.ru')
  assert.equal(options.method, 'POST')
  assert.equal(options.headers.Authorization, 'test-token')
  assert.equal(options.rejectUnauthorized, undefined)
  assert.equal(agentOptions.rejectUnauthorized, undefined)
  assert.ok(options.signal instanceof AbortSignal)
  assert.deepEqual(payload, { text: 'Событие' })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '120')
  assert.equal((await response.json()).error, 'rate limited')
  const cert = new X509Certificate(agentOptions.ca.at(-1))
  assert.equal(cert.fingerprint256, 'D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31')
})

test('MAX retries network/429/503 failures, disables blocked recipients, and accepts successful sends', async () => {
  const previous = process.env.MAX_BOT_TOKEN
  process.env.MAX_BOT_TOKEN = 'test-token'
  try {
    let result = new Response('{}', { status: 200 })
    const api = load('lib/notifications/max.ts', {
      '@/lib/notifications/render': {},
      '@/lib/notifications/max-http': { requestMax: async () => {
        if (result instanceof Error) throw result
        return result
      } },
    })
    await api.sendMaxMessage('123', 'Новое событие')
    for (const status of [429, 503, 403, 400]) {
      result = new Response('failed', { status, headers: { 'retry-after': '120' } })
      await assert.rejects(api.sendMaxMessage('123', 'Событие'), error => {
        assert.equal(error.transient, status === 429 || status === 503)
        if (status === 429) assert.equal(error.retryAfterSeconds, 120)
        if (status === 403) assert.equal(error.disableRecipient, true)
        return true
      })
    }
    result = new Error('TLS connection failed')
    await assert.rejects(api.sendMaxMessage('123', 'Событие'), error => error.transient === true)
  } finally {
    if (previous === undefined) delete process.env.MAX_BOT_TOKEN
    else process.env.MAX_BOT_TOKEN = previous
  }
})
