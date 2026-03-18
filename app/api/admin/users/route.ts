import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Create a Supabase client with the Service Role Key to bypass RLS and use Admin Auth methods
const getAdminSupabase = () => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error('Отсутствует SUPABASE_SERVICE_ROLE_KEY в .env.local')
    }
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
    try {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll() { },
                },
            }
        )

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user) return null

        const adminClient = getAdminSupabase()

        // Fallback: If `profiles` table does not exist or user plays a normal role, 
        // return null. We gracefully handle table absence by catching the error.
        const { data: profile, error: dbError } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (dbError || profile?.role !== 'admin') {
            return null
        }

        return user
    } catch (error) {
        console.error('Verify admin error:', error)
        return null
    }
}

// GET all users (profiles)
export async function GET() {
    try {
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
        const adminUser = await verifyAdmin()
        if (!adminUser) {
            return NextResponse.json({ error: 'Нет доступа (требуются права addmin)' }, { status: 403 })
        }

        const body = await request.json()
        const { email, password, modules, role } = body

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
                modules: modules || [],
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
        const adminUser = await verifyAdmin()
        if (!adminUser) {
            return NextResponse.json({ error: 'Нет доступа (требуются права admin)' }, { status: 403 })
        }

        const body = await request.json()
        const { id, modules, role } = body

        if (!id) {
            return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
        }

        const adminClient = getAdminSupabase()
        const { data, error } = await adminClient
            .from('profiles')
            .update({
                modules: modules || [],
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
