"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { BarChart3, Activity, Grid3X3, Users, CloudRain, Building2, ExternalLink, Thermometer } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GlossaryDialog } from "@/components/dashboard/glossary-dialog"

type DashboardView = "general" | "cleaning" | "incidents" | "predictions" | "city"

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
          <div className="mb-4 flex-none">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Аналитика
            </h1>
            <p className="text-muted-foreground mt-1">
              Статистика и мониторинг состояния дорог
            </p>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6">
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

              {/* Weather Monitoring Reference */}
              <div className="hidden md:block mt-4 pt-4 border-t border-border">
                <a
                  href="https://meteor.admsurgut.ru/ru/meteogram"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 rounded-lg bg-gradient-to-br from-sky-500/10 via-blue-500/10 to-indigo-500/10 border border-sky-500/20 hover:border-sky-500/40 transition-all hover:shadow-lg hover:shadow-sky-500/10 group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="h-5 w-5 text-sky-400" />
                    <span className="text-sm font-semibold text-foreground">Метеомониторинг</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto group-hover:text-sky-400 transition-colors" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Данные об осадках получены из системы метеомониторинга г. Сургут
                  </p>
                  <div className="mt-2 text-xs text-sky-400 font-medium">
                    meteor.admsurgut.ru →
                  </div>
                </a>
              </div>

              {/* Glossary Button */}
              <div className="hidden md:block mt-auto pt-4">
                <GlossaryDialog />
              </div>
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
          </div>
        </div>
      </div>
    </main>
  )
}
