"use client"

import { Navigation } from "@/components/navigation"
import { AIChatbot } from "@/components/dashboard/ai-chatbot"
import { Bot } from "lucide-react"

export default function AIAssistantPage() {
  return (
    <main className="h-screen w-full bg-background flex flex-col">
      <Navigation />

      <div className="flex-1 pt-14 overflow-hidden">
        <div className="h-full w-full px-4 md:px-8 py-6 flex flex-col">
          <div className="mb-4 flex-none">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              AI-ассистент
            </h1>
            <p className="text-muted-foreground mt-1">
              Интеллектуальный анализ дорожной ситуации
            </p>
          </div>

          <div className="flex-1 min-h-0">
            <AIChatbot fullHeight />
          </div>
        </div>
      </div>
    </main>
  )
}
