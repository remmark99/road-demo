import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Navigation } from "@/components/navigation"
import { AssistantPreview } from "@/components/assistant/assistant-preview"

export const metadata: Metadata = {
    title: "ИИ-ассистент — прототип",
    robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function AssistantPreviewPage() {
    // Прототип с условными данными. Открывается только там, где это явно включено,
    // на боевом сайте без переменной ASSISTANT_PREVIEW страницы нет.
    if (process.env.ASSISTANT_PREVIEW !== "1") notFound()
    return (
        <main className="h-dvh w-full overflow-hidden bg-background">
            <Navigation />
            <div className="h-full pt-14">
                <AssistantPreview />
            </div>
        </main>
    )
}
