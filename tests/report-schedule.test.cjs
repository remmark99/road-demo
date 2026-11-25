const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file, cache = {}) {
  file = path.resolve(root, file)
  if (cache[file]) return cache[file].exports
  const module = { exports: {} }; cache[file] = module
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => {
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts', cache)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), cache)
    return require(id)
  }, module, module.exports)
  return module.exports
}
const { lastSlot, nextSlot, dueSlot, reportPeriod, parseReportSchedule, describeSchedule, ScheduleInputError, LATE_LIMIT_MS } = load('lib/reports/schedule.ts')
// Время Сургута = UTC+5. 2026-11-25 — среда.
const at = iso => Date.parse(iso)
const monday9 = { frequency: 'weekly', weekday: 1, time: '09:00' }
const daily9 = { frequency: 'daily', time: '09:00', weekday: 1 }

test('weekly slot is the last Monday 09:00 Surgut time', () => {
  // среда 25.11 12:00 по Сургуту → понедельник 23.11 09:00 по Сургуту = 04:00 UTC
  assert.equal(new Date(lastSlot(monday9, at('2026-11-25T07:00:00Z'))).toISOString(), '2026-11-23T04:00:00.000Z')
  // понедельник 08:59 по Сургуту: ещё не время — берётся прошлый понедельник
  assert.equal(new Date(lastSlot(monday9, at('2026-11-23T03:59:00Z'))).toISOString(), '2026-11-16T04:00:00.000Z')
  // понедельник ровно 09:00
  assert.equal(new Date(lastSlot(monday9, at('2026-11-23T04:00:00Z'))).toISOString(), '2026-11-23T04:00:00.000Z')
  assert.equal(new Date(nextSlot(monday9, at('2026-11-25T07:00:00Z'))).toISOString(), '2026-11-30T04:00:00.000Z')
  // воскресенье по Сургуту начинается в субботу 19:00 UTC
  assert.equal(new Date(lastSlot({ frequency: 'weekly', weekday: 7, time: '00:30' }, at('2026-11-28T20:00:00Z'))).toISOString(), '2026-11-28T19:30:00.000Z')
})

test('daily slot rolls back before the send time', () => {
  assert.equal(new Date(lastSlot(daily9, at('2026-11-25T07:00:00Z'))).toISOString(), '2026-11-25T04:00:00.000Z')
  assert.equal(new Date(lastSlot(daily9, at('2026-11-25T03:00:00Z'))).toISOString(), '2026-11-24T04:00:00.000Z')
  assert.equal(new Date(nextSlot(daily9, at('2026-11-25T07:00:00Z'))).toISOString(), '2026-11-26T04:00:00.000Z')
})

test('a slot is due once, and not after a long downtime', () => {
  const slot = at('2026-11-23T04:00:00Z')
  assert.equal(dueSlot(monday9, null, slot + 30_000), slot)
  assert.equal(dueSlot(monday9, at('2026-11-16T04:00:00Z'), slot + 30_000), slot)
  assert.equal(dueSlot(monday9, slot, slot + 30_000), null)
  assert.equal(dueSlot(monday9, null, slot + LATE_LIMIT_MS + 60_000), null)
})

test('period follows the frequency and excludes the sending day', () => {
  assert.deepEqual(reportPeriod('daily', at('2026-11-25T04:00:00Z')), { from: '2026-11-24', to: '2026-11-24' })
  assert.deepEqual(reportPeriod('weekly', at('2026-11-23T04:00:00Z')), { from: '2026-11-16', to: '2026-11-22' })
  // 23:30 UTC — по Сургуту уже следующий день
  assert.deepEqual(reportPeriod('daily', at('2026-11-24T23:30:00Z')), { from: '2026-11-24', to: '2026-11-24' })
})

test('settings from the page are validated', () => {
  const ok = { enabled: true, frequency: 'weekly', weekday: 1, time: '09:00', format: 'pdf', toEmail: true, email: ' Boss@Example.ru ', toMax: false }
  assert.equal(parseReportSchedule(ok).email, 'boss@example.ru')
  assert.equal(describeSchedule(parseReportSchedule(ok)), 'по понедельникам в 09:00')
  assert.equal(describeSchedule({ frequency: 'daily', weekday: 3, time: '18:30' }), 'каждый день в 18:30')
  for (const bad of [{ ...ok, time: '9:00' }, { ...ok, time: '24:00' }, { ...ok, weekday: 8 }, { ...ok, frequency: 'monthly' }, { ...ok, format: 'txt' },
    { ...ok, email: 'not-an-address' }, { ...ok, toEmail: false, toMax: false }, null]) {
    assert.throws(() => parseReportSchedule(bad), ScheduleInputError)
  }
  // выключенную рассылку можно сохранить и без каналов
  assert.equal(parseReportSchedule({ ...ok, enabled: false, toEmail: false, toMax: false }).enabled, false)
})
