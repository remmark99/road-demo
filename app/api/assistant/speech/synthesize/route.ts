import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { SpeechError, speakableText, speechConfigured, synthesizeSpeech } from '@/lib/speech/salute'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: 'Нет доступа' }, { status: access.status })
    if (!speechConfigured()) return NextResponse.json({ error: 'Озвучка не настроена' }, { status: 503 })
    const body = await request.json().catch(() => null) as { text?: unknown } | null
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
        return NextResponse.json({ error: 'Нужен текст' }, { status: 400 })
    }
    try {
        const audio = await synthesizeSpeech(speakableText(body.text))
        return new NextResponse(audio, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } })
    } catch (error) {
        const status = error instanceof SpeechError ? error.status : 502
        console.error('Speech synthesis failed:', error instanceof Error ? error.message : 'unknown error')
        return NextResponse.json({ error: error instanceof SpeechError ? error.message : 'Не удалось озвучить ответ' }, { status })
    }
}
