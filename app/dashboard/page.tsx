"use client"

import { Navigation } from "@/components/navigation"

import { AIChatbot } from "@/components/dashboard/ai-chatbot"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Bot } from "lucide-react"

export default function DashboardPage() {
  return (
    <main className="h-screen w-full bg-background flex flex-col">
      <Navigation />

      <div className="flex-1 pt-14 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto p-6 flex flex-col">
          <div className="mb-6 flex-none">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Аналитика
            </h1>
            <p className="text-muted-foreground mt-1">
              Статистика и AI-анализ состояния дорог
            </p>
          </div>

          <Tabs defaultValue="dashboard" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mb-6 w-max">
              <TabsTrigger value="dashboard" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Дашборд
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-2">
                <Bot className="h-4 w-4" />
                AI-ассистент
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="flex-1 min-h-0">
              <div className="w-full h-full rounded-lg border overflow-hidden bg-background shadow-sm">
                <iframe
                  src="https://smnt.dabdi.online/superset/dashboard/2?standalone=2&expand_filters=0"
                  className="w-full h-full border-0"
                  title="Superset Dashboard"
                  loading="lazy"
                />
              </div>
            </TabsContent>

            <TabsContent value="ai" className="flex-1 min-h-0 overflow-visible">
              <AIChatbot />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}
