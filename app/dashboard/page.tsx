"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { AIChatbot } from "@/components/dashboard/ai-chatbot"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Bot, LayoutDashboard, Truck, AlertTriangle, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type DashboardView = "general" | "cleaning" | "incidents" | "predictions"

const DASHBOARDS = [
  {
    id: "general" as const,
    label: "Общая статистика",
    icon: LayoutDashboard,
    url: "https://smnt.dabdi.online/superset/dashboard/2?standalone=2&expand_filters=0"
  },
  {
    id: "cleaning" as const,
    label: "Эффективность уборки",
    icon: Truck,
    url: "https://smnt.dabdi.online/superset/dashboard/2?standalone=2&expand_filters=0"
  },
  {
    id: "incidents" as const,
    label: "Инциденты",
    icon: AlertTriangle,
    url: "https://smnt.dabdi.online/superset/dashboard/2?standalone=2&expand_filters=0"
  },
  {
    id: "predictions" as const,
    label: "Прогнозы",
    icon: TrendingUp,
    url: "https://smnt.dabdi.online/superset/dashboard/2?standalone=2&expand_filters=0"
  }
]

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardView>("general")

  const currentDashboard = DASHBOARDS.find(d => d.id === activeView)

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

            <TabsContent value="dashboard" className="flex-1 min-h-0 flex gap-6">
              {/* Dashboard Sidebar */}
              <div className="w-64 flex-shrink-0 flex flex-col gap-2">
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
