import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api/map (локальная подложка карты: сотни тайлов за сессию, и каждый
         *   прошёл бы через supabase.auth.getUser() — сессия им не нужна)
         * - Static assets (svg, png, jpg, etc.)
         */
        '/((?!_next/static|_next/image|favicon.ico|api/map/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf|woff|woff2|ttf|otf|eot)$).*)',
    ],
}
