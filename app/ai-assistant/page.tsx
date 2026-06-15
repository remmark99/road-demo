"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { AIChatbot, type AssistantMode } from "@/components/dashboard/ai-chatbot"
import { Button } from "@/components/ui/button"
import { Bot, BusFront, Layers, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const MODE_OPTIONS: Array<{
  id: AssistantMode
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    id: "platform",
    title: "Платформа",
    description: "Все модули и общий аналитический контекст",
    icon: Layers,
  },
  {
    id: "stops",
    title: "Остановки",
    description: "Live-данные, события и плановые панели",
    icon: BusFront,
  },
]

export default function AIAssistantPage() {
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("platform")
  const activeMode = MODE_OPTIONS.find((mode) => mode.id === assistantMode) ?? MODE_OPTIONS[0]

  return (
    <main className="min-h-screen w-full bg-background">
      <Navigation />

      <div className="pt-14">
        <div className="flex h-[calc(100dvh-3.5rem)] min-h-[720px] w-full flex-col px-4 py-3 md:px-6">
          <div className="mb-3 flex flex-none flex-col gap-3 rounded-lg border border-border/70 bg-card/70 px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">ИИ-Ассистент</h1>
                  <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {activeMode.title}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
                  Чат для разбора аналитики платформы, показателей остановок, дорожных данных и событий без лишней технической витрины.
                </p>
              </div>
            </div>

            <div className="flex w-full shrink-0 rounded-lg border border-border/70 bg-muted/30 p-1 md:w-auto">
              {MODE_OPTIONS.map(({ id, title, description, icon: Icon }) => {
                const isActive = assistantMode === id

                return (
                  <Button
                    key={id}
                    type="button"
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "h-auto flex-1 justify-start gap-2 px-3 py-2 text-left md:min-w-44 md:flex-none",
                      !isActive && "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setAssistantMode(id)}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-4">{title}</span>
                      <span className="mt-0.5 hidden text-xs font-normal leading-4 opacity-80 sm:block">
                        {description}
                      </span>
                    </span>
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <AIChatbot
              key={activeMode.id}
              fullHeight
              initialQuestionsCollapsed
              assistantMode={activeMode.id}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
