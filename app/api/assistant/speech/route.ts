import { NextResponse } from 'next/server'
import { speechConfigured } from '@/lib/speech/salute'

export const dynamic = 'force-dynamic'

/** Есть ли голос у ассистента: окно чата прячет микрофон, пока ключ SaluteSpeech не задан. */
export async function GET() {
    return NextResponse.json({ enabled: speechConfigured() }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
