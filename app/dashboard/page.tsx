"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { AIChatbot } from "@/components/dashboard/ai-chatbot"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Bot, Activity, Grid3X3, Users, CloudRain, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type DashboardView = "general" | "cleaning" | "incidents" | "predictions"

const DASHBOARDS = [
  {
    id: "general" as const,
    label: "Текущее состояние",
    icon: Activity,
    url: "https://smnt.dabdi.online/superset/dashboard/3?standalone=2&expand_filters=0"
  },
  {
    id: "cleaning" as const,
    label: "Матрица эффективности",
    icon: Grid3X3,
    url: "https://smnt.dabdi.online/superset/dashboard/4?standalone=2&expand_filters=0"
  },
  {
    id: "incidents" as const,
    label: "Подрядчики",
    icon: Users,
    url: "https://smnt.dabdi.online/superset/dashboard/5?standalone=2&expand_filters=0"
  },
  {
    id: "predictions" as const,
    label: "Влияние осадков",
    icon: CloudRain,
    url: "https://smnt.dabdi.online/superset/dashboard/6?standalone=2&expand_filters=0"
  },
  {
    id: "city" as const,
    label: "Город",
    icon: Building2,
    url: "https://smnt.dabdi.online/superset/dashboard/7?standalone=2&expand_filters=0"
  }
]

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardView>("general")


  return (
    <main className="h-screen w-full bg-background flex flex-col">
      <Navigation />

      <div className="flex-1 pt-14 overflow-hidden">
        <div className="h-full w-full px-4 md:px-8 py-6 flex flex-col">
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

            <TabsContent value="dashboard" className="flex-1 min-h-0 flex flex-col md:flex-row gap-6">
              {/* Dashboard Sidebar */}
              <div className="w-full md:w-64 flex-shrink-0 flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto pb-2 md:pb-0">
                {DASHBOARDS.map((dashboard) => (
                  <Button
                    key={dashboard.id}
                    variant={activeView === dashboard.id ? "default" : "ghost"}
                    className={cn(
                      "justify-start gap-3 h-auto py-3",
                      activeView === dashboard.id && "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                    onClick={() => setActiveView(dashboard.id)}
                  >
                    <dashboard.icon className="h-4 w-4" />
                    <span>{dashboard.label}</span>
                  </Button>
                ))}
              </div>

              {/* Dashboard Content */}
              <div className="flex-1 rounded-lg border overflow-hidden bg-background shadow-sm relative">
                {DASHBOARDS.map((dashboard) => (
                  <iframe
                    key={dashboard.id}
                    src={dashboard.url}
                    className={cn(
                      "w-full h-full border-0 absolute inset-0",
                      activeView === dashboard.id ? "z-10" : "z-0 invisible"
                    )}
                    title={dashboard.label}
                    loading="lazy"
                  />
                ))}
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
