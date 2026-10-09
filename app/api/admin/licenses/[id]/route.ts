import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readLicenseDetail } from '@/lib/licenses/server'
import { LicenseEditError, updateLicense } from '@/lib/licenses/admin'
import { parseLicenseInput } from '@/lib/licenses/editor'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAdmin() {
  const auth = await createClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return { response: NextResponse.json({ error: 'Требуется вход' }, { status: 401, headers }) }
  const { data: profile, error: profileError } = await auth.from('profiles').select('role').eq('id', user.id).single()
  if (profileError || profile?.role !== 'admin') return { response: NextResponse.json({ error: 'Требуются права администратора' }, { status: 403, headers }) }
  return { user }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { response } = await requireAdmin()
    if (response) return response
    const { id } = await context.params
    const detail = await readLicenseDetail(id)
    if (!detail) return NextResponse.json({ error: 'Лицензия не найдена' }, { status: 404, headers })
    return NextResponse.json(detail, { headers })
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить состав лицензии.' }, { status: 503, headers })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireAdmin()
    if (response) return response
    const { id } = await context.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Лицензия не найдена' }, { status: 404, headers })
    const parsed = parseLicenseInput(await request.json().catch(() => null), 'update')
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400, headers })
    await updateLicense(id, parsed.value, `admin:${user.email || user.id}`)
    return NextResponse.json({ ok: true }, { headers })
  } catch (error) {
    if (error instanceof LicenseEditError) return NextResponse.json({ error: error.message }, { status: 400, headers })
    console.error('License update failed:', error)
    return NextResponse.json({ error: 'Не удалось сохранить лицензию. Проверьте подключение License DB.' }, { status: 503, headers })
  }
}
