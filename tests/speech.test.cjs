const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.resolve(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  return module.exports
}
const salute = load('lib/speech/salute.ts')
const { downsampleToPcm16 } = load('lib/speech/recorder.ts')

test('answers are spoken without markdown, tables become one sentence', () => {
  const text = salute.speakableText('## Сводка\n**Не в сети:** 2 камеры.\n\n| Остановка | Минут |\n|---|---|\n| Никольский | 90 |\n\n- [Карта](/x) открыта\n1. `ok`')
  assert.equal(text, 'Сводка\nНе в сети: 2 камеры.\nПодробности в таблице на экране.\nКарта открыта\nok')
})

test('microphone audio is resampled to 16 kHz little-endian PCM', () => {
  const second48k = new Float32Array(48000).fill(0.5)
  const pcm = new DataView(downsampleToPcm16([second48k.subarray(0, 24000), second48k.subarray(24000)], 48000))
  assert.equal(pcm.byteLength, 16000 * 2)
  assert.equal(pcm.getInt16(0, true), Math.trunc(0.5 * 0x7fff))
  const clipped = new DataView(downsampleToPcm16([new Float32Array([-2, -2, -2])], 48000))
  assert.equal(clipped.getInt16(0, true), -0x8000)
})

test('one token serves concurrent calls; recognition and synthesis send the documented formats', async () => {
  process.env.SALUTE_SPEECH_AUTH_KEY = 'basic-key'
  delete process.env.SALUTE_SPEECH_SCOPE
  const calls = []
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/oauth')) return new Response(JSON.stringify({ access_token: 'tok', expires_at: Date.now() + 1800_000 }), { status: 200 })
    if (String(url).includes('speech:recognize')) return new Response(JSON.stringify({ result: ['какие камеры ', 'не в сети'], status: 200 }), { status: 200 })
    return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200 })
  }
  const [a, b] = await Promise.all([salute.recognizeSpeech(new ArrayBuffer(3200)), salute.recognizeSpeech(new ArrayBuffer(3200))])
  assert.equal(a, 'какие камеры не в сети'); assert.equal(b, a)
  const oauth = calls.filter(c => c.url.includes('/oauth'))
  assert.equal(oauth.length, 1)
  assert.equal(oauth[0].init.headers.Authorization, 'Basic basic-key')
  assert.match(oauth[0].init.headers.RqUID, /^[0-9a-f-]{36}$/)
  assert.equal(String(oauth[0].init.body), 'scope=SALUTE_SPEECH_B2B')
  const recognize = calls.find(c => c.url.includes('speech:recognize'))
  assert.equal(recognize.init.headers['Content-Type'], 'audio/x-pcm;bit=16;rate=16000')
  assert.match(recognize.url, /language=ru-RU/); assert.match(recognize.url, /sample_rate=16000/)
  assert.equal(recognize.init.headers.Authorization, 'Bearer tok')
  const audio = await salute.synthesizeSpeech('Две камеры не в сети.')
  assert.equal(audio.byteLength, 4)
  const synth = calls.find(c => c.url.includes('text:synthesize'))
  assert.match(synth.url, /format=wav16/); assert.match(synth.url, /voice=May_24000/)
  assert.equal(synth.init.headers['Content-Type'], 'application/text')
  assert.equal(calls.filter(c => c.url.includes('/oauth')).length, 1)
})

test('limits and upstream failures become clear errors', async () => {
  await assert.rejects(salute.recognizeSpeech(new ArrayBuffer(salute.MAX_AUDIO_BYTES + 1)), e => e.status === 413)
  assert.equal(await salute.recognizeSpeech(new ArrayBuffer(0)), '')
  await assert.rejects(salute.synthesizeSpeech('   '), e => e.status === 400)
  global.fetch = async () => new Response('nope', { status: 500 })
  await assert.rejects(salute.synthesizeSpeech('текст'), /не озвучил/)
})
