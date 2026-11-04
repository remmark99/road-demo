/** Select the customer API without tying browsers to a private or public host. */
export function getSupabaseUrl(): string {
    if (process.env.NEXT_PUBLIC_SUPABASE_SAME_ORIGIN === 'true' && typeof window !== 'undefined') {
        return window.location.origin
    }
    return process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
}

export function getSupabaseCookieOptions() {
    const name = process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
    return name ? { name } : undefined
}

export function localStorageUrl(value: string, origin: string, canonicalUrl: string): string {
    try {
        const url = new URL(value)
        const canonical = new URL(canonicalUrl)
        if (url.pathname.startsWith('/storage/v1/') &&
            (url.hostname === canonical.hostname || ['kong', 'supabase-replica-kong'].includes(url.hostname))) {
            return origin + url.pathname + url.search + url.hash
        }
    } catch { /* Relative paths and ordinary strings need no conversion. */ }
    return value
}

export function localStorageData(value: unknown, origin: string, canonicalUrl: string): unknown {
    if (typeof value === 'string') return localStorageUrl(value, origin, canonicalUrl)
    if (Array.isArray(value)) return value.map(item => localStorageData(item, origin, canonicalUrl))
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localStorageData(item, origin, canonicalUrl)]))
    }
    return value
}

export async function sameOriginSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init)
    if (typeof window === 'undefined' || !response.headers.get('content-type')?.includes('application/json')) return response
    if (!response.body || response.status === 204) return response
    const body = await response.json()
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')
    return new Response(JSON.stringify(localStorageData(body, window.location.origin, process.env.NEXT_PUBLIC_SUPABASE_URL!)), {
        status: response.status, statusText: response.statusText, headers,
    })
}
