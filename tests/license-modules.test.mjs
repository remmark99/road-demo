// Фильтрация разделов по лицензии.
//
//   node --test tests/license-modules.test.mjs
//
// Лицензируется модуль целиком, поэтому словарь один и тот же на фронт, реестр
// вендора и воркеры бэкенда. Отдельно проверяется различие между определённым
// отказом и «спросить не удалось»: раньше и то и другое давало полный доступ.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const { filterModulesByLicense } = (() => {
    const exports = {}
    const code = ts.transpileModule(
        readFileSync(new URL('../lib/license-modules.ts', import.meta.url), 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
    ).outputText
    new Function('exports', code)(exports)
    return exports
})()

const USER = ['stops', 'roads', 'asr']

test('лицензия на модуль открывает его раздел', () => {
    assert.deepEqual(filterModulesByLicense(USER, ['stops']), ['stops'])
})

test('нелицензированные разделы скрываются', () => {
    assert.deepEqual(filterModulesByLicense(USER, ['roads', 'asr']), ['roads', 'asr'])
})

test('порядок разделов пользователя сохраняется', () => {
    assert.deepEqual(filterModulesByLicense(['asr', 'stops'], ['stops', 'asr']), ['asr', 'stops'])
})

test('лишние модули в лицензии ничего не добавляют', () => {
    // Лицензия шире, чем права пользователя — доступ даёт пересечение, не лицензия.
    assert.deepEqual(filterModulesByLicense(['stops'], ['stops', 'roads', 'parks']), ['stops'])
})

test('невалидная лицензия скрывает всё', () => {
    // Пустой массив = определённый отказ.
    assert.deepEqual(filterModulesByLicense(USER, []), [])
})

test('недоступный /api/license ничего не фильтрует', () => {
    // null = спросить не удалось. Транзиентный сбой не должен гасить интерфейс:
    // конвейер в этот момент всё равно живёт по своей проверке лицензии.
    assert.deepEqual(filterModulesByLicense(USER, null), USER)
})

test('пустые права пользователя остаются пустыми', () => {
    assert.deepEqual(filterModulesByLicense([], ['stops']), [])
})

test('исходный массив не мутируется', () => {
    const user = ['stops', 'roads']
    filterModulesByLicense(user, ['stops'])
    assert.deepEqual(user, ['stops', 'roads'])
})

test('словарь совпадает с реестром вендора', () => {
    // Шесть модулей — те же значения, что в license_modules и в profiles.modules.
    // Раньше фронт пересекал их с именами детекций, и пересечение было пусто.
    const registryModules = ['roads', 'stops', 'parks', 'shore', 'transport', 'asr']
    const detections = ['smoking', 'lying_person', 'dogs_without_people',
                        'abandoned_object', 'bin_fullness', 'busyness', 'stage2_verification']
    assert.deepEqual(filterModulesByLicense(registryModules, registryModules), registryModules)
    assert.deepEqual(filterModulesByLicense(registryModules, detections), [])
})
