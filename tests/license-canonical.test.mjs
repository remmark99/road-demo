// Канонизация подписи лицензии — сторона TS.
//
//   node --test tests/license-canonical.test.mjs
//
// Парный тест живёт в bus_stop_analytics/tests/test_license_canonical.py и читает
// ту же фикстуру. Обе реализации обязаны выдавать одни и те же байты: расхождение
// означает, что лицензия проходит на бэкенде и не проходит здесь.
//
// Фикстура tests/fixtures/license_canonical.json — копия файла из
// bus_stop_analytics/tests/fixtures/. Копии обязаны совпадать байт-в-байт.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

// lib/license.ts тянет node-модули (fs, path, crypto), поэтому в транспилированный
// код надо передать не только exports, но и require.
const { canonicalJson, PUBLIC_KEY_HEX } = (() => {
    const exports = {}
    const code = ts.transpileModule(
        readFileSync(new URL('../lib/license.ts', import.meta.url), 'utf8'),
        {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                // Без него default-импорты fs/path/crypto разворачиваются в undefined,
                // и validateLicense падает на existsSync вместо проверки подписи.
                esModuleInterop: true,
            },
        }
    ).outputText
    new Function('exports', 'require', code)(exports, require)
    return exports
})()

const fx = JSON.parse(readFileSync(new URL('./fixtures/license_canonical.json', import.meta.url), 'utf8'))

test('канонические байты совпадают с эталоном', () => {
    const out = Buffer.from(canonicalJson(fx.payload), 'utf-8')
    assert.equal(out.toString('hex'), fx.canonical_utf8_hex)
    assert.equal(out.length, fx.canonical_len)
})

test('подпись из фикстуры проверяется', () => {
    const der = Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(fx.test_public_key_hex, 'hex'),
    ])
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
    const valid = crypto.verify(
        null,
        Buffer.from(canonicalJson(fx.payload), 'utf-8'),
        key,
        Buffer.from(fx.signature_hex, 'hex')
    )
    assert.equal(valid, true)
})

test('подмена поля ломает подпись', () => {
    const der = Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(fx.test_public_key_hex, 'hex'),
    ])
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
    const tampered = { ...fx.payload, max_cameras: 999 }
    const valid = crypto.verify(
        null,
        Buffer.from(canonicalJson(tampered), 'utf-8'),
        key,
        Buffer.from(fx.signature_hex, 'hex')
    )
    assert.equal(valid, false)
})

test('порядок ключей не влияет на байты', () => {
    const shuffled = Object.fromEntries(Object.entries(fx.payload).reverse())
    assert.notDeepEqual(Object.keys(shuffled), Object.keys(fx.payload))
    assert.equal(canonicalJson(shuffled), canonicalJson(fx.payload))
})

test('не-ASCII не экранируется', () => {
    // Главная причина, по которой фронт не мог проверить ни одну лицензию.
    const out = canonicalJson(fx.payload)
    assert.ok(out.includes('Администрация'))
    assert.ok(!out.includes('\\u04'))
})

test('после разделителей нет пробелов', () => {
    // Вторая причина: json.dumps в Python по умолчанию ставит пробелы.
    const out = canonicalJson(fx.payload)
    assert.ok(!out.includes('", "'))
    assert.ok(!out.includes('": '))
})

test('вложенные ключи сортируются рекурсивно', () => {
    assert.equal(
        canonicalJson({ b: 1, a: { z: 1, y: { x: 2, w: 3 } } }),
        '{"a":{"y":{"w":3,"x":2},"z":1},"b":1}'
    )
})

test('дробные числа отклоняются', () => {
    assert.throws(() => canonicalJson({ max_cameras: 30.5 }), /Дробные числа/)
})

test('неподдерживаемый тип отклоняется', () => {
    assert.throws(() => canonicalJson({ f: () => 1 }), /Неподдерживаемый тип/)
})

test('null, bool и пустой массив', () => {
    assert.equal(
        canonicalJson({ a: null, b: true, c: false, d: [] }),
        '{"a":null,"b":true,"c":false,"d":[]}'
    )
})

test('порядок элементов массива сохраняется', () => {
    // modules не сортируется: порядок — часть подписанных данных.
    assert.equal(canonicalJson({ m: ['b', 'a'] }), '{"m":["b","a"]}')
})

// ── Пришпиленный боевой ключ ────────────────────────────────────────────────
// Открытая половина ключа подписи зашита в двух репозиториях. Эти тесты — сторожок
// на два случая: значения разъехались, или кто-то вернул скомпрометированный ключ.

test('пришпиленный публичный ключ совпадает с фикстурой', () => {
    // Тот же тест есть в bus_stop_analytics и читает ту же фикстуру.
    assert.equal(PUBLIC_KEY_HEX, fx.production_public_key_hex)
})

test('пришпиленный ключ — не отозванный', () => {
    // У старого ключа приватная половина выводилась из строки в репозитории.
    assert.notEqual(PUBLIC_KEY_HEX, fx._revoked_public_key_hex)
})

test('пришпиленный ключ разбирается как ключ Ed25519', () => {
    const raw = Buffer.from(PUBLIC_KEY_HEX, 'hex')
    assert.equal(raw.length, 32)
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw])
    assert.doesNotThrow(() => crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }))
})
