import { ToolInputError } from './args'
import { VECTOR_TOOLS, type VectorToolContext } from './tools'

/**
 * MCP «Вектор города»: только чтение данных остановочных павильонов Сургута.
 *
 * Как у тендерной системы: обычный JSON-RPC через POST, каждый вызов —
 * один JSON-ответ (Streamable HTTP это допускает), без сессий и SSE.
 * Тот же реестр инструментов вызывает ИИ-ассистент сайта напрямую.
 */

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const

export const INSTRUCTIONS = `Платформа «Вектор города», модуль «Остановочные павильоны» города Сургута: камеры с видеоаналитикой и контроллеры с датчиками на остановках.
Время — Сургут (UTC+5). Все инструменты только читают данные.

Готовые сценарии.
1. «Как дела / что происходит / сводка»: system_overview, затем при необходимости stop_conditions(level=problems) и equipment_status.
2. «Что не работает / что не в сети»: equipment_status (сейчас), equipment_outages (за период, самые долгие простои).
3. «Расскажи про остановку N»: get_stop(stop="название или id"). Если название неоднозначно, инструмент вернёт список с id — выбери нужную.
4. «Сколько было лежачих / курящих / где чаще»: security_events с периодом; group_by=stop, day или hour_of_day.
5. «Где холодно / влажно / нарушения норм»: stop_climate (sort=coldest/warmest/most_humid) и stop_conditions.
6. «Урны»: bin_episodes (status=open — переполнены сейчас).
7. «Сколько людей / загруженность»: passenger_load — это люди в кадре, а не уникальные пассажиры.
8. «По микрорайонам»: districts_summary.

Правила ответа: только цифры из инструментов, без догадок; если данных нет — так и скажи. Называй остановки по имени и направлению, время — по Сургуту.
Периоды: from/to в формате YYYY-MM-DD (день по Сургуту) или ISO 8601; «вчера» — from и to на вчерашнюю дату.`

const TOOL_LIST = VECTOR_TOOLS.map(tool => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}))

export function listVectorTools() {
    return TOOL_LIST
}

export class RpcError extends Error {
    constructor(public code: number, message: string) { super(message) }
}

export interface ToolCallResult {
    isError?: boolean
    content: { type: 'text'; text: string }[]
}

/** Вызов инструмента: ошибки параметров — понятным текстом модели, внутренние — без подробностей. */
export async function callVectorTool(ctx: VectorToolContext, name: string, args: unknown): Promise<ToolCallResult> {
    const tool = VECTOR_TOOLS.find(t => t.name === name)
    if (!tool) throw new RpcError(-32602, 'Неизвестный инструмент')
    if (args !== undefined && args !== null && (typeof args !== 'object' || Array.isArray(args))) {
        return { isError: true, content: [{ type: 'text', text: 'Параметры инструмента должны быть объектом' }] }
    }
    try {
        const result = await tool.handler(ctx, (args ?? {}) as Record<string, unknown>)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
        if (error instanceof ToolInputError) return { isError: true, content: [{ type: 'text', text: error.message }] }
        console.error(`mcp tool ${name} failed:`, error instanceof Error ? error.message : 'unknown error')
        return { isError: true, content: [{ type: 'text', text: 'Внутренняя ошибка «Вектора города». Попробуйте позже или сузьте запрос.' }] }
    }
}

export async function handleVectorRpc(ctx: VectorToolContext, method: unknown, params: Record<string, unknown>) {
    if (method === 'initialize') {
        const requested = params.protocolVersion
        return {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested as typeof PROTOCOL_VERSIONS[number]) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'vector-city', title: 'Вектор города', version: '1.0.0' },
            instructions: INSTRUCTIONS,
        }
    }
    if (method === 'ping') return {}
    if (method === 'tools/list') return { tools: TOOL_LIST }
    if (method === 'tools/call') {
        if (typeof params.name !== 'string') throw new RpcError(-32602, 'Неизвестный инструмент')
        return callVectorTool(ctx, params.name, params.arguments)
    }
    throw new RpcError(-32601, 'Метод не поддерживается')
}
