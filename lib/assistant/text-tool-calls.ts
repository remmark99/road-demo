import { generateId, type LanguageModelMiddleware } from 'ai'

/**
 * GigaChat иногда не вызывает инструмент, а пишет вызов текстом в своей разметке:
 *   <｜GCML｜tool_calls><｜GCML｜invoke name="create_report"><｜GCML｜parameter name="title" string="true">…
 * Пользователь увидел бы эту разметку вместо отчёта. Здесь, между моделью и SDK, такой текст
 * вырезается из ответа и отдаётся дальше как настоящий вызов инструмента — без повторного
 * запроса к модели. Что разобрать не удалось, пользователю всё равно не показываем: вместо
 * разметки он получает просьбу повторить запрос.
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
const INVOKE_OPEN = /<｜[A-Za-z]+｜invoke\s+name="([^"]+)"\s*>/
/** Вызов кончается своим закрывающим тегом, закрытием всего блока или началом следующего вызова. */
const INVOKE_END = /<\/｜[A-Za-z]+｜(?:invoke|tool_calls)>|<｜[A-Za-z]+｜invoke\s/
const PARAMETER_OPEN = /<｜[A-Za-z]+｜parameter\s+name="([^"]+)"(?:\s+string="(true|false)")?\s*>/g
const PARAMETER_CLOSE = /<\/｜[A-Za-z]+｜parameter>\s*$/
/** Ответ вместо вызова, который не удалось выполнить: пустым ответ оставлять нельзя. */
export const FAILED_CALL_REPLY = 'Не получилось оформить ответ с первой попытки. Повторите, пожалуйста, запрос.'

/**
 * Первый вызов из разметки: имя инструмента и аргументы строкой JSON.
 * Разметку модель пишет неряшливо, поэтому закрывающие теги необязательны: параметр кончается
 * там, где начинается следующий, вызов — на закрытии блока или в конце текста. После значения
 * последнего параметра модель иногда дописывает соседние ключи (`[…],"subtitle":"…"}`), будто
 * пишет один объект, — такие ключи становятся аргументами. Битый JSON (ответ оборван) — null.
 */
export function parseTextToolCall(markup: string): { toolName: string; input: string } | null {
    const invoke = INVOKE_OPEN.exec(markup)
    if (!invoke) return null
    let body = markup.slice(invoke.index + invoke[0].length)
    const end = body.search(INVOKE_END)
    if (end >= 0) body = body.slice(0, end)
    const parameters = [...body.matchAll(PARAMETER_OPEN)]
    const args: Record<string, unknown> = {}
    const extra: Record<string, unknown> = {}
    for (const [index, parameter] of parameters.entries()) {
        const [open, name, isString] = parameter
        const tail = body.slice(parameter.index + open.length, parameters[index + 1]?.index ?? body.length)
        const raw = PARAMETER_CLOSE.test(tail) ? tail.replace(PARAMETER_CLOSE, '') : tail.trimEnd()
        if (isString === 'true') {
            args[name] = raw
            continue
        }
        try {
            args[name] = JSON.parse(raw)
            continue
        } catch { /* ниже — значение с дописанными соседними ключами */ }
        try {
            const { [name]: value, ...rest } = JSON.parse(`{${JSON.stringify(name)}:${raw}`) as Record<string, unknown>
            args[name] = value
            Object.assign(extra, rest)
        } catch {
            if (isString === 'false') return null
            args[name] = raw
        }
    }
    return { toolName: invoke[1], input: JSON.stringify({ ...extra, ...args }) }
}

/** Начало и конец разметки для лога: по ним видно, на чём споткнулся разбор. */
const excerpt = (markup: string) => JSON.stringify(markup.length > 640 ? `${markup.slice(0, 320)} … ${markup.slice(-320)}` : markup)

/**
 * Вызов из разметки, если его можно выполнить. Иначе разметка вырезается: `failed` — вызов
 * не состоялся и пользователю нужен ответ словами, `skipped` — вызов был лишним.
 */
function toolCallFromMarkup(markup: string, params: CallOptions, truncated: boolean): ToolCallPart | 'failed' | 'skipped' {
    // Инструменты закрыты (отчёт уже готов или шаг последний): несостоявшийся вызов здесь ничего не отменяет.
    const closed = params.toolChoice?.type === 'none'
    const failed = closed ? 'skipped' : 'failed'
    if (truncated) {
        console.warn(`tool call written as text dropped: answer cut by the token limit, ${markup.length} chars`)
        return failed
    }
    const call = parseTextToolCall(markup)
    if (!call) {
        console.warn(`tool call written as text dropped: not parsed, ${markup.length} chars: ${excerpt(markup)}`)
        return failed
    }
    if (!params.tools?.some(tool => tool.name === call.toolName)) {
        console.warn(`tool call written as text dropped: unknown tool "${call.toolName.slice(0, 60)}"`)
        return failed
    }
    // При закрытых инструментах выполняем только то, чего в этом ответе ещё не было, — второй отчёт не нужен.
    const repeated = closed && params.prompt.some(message =>
        message.role === 'tool' && message.content.some(part => part.type === 'tool-result' && part.toolName === call.toolName))
    if (repeated) {
        console.warn(`tool call written as text dropped: "${call.toolName}" repeated after tools were closed`)
        return 'skipped'
    }
    console.warn(`tool call written as text recovered: "${call.toolName}"`)
    return { type: 'tool-call', toolCallId: `text-${generateId()}`, toolName: call.toolName, input: call.input }
}

export const textToolCalls: LanguageModelMiddleware = {
    specificationVersion: 'v3',

    wrapGenerate: async ({ doGenerate, params }) => {
        const result = await doGenerate()
        const content: ContentPart[] = []
        let call: ReturnType<typeof toolCallFromMarkup> | null = null
        for (const part of result.content) {
            const at = part.type === 'text' ? part.text.search(MARKUP_START) : -1
            if (part.type !== 'text' || at < 0) {
                content.push(part)
                continue
            }
            call ??= toolCallFromMarkup(part.text.slice(at), params, result.finishReason.unified === 'length')
            const before = part.text.slice(0, at).trimEnd()
            if (before) content.push({ ...part, text: before })
        }
        if (call === 'failed') return { ...result, content: [...content, { type: 'text', text: (content.some(part => part.type === 'text') ? '\n\n' : '') + FAILED_CALL_REPLY }] }
        if (!call || call === 'skipped') return { ...result, content }
        return { ...result, content: [...content, call], finishReason: { ...result.finishReason, unified: 'tool-calls' } }
    },

    wrapStream: async ({ doStream, params }) => {
        const result = await doStream()
        let textStart: StreamPart | null = null // начало текста отдаём, только когда есть что показать
        let started = false
        let shown = false // в этом шаге пользователь уже видел текст
        let pending = '' // ещё не отданный текст: пробелы в начале или возможное начало разметки
        let markup: string | null = null
        const stream = result.stream.pipeThrough(new TransformStream<StreamPart, StreamPart>({
            transform(part, controller) {
                const show = (id: string, text: string) => {
                    if (!text) return
                    if (!started && textStart) controller.enqueue(textStart)
                    started = true
                    shown = true
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
                    const call = toolCallFromMarkup(markup, params, part.finishReason.unified === 'length')
                    markup = null
                    if (call === 'failed') {
                        const id = `text-${generateId()}`
                        controller.enqueue({ type: 'text-start', id })
                        controller.enqueue({ type: 'text-delta', id, delta: (shown ? '\n\n' : '') + FAILED_CALL_REPLY })
                        controller.enqueue({ type: 'text-end', id })
                    } else if (call !== 'skipped') {
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
