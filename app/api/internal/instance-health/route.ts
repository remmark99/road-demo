import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
    return NextResponse.json({ status: 'ok', instance: process.env.APP_INSTANCE_ID || 'default' })
}
