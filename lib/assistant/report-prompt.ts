import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_REPORT_PROMPT_CHARS } from './limits'

/** Postgres: колонки ещё нет — миграция sql/profiles_report_prompt.sql не применена. */
export const UNDEFINED_COLUMN = '42703'

/** «Запрос для отчёта» пользователя; без колонки или при ошибке — пусто, ассистент работает без него. */
export async function readReportPrompt(db: SupabaseClient, userId: string): Promise<string | null> {
    const { data, error } = await db.from('profiles').select('report_prompt').eq('id', userId).maybeSingle()
    if (error) {
        if (error.code !== UNDEFINED_COLUMN) console.error('Report prompt read failed:', error.code ?? error.message)
        return null
    }
    const value = (data as { report_prompt?: unknown } | null)?.report_prompt
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_REPORT_PROMPT_CHARS) : null
}

const DEFAULT_REPORT_REQUEST = 'Сводный отчёт о состоянии остановочных павильонов: оборудование и его связь, события безопасности, '
    + 'температура и влажность, урны, пассажиропоток; главные проблемы и рекомендации.'

/** Вопрос ассистенту для отчёта из настроек: период и пожелания пользователя (без них — сводный отчёт). */
export function reportQuestion(from: string, to: string, wish: string | null | undefined): string {
    const text = (wish ?? '').trim().slice(0, MAX_REPORT_PROMPT_CHARS)
    return `Сделай отчёт за период с ${from} по ${to} включительно (даты по Сургуту).\n\n${text || DEFAULT_REPORT_REQUEST}`
}
