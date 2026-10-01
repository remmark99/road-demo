import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readCustomerLicenses } from '@/lib/licenses/server'

export const dynamic = 'force-dynamic'
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const auth = await createClient()
    const { data: { user }, error } = await auth.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401, headers })
    // No customer/user ID is accepted from the request.
    return NextResponse.json(await readCustomerLicenses(user.id), { headers })
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить информацию о лицензии.' }, { status: 503, headers })
  }
}
