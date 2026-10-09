import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isStopSensorsOnly, STOP_SENSORS_API_PREFIXES } from '@/lib/access-scope'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Do not run code between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (
        !user &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/landing') &&
        !request.nextUrl.pathname.startsWith('/api')
    ) {
        // No user, redirect to landing page
        const url = request.nextUrl.clone()
        url.pathname = '/landing'
        return NextResponse.redirect(url)
    }

    // Учётка «только датчики остановок»: страница карты и её API, остальное закрыто.
    if (isStopSensorsOnly(user)) {
        const path = request.nextUrl.pathname
        const isAllowedApi = STOP_SENSORS_API_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
        if (path.startsWith('/api') && !isAllowedApi) {
            return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
        }
        if (!path.startsWith('/api') && path !== '/' && !path.startsWith('/login') && !path.startsWith('/auth')) {
            const url = request.nextUrl.clone()
            url.pathname = '/'
            url.search = ''
            return NextResponse.redirect(url)
        }
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is.
    // If you're creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it
    // 2. Copy over the cookies
    // 3. Change the myNewResponse object to fit your needs
    // 4. Return it
    return supabaseResponse
}
