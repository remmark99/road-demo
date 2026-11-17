import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { StopsVisionPreview } from "@/components/dashboard/stops-v2/preview-shell"

export const metadata: Metadata = {
    title: "Аналитика остановок — прототип",
    robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function AnalyticsPreviewPage() {
    // Прототип с условными данными. Открывается только там, где это явно включено,
    // на боевом сайте без переменной ANALYTICS_PREVIEW страницы нет.
    if (process.env.ANALYTICS_PREVIEW !== "1") notFound()
    return <StopsVisionPreview />
}
