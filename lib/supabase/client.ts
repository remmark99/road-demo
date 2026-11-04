import { getSupabaseUrl, getSupabaseCookieOptions, sameOriginSupabaseFetch } from '@/lib/supabase/endpoint'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    return createBrowserClient(
        getSupabaseUrl(),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookieOptions: getSupabaseCookieOptions(),
            ...(process.env.NEXT_PUBLIC_SUPABASE_SAME_ORIGIN === 'true'
                ? { global: { fetch: sameOriginSupabaseFetch } } : {}),
        }
    )
}
