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
const history = load('lib/assistant/conversations.ts')
const user = text => ({ id: 'u' + text.length, role: 'user', parts: [{ type: 'text', text }] })
const answer = {
  id: 'a1', role: 'assistant', parts: [
    { type: 'step-start' },
    { type: 'tool-system_overview', toolCallId: 'c1', state: 'output-available', input: { x: 1 }, output: { big: 'x'.repeat(50000) } },
    { type: 'tool-get_stop', toolCallId: 'c2', state: 'output-error', input: {}, errorText: 'boom' },
    { type: 'text', text: 'Сейчас всё в норме.' },
    { type: 'reasoning', text: 'думаю' },
  ],
}

test('stored messages keep text and tool steps but drop tool inputs, outputs and reasoning', () => {
  const stored = history.storableMessages([user('Что сейчас?'), answer, { id: 's', role: 'system', parts: [{ type: 'text', text: 'x' }] }])
  assert.equal(stored.length, 2)
  assert.deepEqual(stored[1].parts.map(p => p.type), ['tool-system_overview', 'tool-get_stop', 'text'])
  assert.deepEqual([stored[1].parts[0].state, stored[1].parts[0].output, stored[1].parts[0].input], ['output-available', null, {}])
  assert.equal(stored[1].parts[1].state, 'output-error')
  assert.ok(JSON.stringify(stored).length < 1000)
  const many = Array.from({ length: 260 }, (_, i) => user('вопрос ' + i))
  assert.equal(history.storableMessages(many).length, history.MAX_STORED_MESSAGES)
})

test('the title is the start of the first question', () => {
  assert.equal(history.conversationTitle([user('  Какие  камеры\nне в сети? ')]), 'Какие камеры не в сети?')
  assert.equal(history.conversationTitle([user('а'.repeat(120))]).length, 80)
  assert.equal(history.conversationTitle([]), 'Новый диалог')
})

test('only real uuids are accepted as conversation ids', () => {
  assert.equal(history.isConversationId('6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f'), true)
  for (const bad of ['', 'abc', null, 42, "6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f' or 1=1"]) assert.equal(history.isConversationId(bad), false)
})

test('saving upserts the cleaned conversation under the signed-in user and swallows errors', async () => {
  const calls = []
  const db = { from: table => ({ upsert: (row, options) => { calls.push({ table, row, options }); return Promise.resolve({ error: calls.length > 1 ? { code: '42501' } : null }) } }) }
  await history.saveConversation(db, 'user-1', '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', [user('Где холодно?'), answer])
  assert.equal(calls[0].table, 'assistant_conversations')
  assert.deepEqual([calls[0].row.id, calls[0].row.user_id, calls[0].row.title, calls[0].options.onConflict], ['6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', 'user-1', 'Где холодно?', 'id'])
  await history.saveConversation(db, 'user-1', '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', [user('x')])
  await history.saveConversation(db, 'user-1', '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', [])
  assert.equal(calls.length, 2)
})

test('готовые отчёты остаются в истории для кнопок скачивания, в пределах лимита', () => {
  const report = { title: 'Отчёт', generatedAt: '2026-11-13 18:40', summary: ['ok'], metrics: [], sections: [] }
  const withReport = { id: 'a1', role: 'assistant', parts: [
    { type: 'tool-create_report', toolCallId: 'r1', state: 'output-available', input: { title: 'Отчёт', sections: [] }, output: { report, formats: ['pdf'] } },
    { type: 'tool-system_overview', toolCallId: 's1', state: 'output-available', input: {}, output: '{"big":true}' },
    { type: 'text', text: 'Готово.' },
  ] }
  const [, stored] = history.storableMessages([user('Сделай отчёт'), withReport])
  assert.deepEqual(stored.parts[0].output, { report })
  assert.deepEqual(stored.parts[0].input, {})
  assert.equal(stored.parts[1].output, null)
  const huge = { ...report, summary: ['x'.repeat(1_300_000)] }
  const [, trimmed] = history.storableMessages([user('Сделай отчёт'), { ...withReport, parts: [{ ...withReport.parts[0], output: { report: huge } }] }])
  assert.equal(trimmed.parts[0].output, null)
})
