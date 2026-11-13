import { createOpenAI } from '@ai-sdk/openai'
import { generateText, jsonSchema, stepCountIs, streamText, tool, type ModelMessage, type ToolSet, type UIMessage } from 'ai'
import { localTime } from '@/lib/mcp/vector/args'
import { INSTRUCTIONS, callVectorTool } from '@/lib/mcp/vector/server'
import { VECTOR_TOOLS, type VectorToolContext } from '@/lib/mcp/vector/tools'

/**
 * ИИ-ассистент вкладки «ИИ-ассистент»: модель через RouterAI (OpenAI-совместимый
 * API, GigaChat или YandexGPT) и инструменты MCP «Вектор города», вызываемые
 * напрямую, без HTTP. Ключ и модель — из окружения, в браузер не попадают.
 */

export const DEFAULT_ASSISTANT_BASE_URL = 'https://routerai.ru/api/v1'
const MAX_STEPS = 8
const HISTORY_MESSAGES = 12
const TIMEOUT_MS = 120_000

export function assistantConfigured() {
    return Boolean(process.env.ASSISTANT_LLM_API_KEY && process.env.ASSISTANT_LLM_MODEL)
}

function systemPrompt(now: number) {
    return `${INSTRUCTIONS}

Сейчас ${localTime(now)} по Сургуту. Ты — ИИ-ассистент «Вектора города» для сотрудников администрации Сургута.
Отвечай по-русски, коротко и по делу: сначала вывод одной-двумя фразами, потом цифры. Списки и таблицы — в Markdown.
Не показывай пользователю названия инструментов, JSON и id, кроме номеров камер. Не выдумывай данных: если инструмент вернул ошибку или пусто — скажи об этом.`
}

/** Текст из сообщений интерфейса; последние сообщения, без вложений. */
export function toModelMessages(messages: UIMessage[]): ModelMessage[] {
    return messages
        .filter(message => message.role === 'user' || message.role === 'assistant')
        .map(message => ({
            role: message.role as 'user' | 'assistant',
            content: message.parts.filter(part => part.type === 'text').map(part => (part as { text: string }).text).join('\n').trim(),
        }))
        .filter(message => message.content)
        .slice(-HISTORY_MESSAGES)
}

export function vectorToolSet(ctx: VectorToolContext): ToolSet {
    const tools: ToolSet = {}
    for (const definition of VECTOR_TOOLS) {
        tools[definition.name] = tool({
            description: definition.description,
            inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
            execute: async (args: unknown) => {
                const result = await callVectorTool(ctx, definition.name, args)
                const text = result.content.map(part => part.text).join('\n')
                return result.isError ? `Ошибка: ${text}` : text
            },
        })
    }
    return tools
}

function assistantRequest(messages: UIMessage[], ctx: VectorToolContext) {
    const provider = createOpenAI({
        apiKey: process.env.ASSISTANT_LLM_API_KEY,
        baseURL: process.env.ASSISTANT_LLM_BASE_URL || DEFAULT_ASSISTANT_BASE_URL,
        name: 'routerai',
    })
    return {
        // Chat Completions: RouterAI и GigaChat не поддерживают Responses API.
        model: provider.chat(process.env.ASSISTANT_LLM_MODEL!),
        system: systemPrompt(ctx.now),
        messages: toModelMessages(messages),
        tools: vectorToolSet(ctx),
        stopWhen: stepCountIs(MAX_STEPS),
        temperature: 0.1,
        maxOutputTokens: 1500,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    }
}

function lastIsQuestion(messages: UIMessage[]) {
    const history = toModelMessages(messages)
    return history.length > 0 && history.at(-1)?.role === 'user'
}

export async function answerWithVectorAssistant(messages: UIMessage[], ctx: VectorToolContext): Promise<string> {
    if (!lastIsQuestion(messages)) return 'Напишите вопрос.'
    const result = await generateText(assistantRequest(messages, ctx))
    const text = result.text.trim()
    if (text) return text
    return 'Не удалось сформулировать ответ: модель не уложилась в отведённые шаги. Уточните вопрос, например период или остановку.'
}

/** Потоковый ответ для окна чата: текст по мере генерации и шаги с инструментами. */
export function streamVectorAssistant(messages: UIMessage[], ctx: VectorToolContext) {
    if (!lastIsQuestion(messages)) return null
    return streamText(assistantRequest(messages, ctx))
}
