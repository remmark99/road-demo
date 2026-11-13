import type { SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'

/** История диалогов ассистента: таблица public.assistant_conversations (sql/assistant_conversations.sql). */

export const MAX_STORED_MESSAGES = 200
const MAX_TEXT_CHARS = 20_000
const TITLE_CHARS = 80
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ConversationSummary { id: string; title: string; updated_at: string }

export function isConversationId(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value)
}

/**
 * Что храним: текст и шаги с инструментами без их входов и выводов —
 * для продолжения разговора модели нужен только текст, а выводы бывают большими.
 */
export function storableMessages(messages: UIMessage[]): UIMessage[] {
    return messages.slice(-MAX_STORED_MESSAGES).flatMap(message => {
        if (message.role !== 'user' && message.role !== 'assistant') return []
        const parts: unknown[] = []
        for (const part of message.parts) {
            if (part.type === 'text') parts.push({ type: 'text', text: part.text.slice(0, MAX_TEXT_CHARS) })
            else if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                const tool = part as { type: string; toolCallId?: string; toolName?: string; state?: string }
                const state = tool.state === 'output-error' ? 'output-error' : 'output-available'
                parts.push({ type: tool.type, toolCallId: tool.toolCallId ?? '', ...(tool.toolName ? { toolName: tool.toolName } : {}), state, input: {}, output: null, ...(state === 'output-error' ? { errorText: 'Ошибка' } : {}) })
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
