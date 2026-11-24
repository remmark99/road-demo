import { NextResponse } from "next/server"

import { getAuthenticatedUser } from "@/lib/notifications/http"
import { getStopLoadPayloadCached } from "@/lib/stop-load-analytics-data"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

function parseDateParam(value: string | null) {
    if (!value) return null

    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(request: Request) {
    // Ответ берётся из общего кэша процесса, а не читается под правами вызывающего:
    // поэтому вход проверяем здесь.
    if (!await getAuthenticatedUser()) {
        return NextResponse.json({ error: "Войдите в систему" }, { status: 401, headers: { "Cache-Control": "no-store" } })
    }

    const url = new URL(request.url)
    const from = parseDateParam(url.searchParams.get("from"))
    const to = parseDateParam(url.searchParams.get("to"))

    if (!from || !to || from.getTime() > to.getTime()) {
        return NextResponse.json(
            { error: "Expected valid from/to ISO date parameters." },
            { status: 400 },
        )
    }

    try {
        const payload = await getStopLoadPayloadCached(await createClient(), from, to)

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "private, max-age=30",
            },
        })
    } catch (error) {
        console.error("Error fetching stop load analytics:", error)

        return NextResponse.json(
            { error: 'Не удалось загрузить пассажирскую аналитику. Попробуйте ещё раз.' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        )
    }
}
