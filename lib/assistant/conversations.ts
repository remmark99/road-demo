import type { SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'

/** История диалогов ассистента: таблица public.assistant_conversations (sql/assistant_conversations.sql). */

export const MAX_STORED_MESSAGES = 200
const MAX_TEXT_CHARS = 20_000
const TITLE_CHARS = 80
/** Отчёты и графики в истории: самые новые, в пределах лимита размера диалога. */
const MAX_STORED_REPORT_CHARS = 1_200_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ConversationSummary { id: string; title: string; updated_at: string }

export function isConversationId(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value)
}

/** Вывод, который нужен окну чата и после перезагрузки: отчёт (кнопки скачивания) или график. */
function keptOutput(tool: { type: string; state?: string; output?: { report?: unknown; chart?: unknown } }) {
    if (tool.state !== 'output-available' || !tool.output) return null
    if (tool.type === 'tool-create_report' && tool.output.report) return { report: tool.output.report }
    if (tool.type === 'tool-create_chart' && tool.output.chart) return { chart: tool.output.chart }
    return null
}

/**
 * Что храним: текст и шаги с инструментами без их входов и выводов —
 * для продолжения разговора модели нужен только текст, а выводы бывают большими.
 * Исключение — готовые отчёты и графики: их видно и можно скачать из истории.
 */
export function storableMessages(messages: UIMessage[]): UIMessage[] {
    let reportBudget = MAX_STORED_REPORT_CHARS
    const keptReports = new Set<unknown>()
    for (const message of [...messages.slice(-MAX_STORED_MESSAGES)].reverse()) {
        for (const part of [...message.parts].reverse()) {
            const tool = part as { type: string; state?: string; output?: { report?: unknown; chart?: unknown } }
            const kept = keptOutput(tool)
            if (!kept) continue
            const size = JSON.stringify(kept).length
            if (size <= reportBudget) { reportBudget -= size; keptReports.add(part) }
        }
    }
    return messages.slice(-MAX_STORED_MESSAGES).flatMap(message => {
        if (message.role !== 'user' && message.role !== 'assistant') return []
        const parts: unknown[] = []
        for (const part of message.parts) {
            if (part.type === 'text') parts.push({ type: 'text', text: part.text.slice(0, MAX_TEXT_CHARS) })
            else if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                const tool = part as { type: string; toolCallId?: string; toolName?: string; state?: string }
                const state = tool.state === 'output-error' ? 'output-error' : 'output-available'
                const output = keptReports.has(part) ? keptOutput(part as { type: string; state?: string; output?: { report?: unknown; chart?: unknown } }) : null
                parts.push({ type: tool.type, toolCallId: tool.toolCallId ?? '', ...(tool.toolName ? { toolName: tool.toolName } : {}), state, input: {}, output, ...(state === 'output-error' ? { errorText: 'Ошибка' } : {}) })
            }
        }
        return parts.length ? [{ id: message.id, role: message.role, parts: parts as UIMessage['parts'] }] : []
    })
}

/** Заголовок — начало первого вопроса. */
export function conversationTitle(messages: UIMessage[]): string {
    const first = messages.find(m => m.role === 'user')
    const text = first?.parts.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join(' ').replace(/\s+/g, ' ').trim() ?? ''
    if (!text) return 'Новый диалог'
    return text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS - 1).trimEnd()}…` : text
}

/** Сохранение после ответа: от имени пользователя, права проверяет RLS. Ошибка не мешает ответу. */
export async function saveConversation(db: SupabaseClient, userId: string, id: string, messages: UIMessage[]) {
    const stored = storableMessages(messages)
    if (!stored.length) return
    const { error } = await db.from('assistant_conversations').upsert({
        id, user_id: userId, title: conversationTitle(stored), messages: stored, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) console.error('Assistant conversation save failed:', error.code ?? error.message)
}
