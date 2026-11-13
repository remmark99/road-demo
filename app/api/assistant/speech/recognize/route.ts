import { NextResponse } from 'next/server'
import { assistantUser } from '@/lib/assistant/access'
import { MAX_AUDIO_BYTES, PCM_CONTENT_TYPE, SpeechError, recognizeSpeech, speechConfigured } from '@/lib/speech/salute'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
    const access = await assistantUser()
    if (access.status !== 200) return NextResponse.json({ error: 'Нет доступа' }, { status: access.status })
    if (!speechConfigured()) return NextResponse.json({ error: 'Голосовой ввод не настроен' }, { status: 503 })
    if (!request.headers.get('content-type')?.startsWith('audio/x-pcm')) {
        return NextResponse.json({ error: `Ожидается ${PCM_CONTENT_TYPE}` }, { status: 415 })
    }
    const length = Number(request.headers.get('content-length') || 0)
    if (length > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Запись слишком длинная: не больше минуты' }, { status: 413 })
    try {
        const audio = await request.arrayBuffer()
        const text = await recognizeSpeech(audio)
        return NextResponse.json({ text }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
        const status = error instanceof SpeechError ? error.status : 502
        console.error('Speech recognition failed:', error instanceof Error ? error.message : 'unknown error')
        return NextResponse.json({ error: error instanceof SpeechError ? error.message : 'Не удалось распознать речь' }, { status })
    }
}
