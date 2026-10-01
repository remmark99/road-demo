import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readLicenseDetail } from '@/lib/licenses/server'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const auth = await createClient()
    const { data: { user }, error } = await auth.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401, headers })
    const { data: profile, error: profileError } = await auth.from('profiles').select('role').eq('id', user.id).single()
    if (profileError || profile?.role !== 'admin') return NextResponse.json({ error: 'Требуются права администратора' }, { status: 403, headers })
    const { id } = await context.params
    const detail = await readLicenseDetail(id)
    if (!detail) return NextResponse.json({ error: 'Лицензия не найдена' }, { status: 404, headers })
    return NextResponse.json(detail, { headers })
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить состав лицензии.' }, { status: 503, headers })
  }
}
