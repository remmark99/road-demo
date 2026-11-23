import { getSupabaseUrl } from '@/lib/supabase/endpoint'
import { getActiveLicense } from '@/lib/license'
import { moduleNames, partitionModules, withDemoModules } from '@/lib/license-modules'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Create a Supabase client with the Service Role Key to bypass RLS and use Admin Auth methods
const getAdminSupabase = () => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error('Отсутствует SUPABASE_SERVICE_ROLE_KEY в .env.local')
    }
    return createSupabaseClient(
        getSupabaseUrl(),
        serviceRoleKey,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}

// Ensure the request is coming from an authenticated admin
const verifyAdmin = async () => {
    const supabase = await createClient()
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser()

    if (authError && (authError.status === 0 || (authError.status ?? 0) >= 500)) throw authError
    if (authError || !user) {
        return { denial: NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 }) }
    }

    const adminClient = getAdminSupabase()
    const { data: profile, error: dbError } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

    if (dbError) throw dbError
    if (profile?.role !== 'admin') {
        return { denial: NextResponse.json({ error: 'Нет доступа (требуются права admin)' }, { status: 403 }) }
    }

    return { userId: user.id }
}

/**
 * Модули, которые инстанс вправе выдать: подписанная лицензия плюс демо-модули
 * (`LICENSE_DEMO_MODULES`, если переменная задана на сервере). null — лицензия
 * недействительна или отсутствует.
 */
const entitledModules = (): string[] | null => {
    const license = getActiveLicense()
    if (!license) return null
    return withDemoModules(license.modules, process.env.LICENSE_DEMO_MODULES).modules
}

/**
 * Заказчик покупает модули, а не «всё, что есть в интерфейсе», поэтому доступы
 * сверяются с лицензией на сервере, а не только в интерфейсе.
 *
 * Выданный вне лицензии модуль не работает: либо воркеры бэкенда падают на
 * `require_module(...)`, либо раздел просто не виден оператору (интерфейс режет
 * модули по лицензии) — то есть выглядит как поломка платформы. Отсюда отказ:
 * `outsideLicense` — не куплено, `unknown` — не модуль вообще.
 *
 * Возвращает либо проверенный список, либо готовый отказ.
 */
const validateModules = (modules: unknown): { modules: string[] } | { denial: NextResponse } => {
    const requested = Array.isArray(modules)
        ? modules.filter((module): module is string => typeof module === 'string')
        : []

    const licensed = entitledModules()
    if (licensed === null) {
        return {
            denial: NextResponse.json(
                { error: 'Лицензия недействительна или отсутствует — выдача доступов недоступна' },
                { status: 403 }
            ),
        }
    }

    const { allowed, outsideLicense, unknown } = partitionModules(requested, licensed)

    if (unknown.length > 0) {
        return {
            denial: NextResponse.json(
                { error: `Неизвестный модуль: ${moduleNames(unknown)}` },
                { status: 400 }
            ),
        }
    }

    if (outsideLicense.length > 0) {
        return {
            denial: NextResponse.json(
                {
                    error: `В лицензию не входит: ${moduleNames(outsideLicense)}. Доступно: ${moduleNames(licensed)}.`,
                    modules_outside_license: outsideLicense,
                    modules_licensed: licensed,
                },
                { status: 403 }
            ),
        }
    }

    return { modules: allowed }
}

// GET all users (profiles)
export async function GET() {
    try {
        const { denial } = await verifyAdmin()
        if (denial) return denial

        const adminClient = getAdminSupabase()

        // 1. For safety in demo without strict DB schema, we fetch profiles.
        const { data: profiles, error } = await adminClient
            .from('profiles')
            .select('*')
            .order('email', { ascending: true })

        if (error) {
            if (error.code === '42P01') {
                return NextResponse.json(
                    { error: 'Таблица profiles не найдена в БД. Выполните SQL-команду.' },
                    { status: 500 }
                )
            }
            throw error
        }

        return NextResponse.json(profiles || [])
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST create a new user
export async function POST(request: Request) {
    try {
        const { denial } = await verifyAdmin()
        if (denial) return denial

        const body = await request.json()
        const { email, password, modules, role } = body

        // Проверяем доступы до создания учётки: иначе отказ по лицензии оставлял бы
        // в auth.users пользователя, которому всё равно ничего не выдали.
        const access = validateModules(modules)
        if ('denial' in access) return access.denial

        const adminClient = getAdminSupabase()

        // 1. Create the user in Auth
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })

        if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 400 })
        }

        // 2. The database trigger on auth.users will create a profile.
        // Wait briefly to allow the trigger to finish, or update directly.
        // To be safe, we explicitly update the profile that the trigger just created.
        const { error: updateError } = await adminClient
            .from('profiles')
            .update({
                role: role || 'user',
                modules: access.modules,
            })
            .eq('id', authData.user.id)

        if (updateError) {
            console.error("Profile update error: ", updateError);
            // We don't fail the request completely because the user was created.
        }

        return NextResponse.json({ user: authData.user })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// PUT update an existing user's modules and role
export async function PUT(request: Request) {
    try {
        const { denial } = await verifyAdmin()
        if (denial) return denial

        const body = await request.json()
        const { id, modules, role } = body

        if (!id) {
            return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
        }

        const access = validateModules(modules)
        if ('denial' in access) return access.denial

        const adminClient = getAdminSupabase()
        const { data, error } = await adminClient
            .from('profiles')
            .update({
                modules: access.modules,
                role: role || 'user',
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// profiles.id is a uuid, and Postgres compares uuid values without regard to case
// or hyphenation. The requested id is therefore canonicalised and format-checked
// before it is used by the guards or in the service-role request.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// DELETE permanently remove a user account (auth user + cascading profile data)
export async function DELETE(request: Request) {
    try {
        const { denial, userId } = await verifyAdmin()
        if (denial) return denial

        // Accept the target id from a JSON body (like PUT) or a ?id= query parameter.
        let id = ''
        try {
            const body = await request.json()
            if (body && typeof body.id === 'string') id = body.id
        } catch {
            // No JSON body supplied; fall back to the query string below.
        }
        if (!id.trim()) {
            try {
                id = new URL(request.url).searchParams.get('id') || ''
            } catch {
                // request.url missing or malformed; treat as no id supplied.
            }
        }
        id = id.trim().toLowerCase()
        if (!id) {
            return NextResponse.json({ error: 'Не указан идентификатор пользователя для удаления' }, { status: 400 })
        }

        if (!UUID_PATTERN.test(id)) {
            return NextResponse.json({ error: 'Некорректный идентификатор пользователя' }, { status: 400 })
        }

        // An administrator must never lock themselves out.
        if (id === userId.toLowerCase()) {
            return NextResponse.json({ error: 'Нельзя удалить собственную учётную запись' }, { status: 403 })
        }

        const adminClient = getAdminSupabase()

        const { data: target, error: lookupError } = await adminClient
            .from('profiles')
            .select('id, role')
            .eq('id', id)
            .maybeSingle()

        if (lookupError) throw lookupError
        if (!target) {
            return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
        }

        // Authoritative self-check: compare the stored id, not the requested text,
        // so another encoding of the same uuid cannot slip past the guard above.
        if (String(target.id).toLowerCase() === userId.toLowerCase()) {
            return NextResponse.json({ error: 'Нельзя удалить собственную учётную запись' }, { status: 403 })
        }

        const { count, error: countError } = await adminClient
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'admin')

        if (countError) throw countError
        if (target.role === 'admin' && (count ?? 0) <= 1) {
            return NextResponse.json({ error: 'Нельзя удалить последнего администратора' }, { status: 409 })
        }

        // Deleting the auth user cascades to the profile and all dependent rows.
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(id)
        if (deleteError) {
            const status = deleteError.status ?? 0
            return NextResponse.json(
                { error: deleteError.message },
                { status: status >= 400 && status < 500 ? 400 : 500 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
