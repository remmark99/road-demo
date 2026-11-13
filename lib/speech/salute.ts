import { randomUUID } from 'node:crypto'

/**
 * SaluteSpeech (Сбер): распознавание речи ассистенту и озвучка ответов.
 * Только сервер: ключ из окружения в браузер не попадает. Корневой сертификат
 * НУЦ Минцифры Node получает из NODE_EXTRA_CA_CERTS (скрипт start в package.json).
 */

const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
const API_URL = 'https://smartspeech.sber.ru/rest/v1'
/** PCM 16 бит, 16 кГц, моно — 32 000 байт в секунду; 60 секунд с запасом. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024
export const MAX_SYNTHESIS_CHARS = 3500
export const PCM_CONTENT_TYPE = 'audio/x-pcm;bit=16;rate=16000'
const TIMEOUT_MS = 30_000

export class SpeechError extends Error {
    constructor(message: string, public status = 502) { super(message) }
}

export function speechConfigured() {
    return Boolean(process.env.SALUTE_SPEECH_AUTH_KEY)
}

let token: { value: string; expiresAt: number } | null = null
let pending: Promise<string> | null = null

async function accessToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > Date.now()) return token.value
    // Одновременные запросы ждут один и тот же токен, а не просят новый каждый.
    pending ??= (async () => {
        try {
            const response = await fetch(OAUTH_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                    RqUID: randomUUID(),
                    Authorization: `Basic ${process.env.SALUTE_SPEECH_AUTH_KEY}`,
                },
                // B2B — предоплатные пакеты юрлица, CORP — постоплата по договору.
                body: new URLSearchParams({ scope: process.env.SALUTE_SPEECH_SCOPE || 'SALUTE_SPEECH_B2B' }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            })
            if (!response.ok) throw new SpeechError(`SaluteSpeech не выдал токен (${response.status})`)
            const body = await response.json() as { access_token?: string; expires_at?: number }
            if (!body.access_token) throw new SpeechError('SaluteSpeech не выдал токен')
            // expires_at приходит в миллисекундах; на всякий случай принимаем и секунды.
            const expires = Number(body.expires_at) || Date.now() + 25 * 60_000
            token = { value: body.access_token, expiresAt: expires < 1e12 ? expires * 1000 : expires }
            return token.value
        } finally {
            pending = null
        }
    })()
    return pending
}

/** Распознавание короткой фразы. Возвращает текст или пустую строку, если речи не слышно. */
export async function recognizeSpeech(audio: ArrayBuffer, contentType = PCM_CONTENT_TYPE): Promise<string> {
    if (audio.byteLength === 0) return ''
    if (audio.byteLength > MAX_AUDIO_BYTES) throw new SpeechError('Запись слишком длинная: не больше минуты', 413)
    // PCM без WAV-заголовка: частоту нужно передать явно.
    const params = new URLSearchParams({ language: 'ru-RU', sample_rate: '16000' })
    const response = await fetch(`${API_URL}/speech:recognize?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': contentType },
        body: audio,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new SpeechError(`SaluteSpeech не распознал запись (${response.status})`)
    const body = await response.json() as { result?: unknown }
    const parts = Array.isArray(body.result) ? body.result.filter((part): part is string => typeof part === 'string') : []
    return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Озвучка текста: WAV 16 бит, 24 кГц. */
export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
    const clean = text.trim().slice(0, MAX_SYNTHESIS_CHARS)
    if (!clean) throw new SpeechError('Нечего озвучивать', 400)
    const params = new URLSearchParams({ format: 'wav16', voice: process.env.SALUTE_SPEECH_VOICE || 'May_24000' })
    const response = await fetch(`${API_URL}/text:synthesize?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/text' },
        body: clean,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new SpeechError(`SaluteSpeech не озвучил ответ (${response.status})`)
    return response.arrayBuffer()
}

/**
 * Текст ответа для озвучки: без разметки Markdown. Таблицы на слух не читаются —
 * вместо них короткая фраза, подробности остаются на экране.
 */
export function speakableText(markdown: string): string {
    const lines: string[] = []
    let inTable = false
    for (const raw of markdown.split('\n')) {
        const line = raw.trim()
        if (/^\|.*\|$/.test(line)) {
            if (!inTable) lines.push('Подробности в таблице на экране.')
            inTable = true
            continue
        }
        inTable = false
        if (/^```/.test(line)) continue
        lines.push(line
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/^#{1,6}\s+/, '')
            .replace(/^[-*+]\s+/, '')
            .replace(/^\d+[.)]\s+/, '')
            .replace(/[*_`~]+/g, '')
            .replace(/\s+—\s+/g, ' — '))
    }
    return lines.filter(Boolean).join('\n').replace(/\n{2,}/g, '\n').trim()
}
