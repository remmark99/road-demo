import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { secretsEqual } from '@/lib/notifications/http'
import { PROTOCOL_VERSIONS, RpcError, handleVectorRpc } from '@/lib/mcp/vector/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * MCP «Вектор города» для внешних ИИ-клиентов и для проверки ассистента.
 * Доступ: вошедший пользователь с модулем остановок (с этого же сайта) или
 * клиент с токеном VECTOR_MCP_TOKEN в Authorization: Bearer. Без токена в
 * окружении внешний доступ закрыт.
 */

function rpcError(id: unknown, code: number, message: string, status = 200) {
    return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status })
}

async function identify(request: Request) {
    const authorization = request.headers.get('authorization')
    if (authorization?.startsWith('Bearer ')) {
        const token = process.env.VECTOR_MCP_TOKEN
        if (!token || !secretsEqual(authorization.slice(7).trim(), token)) return null
        return { login: 'token', db: createNotificationAdminClient() }
    }
    // Сессия браузера — только с этого же сайта: чужая страница не должна читать данные от имени пользователя.
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return null
    const db = await createClient()
    const { data: { user }, error } = await db.auth.getUser()
    if (error || !user) return null
    const profile = await db.from('profiles').select('role,modules').eq('id', user.id).single()
    if (profile.error || !profile.data || (profile.data.role !== 'admin' && !profile.data.modules?.includes('stops'))) return null
    return { login: user.email ?? user.id, db }
}

export async function GET() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

export async function DELETE() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

export async function POST(request: Request) {
    const identity = await identify(request)
    if (!identity) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
    }
    const version = request.headers.get('mcp-protocol-version')
    if (version && !PROTOCOL_VERSIONS.includes(version as typeof PROTOCOL_VERSIONS[number])) {
        return NextResponse.json({ error: 'unsupported_protocol_version' }, { status: 400 })
    }
    let message: unknown
    try { message = JSON.parse(await request.text()) } catch { return rpcError(null, -32700, 'Не удалось разобрать запрос', 400) }
    if (!message || typeof message !== 'object' || Array.isArray(message) || (message as { jsonrpc?: unknown }).jsonrpc !== '2.0') {
        return rpcError(null, -32600, 'Некорректный запрос', 400)
    }
    const { id, method, params } = message as { id?: unknown; method?: unknown; params?: unknown }
    // Уведомление или ответ нам: отвечать нечего.
    if (method === undefined || id === undefined) return new NextResponse(null, { status: 202 })
    if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
        return rpcError(id, -32602, 'params должен быть объектом')
    }
    try {
        if (method === 'tools/call') console.info('mcp call:', identity.login, (params as { name?: unknown })?.name)
        const result = await handleVectorRpc({ db: identity.db, now: Date.now() }, method, (params ?? {}) as Record<string, unknown>)
        return NextResponse.json({ jsonrpc: '2.0', id, result })
    } catch (error) {
        if (error instanceof RpcError) return rpcError(id, error.code, error.message)
        console.error('mcp request failed:', error instanceof Error ? error.message : 'unknown error')
        return rpcError(id, -32603, 'Внутренняя ошибка')
    }
}
