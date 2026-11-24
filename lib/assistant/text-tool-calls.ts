import { generateId, type LanguageModelMiddleware } from 'ai'

/**
 * GigaChat иногда не вызывает инструмент, а пишет вызов текстом в своей разметке:
 *   <｜GCML｜tool_calls><｜GCML｜invoke name="create_report"><｜GCML｜parameter name="title" string="true">…
 * Пользователь увидел бы эту разметку вместо отчёта. Здесь, между моделью и SDK, такой текст
 * вырезается из ответа и отдаётся дальше как настоящий вызов инструмента — без повторного
 * запроса к модели. Что разобрать не удалось, пользователю всё равно не показываем.
 */

type WrapStream = NonNullable<LanguageModelMiddleware['wrapStream']>
type ContentPart = Awaited<ReturnType<NonNullable<LanguageModelMiddleware['wrapGenerate']>>>['content'][number]
type CallOptions = Parameters<WrapStream>[0]['params']
type StreamPart = Awaited<ReturnType<WrapStream>>['stream'] extends ReadableStream<infer Part> ? Part : never
type ToolCallPart = Extract<StreamPart, { type: 'tool-call' }>

/** Начало разметки: «<｜» или «</｜» — в обычном тексте такого сочетания не бывает. */
const MARKUP_START = /<\/?｜/
/** Конец куска текста, который может оказаться началом разметки: придерживаем до следующего куска. */
const MARKUP_PREFIX = /<\/?$/
const INVOKE = /<｜[A-Za-z]+｜invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/｜[A-Za-z]+｜invoke>/
const PARAMETER = /<｜[A-Za-z]+｜parameter\s+name="([^"]+)"(?:\s+string="(true|false)")?\s*>([\s\S]*?)<\/｜[A-Za-z]+｜parameter>/g

/**
 * Первый вызов из разметки: имя инструмента и аргументы строкой JSON.
 * Оборванный вызов (нет закрывающего тега) или битый JSON в параметре — null.
 */
export function parseTextToolCall(markup: string): { toolName: string; input: string } | null {
    const invoke = INVOKE.exec(markup)
    if (!invoke) return null
    const args: Record<string, unknown> = {}
    for (const [, name, isString, raw] of invoke[2].matchAll(PARAMETER)) {
        if (isString === 'true') {
            args[name] = raw
            continue
        }
        try {
            args[name] = JSON.parse(raw)
        } catch {
            if (isString === 'false') return null
            args[name] = raw
        }
    }
    return { toolName: invoke[1], input: JSON.stringify(args) }
}

/** Вызов из разметки, если его можно выполнить; иначе null — разметка просто вырезается. */
function toolCallFromMarkup(markup: string, params: CallOptions): ToolCallPart | null {
    const call = parseTextToolCall(markup)
    if (!call) {
        console.warn(`tool call written as text dropped: not parsed, ${markup.length} chars`)
        return null
    }
    if (!params.tools?.some(tool => tool.name === call.toolName)) {
        console.warn(`tool call written as text dropped: unknown tool "${call.toolName.slice(0, 60)}"`)
        return null
    }
    // Инструменты закрыты (отчёт уже готов или шаг последний): выполняем только то, чего в этом ответе ещё не было, — второй отчёт не нужен.
    const repeated = params.toolChoice?.type === 'none' && params.prompt.some(message =>
        message.role === 'tool' && message.content.some(part => part.type === 'tool-result' && part.toolName === call.toolName))
    if (repeated) {
        console.warn(`tool call written as text dropped: "${call.toolName}" repeated after tools were closed`)
        return null
    }
    console.warn(`tool call written as text recovered: "${call.toolName}"`)
    return { type: 'tool-call', toolCallId: `text-${generateId()}`, toolName: call.toolName, input: call.input }
}

export const textToolCalls: LanguageModelMiddleware = {
    specificationVersion: 'v3',

    wrapGenerate: async ({ doGenerate, params }) => {
        const result = await doGenerate()
        const content: ContentPart[] = []
        let call: ToolCallPart | null = null
        for (const part of result.content) {
            const at = part.type === 'text' ? part.text.search(MARKUP_START) : -1
            if (part.type !== 'text' || at < 0) {
                content.push(part)
                continue
            }
            call ??= toolCallFromMarkup(part.text.slice(at), params)
            const before = part.text.slice(0, at).trimEnd()
            if (before) content.push({ ...part, text: before })
        }
        if (!call) return { ...result, content }
        return { ...result, content: [...content, call], finishReason: { ...result.finishReason, unified: 'tool-calls' } }
    },

    wrapStream: async ({ doStream, params }) => {
        const result = await doStream()
        let textStart: StreamPart | null = null // начало текста отдаём, только когда есть что показать
        let started = false
        let pending = '' // ещё не отданный текст: пробелы в начале или возможное начало разметки
        let markup: string | null = null
        const stream = result.stream.pipeThrough(new TransformStream<StreamPart, StreamPart>({
            transform(part, controller) {
                const show = (id: string, text: string) => {
                    if (!text) return
                    if (!started && textStart) controller.enqueue(textStart)
                    started = true
                    controller.enqueue({ type: 'text-delta', id, delta: text })
                }
                if (part.type === 'text-start') {
                    textStart = part
                    started = false
                    return
                }
                if (part.type === 'text-delta') {
                    if (markup !== null) {
                        markup += part.delta
                        return
                    }
                    pending += part.delta
                    const at = pending.search(MARKUP_START)
                    const end = at >= 0 ? at : pending.length - (MARKUP_PREFIX.exec(pending)?.[0].length ?? 0)
                    if (at >= 0) markup = pending.slice(at)
                    const visible = pending.slice(0, end)
                    if (started || visible.trim()) {
                        show(part.id, visible)
                        pending = at >= 0 ? '' : pending.slice(end)
                    } else if (at >= 0) {
                        pending = ''
                    }
                    return
                }
                if (part.type === 'text-end') {
                    if (started || pending.trim()) show(part.id, pending)
                    if (started) controller.enqueue(part)
                    pending = ''
                    started = false
                    textStart = null
                    return
                }
                if (part.type === 'finish' && markup !== null) {
                    const call = toolCallFromMarkup(markup, params)
                    markup = null
                    if (call) {
                        controller.enqueue(call)
                        controller.enqueue({ ...part, finishReason: { ...part.finishReason, unified: 'tool-calls' } })
                        return
                    }
                }
                controller.enqueue(part)
            },
        }))
        return { ...result, stream }
    },
}
