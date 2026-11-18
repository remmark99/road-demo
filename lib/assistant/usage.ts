import type { SupabaseClient } from '@supabase/supabase-js'
import type { LanguageModelUsage } from 'ai'
import {
    DEFAULT_MONTHLY_LIMIT_TOKENS, LIMIT_MAX_TOKENS, LIMIT_MIN_TOKENS, monthWindow, type AssistantUsageSummary,
} from './usage-shared'

/**
 * Учёт токенов ИИ-ассистента: сколько занял каждый ответ (вход и выход модели)
 * и сколько ушло за месяц. Таблицы — sql/assistant_usage.sql; пока их нет,
 * счётчик копится в памяти сервера, чтобы лимит работал хотя бы до перезапуска.
 */

/** Токены ответа: вход и выход модели за все шаги. */
export function usageTokens(usage: Partial<LanguageModelUsage> | undefined): number {
    if (!usage) return 0
    return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
}

function defaultLimit() {
    const value = Number(process.env.ASSISTANT_MONTHLY_LIMIT_TOKENS)
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MONTHLY_LIMIT_TOKENS
}

/** Запасной учёт, пока миграция не применена: живёт до перезапуска сервера. */
const memory = { month: '', tokens: 0, requests: 0, limit: null as number | null }

function memoryMonth(month: string) {
    if (memory.month !== month) Object.assign(memory, { month, tokens: 0, requests: 0 })
    return memory
}

function missingTable(error: { code?: string; message?: string } | null) {
    return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message ?? '')))
}

let warned = false
function warnFallback(error: { code?: string; message?: string } | null) {
    if (warned) return
    warned = true
    console.warn('Assistant usage tables unavailable, counting in memory:', error?.code ?? error?.message ?? 'unknown')
}

async function isAdmin(db: SupabaseClient, userId: string | undefined) {
    if (!userId) return false
    const { data } = await db.from('profiles').select('role').eq('id', userId).maybeSingle()
    return data?.role === 'admin'
}

export async function readUsageSummary(db: SupabaseClient, userId: string | undefined, now = Date.now()): Promise<AssistantUsageSummary> {
    const window = monthWindow(now)
    const [settings, spend, canEdit] = await Promise.all([
        db.from('assistant_settings').select('monthly_limit_tokens').eq('id', 1).maybeSingle(),
        db.rpc('assistant_usage_month', { p_from: new Date(window.from).toISOString(), p_to: new Date(window.to).toISOString() }),
        isAdmin(db, userId),
    ])
    const persisted = !missingTable(settings.error) && !missingTable(spend.error)
    if (!persisted) warnFallback(settings.error ?? spend.error)
    const local = memoryMonth(window.month)
    const row = Array.isArray(spend.data) ? spend.data[0] as { tokens?: number | string; requests?: number | string } | undefined : undefined
    const spentTokens = persisted ? Number(row?.tokens ?? 0) : local.tokens
    const requests = persisted ? Number(row?.requests ?? 0) : local.requests
    const limitTokens = persisted && settings.data ? Number(settings.data.monthly_limit_tokens) : memory.limit ?? defaultLimit()
    const elapsed = (now - window.from) / (window.to - window.from)
    return {
        month: window.month,
        resetsAt: new Date(window.to).toISOString(),
        spentTokens,
        limitTokens,
        requests,
        // В первые сутки темп ещё ничего не говорит.
        forecastTokens: now - window.from > 86_400_000 && elapsed > 0 ? Math.round(spentTokens / elapsed) : null,
        canEdit,
        persisted,
    }
}

export interface UsageEntry {
    conversationId?: string | null
    source: 'chat' | 'report'
    usage: Partial<LanguageModelUsage> | undefined
}

/** Запись расхода от имени пользователя (RLS: только свои строки). Ошибка не мешает ответу. */
export async function recordUsage(db: SupabaseClient, userId: string, entry: UsageEntry, now = Date.now()) {
    const tokens = usageTokens(entry.usage)
    const { error } = await db.from('assistant_usage').insert({
        user_id: userId,
        conversation_id: entry.conversationId ?? null,
        source: entry.source,
        model: process.env.ASSISTANT_LLM_MODEL ?? null,
        input_tokens: entry.usage?.inputTokens ?? 0,
        output_tokens: entry.usage?.outputTokens ?? 0,
    })
    if (error) {
        if (!missingTable(error)) console.error('Assistant usage save failed:', error.code ?? error.message)
        else warnFallback(error)
        const local = memoryMonth(monthWindow(now).month)
        local.tokens += tokens
        local.requests += 1
    }
    return tokens
}

export class LimitInputError extends Error {}

/** Новый месячный лимит токенов — только администратор (проверяет и RLS). */
export async function updateMonthlyLimit(db: SupabaseClient, userId: string, value: unknown) {
    const limit = Number(value)
    if (!Number.isFinite(limit) || limit < LIMIT_MIN_TOKENS || limit > LIMIT_MAX_TOKENS) {
        throw new LimitInputError(`Лимит — от ${LIMIT_MIN_TOKENS / 1_000_000} до ${LIMIT_MAX_TOKENS / 1_000_000} млн токенов`)
    }
    if (!await isAdmin(db, userId)) return { status: 403 as const }
    const rounded = Math.round(limit)
    const { error } = await db.from('assistant_settings')
        .upsert({ id: 1, monthly_limit_tokens: rounded, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) {
        if (!missingTable(error)) throw error
        warnFallback(error)
        memory.limit = rounded
    }
    return { status: 200 as const, summary: await readUsageSummary(db, userId) }
}
