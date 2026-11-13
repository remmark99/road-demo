import { createClient } from '@/lib/supabase/server'

/** Ассистент работает с данными остановок: нужен вход и модуль «Остановки» (или роль администратора). */
export async function assistantUser() {
    const db = await createClient()
    const { data: { user }, error } = await db.auth.getUser()
    if (error || !user) return { status: 401 as const }
    const profile = await db.from('profiles').select('role,modules').eq('id', user.id).single()
    if (profile.error || !profile.data || (profile.data.role !== 'admin' && !profile.data.modules?.includes('stops'))) {
        return { status: 403 as const }
    }
    return { status: 200 as const, db, user }
}
