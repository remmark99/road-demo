import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface LicensePayload {
    license_id: string
    customer: string
    hardware_id: string | null
    issued_at: string
    expires_at: string
    modules: string[]
    max_cameras: number
    /** Каким ключом подписано удостоверение. Отсутствует в лицензиях, выпущенных
     *  до его появления. */
    key_id?: string
}

/**
 * Открытая половина ключа подписи лицензий (key_id 'k1', purpose 'credential').
 * Секретом не является.
 *
 * То же значение зашито в bus_stop_analytics/src/shared/license.py. Рассинхрон
 * этих двух мест означает, что фронт и бэкенд расходятся в оценке одной и той же
 * лицензии — поэтому оно пришпилено фикстурой tests/fixtures/license_canonical.json
 * (production_public_key_hex) и проверяется тестами с обеих сторон.
 *
 * До 2026-09-29 здесь стоял ключ, чья приватная половина выводилась из строки,
 * закоммиченной в репозиторий бэкенда. Не возвращать.
 */
export const PUBLIC_KEY_HEX = "0da9be8a390f84b4e31745cac61b88722b1af8fb98c20df6d063ed27f80aac54"

// Construct Node.js Ed25519 DER public key format from 32-byte raw hex
function createEd25519PublicKey(rawPublicKeyHex: string): crypto.KeyObject {
    const rawKey = Buffer.from(rawPublicKeyHex, 'hex')
    // DER prefix for Ed25519 public key (PKIX): 302a300506032b6570032100 + 32-byte raw key
    const derPrefix = Buffer.from('302a300506032b6570032100', 'hex')
    const derKey = Buffer.concat([derPrefix, rawKey])
    return crypto.createPublicKey({
        key: derKey,
        format: 'der',
        type: 'spki',
    })
}

/**
 * Байты, которые подписываются и проверяются. Должна посимвольно совпадать с
 * canonical_json() в bus_stop_analytics/src/shared/license.py, иначе лицензия
 * проходит на бэкенде и не проходит здесь (или наоборот).
 *
 * Форма: ключи отсортированы (рекурсивно), без пробелов, не-ASCII не
 * экранируется, UTF-8. Дробные числа запрещены — их форматирование расходится
 * между JS и Python на краях, а в лицензии им и так не место.
 *
 * Зафиксировано фикстурой tests/fixtures/license_canonical.json, которую читают
 * тесты в обоих репозиториях. Меняя эту функцию, меняй фикстуру и обе реализации.
 *
 * Важно: JSON.stringify(obj, keysArray) для этого не годится — массив-replacer
 * управляет составом и порядком ключей на всех уровнях вложенности сразу, что не
 * то же самое, что рекурсивная сортировка. Именно так здесь и было, и из-за этого
 * (плюс пробелы после разделителей в Python) подпись не сходилась никогда.
 */
export function canonicalJson(value: unknown): string {
    if (value === null) return 'null'

    switch (typeof value) {
        case 'boolean':
            return value ? 'true' : 'false'
        case 'string':
            return JSON.stringify(value)
        case 'number':
            if (!Number.isInteger(value)) {
                throw new Error(
                    'Дробные числа в лицензии запрещены: форматирование float расходится между JS и Python'
                )
            }
            return String(value)
        case 'object':
            break
        default:
            throw new Error(`Неподдерживаемый тип в payload: ${typeof value}`)
    }

    if (Array.isArray(value)) {
        return '[' + value.map(canonicalJson).join(',') + ']'
    }

    const obj = value as Record<string, unknown>
    return '{' + Object.keys(obj).sort()
        .map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
        .join(',') + '}'
}

export function validateLicense(filePath?: string): LicensePayload {
    const licensePath = filePath || process.env.LICENSE_FILE || path.join(process.cwd(), 'license.key')

    if (!fs.existsSync(licensePath)) {
        throw new Error(`License file not found at: ${licensePath}`)
    }

    const fileContent = fs.readFileSync(licensePath, 'utf-8')
    const data = JSON.parse(fileContent)

    const payload = data.payload as LicensePayload
    const signatureHex = data.signature as string

    if (!payload || !signatureHex) {
        throw new Error('Invalid license file format: missing payload or signature')
    }

    const payloadBuffer = Buffer.from(canonicalJson(payload), 'utf-8')
    const signatureBuffer = Buffer.from(signatureHex, 'hex')

    const publicKey = createEd25519PublicKey(PUBLIC_KEY_HEX)
    const isValid = crypto.verify(null, payloadBuffer, publicKey, signatureBuffer)

    if (!isValid) {
        throw new Error('License signature verification failed!')
    }

    // Expiry check
    const expDate = new Date(payload.expires_at)
    if (isNaN(expDate.getTime()) || new Date() > expDate) {
        throw new Error(`License expired on ${payload.expires_at}`)
    }

    return payload
}

export function getActiveLicense(): LicensePayload | null {
    if (process.env.LICENSE_CHECK_ENABLED === 'false') {
        return {
            license_id: 'dev-unrestricted',
            customer: 'Development',
            hardware_id: null,
            issued_at: '2020-01-01T00:00:00Z',
            expires_at: '2099-01-01T00:00:00Z',
            modules: [
                'smoking',
                'lying_person',
                'dogs_without_people',
                'abandoned_object',
                'bin_fullness',
                'busyness',
                'stage2_verification',
            ],
            max_cameras: 999,
        }
    }

    try {
        return validateLicense()
    } catch (err) {
        console.error('License validation failed:', err)
        return null
    }
}
