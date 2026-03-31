"use client"

import { Navigation } from "@/components/navigation"
import { AIChatbot } from "@/components/dashboard/ai-chatbot"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { BarChart3, Bot, Route, ShieldCheck } from "lucide-react"

const MODULE_BADGES = ["Дороги", "Остановки", "Берег", "Парк", "Транспорт"]

const VALUE_CARDS = [
  {
    title: "5 модулей",
    description: "Единый вход в платформенную аналитику и пояснения по метрикам.",
    icon: BarChart3,
  },
  {
    title: "Честный режим",
    description: "Без выдуманных значений, если пользователь не прислал данные.",
    icon: ShieldCheck,
  },
  {
    title: "Инструменты и разбор",
    description: "Для фактических дорожных запросов и осмысленных пояснений по модулям.",
    icon: Route,
  },
]

export default function AIAssistantPage() {
  return (
    <main className="min-h-screen w-full bg-background">
      <Navigation />

      <div className="pt-14">
        <div className="w-full px-4 py-4 md:px-8 md:py-5">
          <Card className="mb-3 flex-none overflow-hidden border-border/60 bg-gradient-to-br from-background via-background to-muted/40 shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)] xl:items-stretch">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                    Ассистент платформы
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-[2rem]">
                    ИИ-Ассистент
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                    Интеллектуальный анализ модулей платформы и показателей аналитики. Помогает
                    разобраться в дорожных данных, остановках, береговых и парковых модулях, а также
                    в транспортных отклонениях без лишней технической терминологии.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {MODULE_BADGES.map((label) => (
                      <Badge
                        key={label}
                        variant="outline"
                        className="rounded-full border-border/60 bg-background/80 px-3 py-1 text-xs font-medium"
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {VALUE_CARDS.map(({ title, description, icon: Icon }) => (
                    <div
                      key={title}
                      className="flex min-h-[136px] flex-col rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm backdrop-blur"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
                        <p className="text-sm font-semibold leading-5">{title}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="pb-6">
            <AIChatbot pageScrollable initialQuestionsCollapsed={false} />
          </div>
        </div>
      </div>
    </main>
  )
}
