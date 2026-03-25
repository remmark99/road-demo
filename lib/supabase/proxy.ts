import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

    // Wrap getUser in a timeout to prevent hanging when Supabase is slow
    let user = null
    try {
        const result = await Promise.race([
            supabase.auth.getUser(),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Auth timeout')), 5000)
            ),
        ])
        user = result.data.user
    } catch {
        // Timeout or network error — treat as no user (will redirect to login)
        console.warn('[middleware] auth.getUser() timed out or failed')
    }

    if (
        !user &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/landing') &&
        !request.nextUrl.pathname.startsWith('/api')
    ) {
        // No user, redirect to login page
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is.
    // If you're creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it
    // 2. Copy over the cookies
    // 3. Change the myNewResponse object to fit your needs
    // 4. Return it
    return supabaseResponse
}
