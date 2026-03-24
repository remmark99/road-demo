"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import {
  BarChart3,
  Activity,
  Grid3X3,
  Users,
  CloudRain,
  Building2,
  ExternalLink,
  Thermometer,
  BusFront,
  Map,
  Users2,
  ShieldAlert,
  Hammer,
  ClipboardCheck,
  Heater,
  AlertCircle,
  ShieldCheck,
  LifeBuoy,
  Siren,
  Trash2,
  Route,
  DoorClosed,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useModuleAccess } from "@/components/providers/module-context"
import { GlossaryDialog } from "@/components/dashboard/glossary-dialog"
import { PassengerAnalytics } from "@/components/dashboard/passenger-analytics"
import { SecurityAnalytics } from "@/components/dashboard/security-analytics"
import { VandalismAnalytics } from "@/components/dashboard/vandalism-analytics"
import { ConditionAnalytics } from "@/components/dashboard/condition-analytics"
import { WarmStopAnalytics } from "@/components/dashboard/warmstop-analytics"
import { ShoreSecurityAnalytics } from "@/components/dashboard/shore-security-analytics"
import { ShoreSafetyAnalytics } from "@/components/dashboard/shore-safety-analytics"
import { ShoreEmergencyAnalytics } from "@/components/dashboard/shore-emergency-analytics"
import { ParkSecurityAnalytics } from "@/components/dashboard/park-security-analytics"
import { ParkOperationsAnalytics } from "@/components/dashboard/park-operations-analytics"
import { TransportRouteAnalytics } from "@/components/dashboard/transport-route-analytics"
import { TransportServiceAnalytics } from "@/components/dashboard/transport-service-analytics"
import { Skeleton } from "@/components/ui/skeleton"

type DashboardView =
  | "general"
  | "cleaning"
  | "incidents"
  | "predictions"
  | "city"
  | "kpi_bus_stops"
  | "districts"
  | "passenger"
  | "security"
  | "vandalism"
  | "condition"
  | "warmstop"
  | "shore_security"
  | "shore_safety"
  | "shore_emergency"
  | "park_security"
  | "park_operations"
  | "transport_route"
  | "transport_service"

const DASHBOARDS = [
  {
    id: "general" as const,
    label: "Текущее состояние",
    icon: Activity,
    url: "https://superset.board-coding.ru/superset/dashboard/3?standalone=2&expand_filters=0"
  },
  {
    id: "cleaning" as const,
    label: "Матрица эффективности",
    icon: Grid3X3,
    url: "https://superset.board-coding.ru/superset/dashboard/4?standalone=2&expand_filters=0"
  },
  {
    id: "incidents" as const,
    label: "Подрядчики",
    icon: Users,
    url: "https://superset.board-coding.ru/superset/dashboard/5?standalone=2&expand_filters=0"
  },
  {
    id: "predictions" as const,
    label: "Влияние осадков",
    icon: CloudRain,
    url: "https://superset.board-coding.ru/superset/dashboard/6?standalone=2&expand_filters=0"
  },
  {
    id: "city" as const,
    label: "Город",
    icon: Building2,
    url: "https://superset.board-coding.ru/superset/dashboard/7?standalone=2&expand_filters=0"
  },
  {
    id: "kpi_bus_stops" as const,
    label: "Показатели остановок",
    icon: BusFront,
    url: "https://superset.board-coding.ru/superset/dashboard/8?standalone=2&expand_filters=0"
  },
  {
    id: "districts" as const,
    label: "Районы",
    icon: Map,
    url: "https://superset.board-coding.ru/superset/dashboard/9?standalone=2&expand_filters=0"
  },
  {
    id: "passenger" as const,
    label: "Пассажирская аналитика",
    icon: Users2,
    component: PassengerAnalytics,
  },
  {
    id: "security" as const,
    label: "События безопасности",
    icon: ShieldAlert,
    component: SecurityAnalytics,
  },
  {
    id: "vandalism" as const,
    label: "Вандализм",
    icon: Hammer,
    component: VandalismAnalytics,
  },
  {
    id: "condition" as const,
    label: "Состояние остановок",
    icon: ClipboardCheck,
    component: ConditionAnalytics,
  },
  {
    id: "warmstop" as const,
    label: "Теплая остановка",
    icon: Heater,
    component: WarmStopAnalytics,
  },
  {
    id: "shore_security" as const,
    label: "Охрана периметра",
    icon: ShieldCheck,
    component: ShoreSecurityAnalytics,
  },
  {
    id: "shore_safety" as const,
    label: "Безопасность посетителей",
    icon: LifeBuoy,
    component: ShoreSafetyAnalytics,
  },
  {
    id: "shore_emergency" as const,
    label: "Критические ситуации",
    icon: Siren,
    component: ShoreEmergencyAnalytics,
  },
  {
    id: "park_security" as const,
    label: "Инциденты и безопасность",
    icon: ShieldAlert,
    component: ParkSecurityAnalytics,
  },
  {
    id: "park_operations" as const,
    label: "Эксплуатация территории",
    icon: Trash2,
    component: ParkOperationsAnalytics,
  },
  {
    id: "transport_route" as const,
    label: "Маршрутная дисциплина",
    icon: Route,
    component: TransportRouteAnalytics,
  },
  {
    id: "transport_service" as const,
    label: "Обслуживание остановок",
    icon: DoorClosed,
    component: TransportServiceAnalytics,
  }
] as const

const ROADS_DASHBOARDS = ["general", "cleaning", "incidents", "predictions", "city"]
const STOPS_DASHBOARDS = ["kpi_bus_stops", "districts", "passenger", "security", "vandalism", "condition", "warmstop"]
const SHORE_DASHBOARDS = ["shore_security", "shore_safety", "shore_emergency"]
const PARK_DASHBOARDS = ["park_security", "park_operations"]
const TRANSPORT_DASHBOARDS = ["transport_route", "transport_service"]

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardView>("general")
  const { hasModule, loading: modulesLoading } = useModuleAccess()

  const filteredDashboards = DASHBOARDS.filter(d => {
    if (ROADS_DASHBOARDS.includes(d.id)) return hasModule('roads')
    if (STOPS_DASHBOARDS.includes(d.id)) return hasModule('stops')
    if (SHORE_DASHBOARDS.includes(d.id)) return hasModule('shore')
    if (PARK_DASHBOARDS.includes(d.id)) return hasModule('parks')
    if (TRANSPORT_DASHBOARDS.includes(d.id)) return hasModule('transport')
    return true
  })

  const roadsDashboardsList = filteredDashboards.filter(d => ROADS_DASHBOARDS.includes(d.id))
  const stopsDashboardsList = filteredDashboards.filter(d => STOPS_DASHBOARDS.includes(d.id))
  const shoreDashboardsList = filteredDashboards.filter(d => SHORE_DASHBOARDS.includes(d.id))
  const parkDashboardsList = filteredDashboards.filter(d => PARK_DASHBOARDS.includes(d.id))
  const transportDashboardsList = filteredDashboards.filter(d => TRANSPORT_DASHBOARDS.includes(d.id))
  const resolvedActiveView =
    filteredDashboards.find((dashboard) => dashboard.id === activeView)?.id ??
    filteredDashboards[0]?.id

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
              Статистика и мониторинг подключенных модулей
            </p>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6">
            {modulesLoading ? (
              <>
                <div className="w-full md:w-64 flex-shrink-0 flex md:flex-col gap-2 pb-2 md:pb-0 min-h-0 pr-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
                <div className="flex-1 rounded-lg border bg-background shadow-sm p-0">
                  <Skeleton className="w-full h-full rounded-lg" />
                </div>
              </>
            ) : (
              <>
                {/* Dashboard Sidebar */}
                <div className="w-full md:w-64 flex-shrink-0 flex md:flex-col gap-0 pb-2 md:pb-0 min-h-0">
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="flex md:flex-col gap-6 pr-3 pb-4">
                      {roadsDashboardsList.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Состояние дорог</h4>
                          <div className="flex flex-col gap-1">
                            {roadsDashboardsList.map((dashboard) => (
                              <Button
                                key={dashboard.id}
                                variant={resolvedActiveView === dashboard.id ? "default" : "ghost"}
                                className={cn(
                                  "justify-start gap-3 h-auto py-3 w-full",
                                  resolvedActiveView === dashboard.id && "bg-primary text-primary-foreground hover:bg-primary/90"
                                )}
                                onClick={() => setActiveView(dashboard.id)}
                              >
                                <dashboard.icon className="h-4 w-4" />
                                <span>{dashboard.label}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {stopsDashboardsList.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Остановки</h4>
                          <div className="flex flex-col gap-1">
                            {stopsDashboardsList.map((dashboard) => (
                              <Button
                                key={dashboard.id}
                                variant={resolvedActiveView === dashboard.id ? "default" : "ghost"}
                                className={cn(
                                  "justify-start gap-3 h-auto py-3 w-full",
                                  resolvedActiveView === dashboard.id && "bg-primary text-primary-foreground hover:bg-primary/90"
                                )}
                                onClick={() => setActiveView(dashboard.id)}
                              >
                                <dashboard.icon className="h-4 w-4" />
                                <span>{dashboard.label}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {shoreDashboardsList.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Безопасный берег</h4>
                          <div className="flex flex-col gap-1">
                            {shoreDashboardsList.map((dashboard) => (
                              <Button
                                key={dashboard.id}
                                variant={resolvedActiveView === dashboard.id ? "default" : "ghost"}
                                className={cn(
                                  "justify-start gap-3 h-auto py-3 w-full",
                                  resolvedActiveView === dashboard.id && "bg-primary text-primary-foreground hover:bg-primary/90"
                                )}
                                onClick={() => setActiveView(dashboard.id)}
                              >
                                <dashboard.icon className="h-4 w-4" />
                                <span>{dashboard.label}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {parkDashboardsList.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Безопасный парк</h4>
                          <div className="flex flex-col gap-1">
                            {parkDashboardsList.map((dashboard) => (
                              <Button
                                key={dashboard.id}
                                variant={resolvedActiveView === dashboard.id ? "default" : "ghost"}
                                className={cn(
                                  "justify-start gap-3 h-auto py-3 w-full",
                                  resolvedActiveView === dashboard.id && "bg-primary text-primary-foreground hover:bg-primary/90"
                                )}
                                onClick={() => setActiveView(dashboard.id)}
                              >
                                <dashboard.icon className="h-4 w-4" />
                                <span>{dashboard.label}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {transportDashboardsList.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Контроль транспорта</h4>
                          <div className="flex flex-col gap-1">
                            {transportDashboardsList.map((dashboard) => (
                              <Button
                                key={dashboard.id}
                                variant={resolvedActiveView === dashboard.id ? "default" : "ghost"}
                                className={cn(
                                  "justify-start gap-3 h-auto py-3 w-full",
                                  resolvedActiveView === dashboard.id && "bg-primary text-primary-foreground hover:bg-primary/90"
                                )}
                                onClick={() => setActiveView(dashboard.id)}
                              >
                                <dashboard.icon className="h-4 w-4" />
                                <span>{dashboard.label}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Weather Monitoring Reference */}
                  <div className="hidden md:block mt-4 pt-4 border-t border-border flex-shrink-0">
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
                  <div className="hidden md:block mt-auto pt-4 flex-shrink-0">
                    <GlossaryDialog />
                  </div>
                </div>

                {/* Dashboard Content */}
                <div className="flex-1 rounded-lg border overflow-hidden bg-background shadow-sm relative flex flex-col">
                  {filteredDashboards.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/20">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <AlertCircle className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-medium mb-2">Нет доступных дашбордов</h3>
                      <p className="text-muted-foreground max-w-sm">
                        Для ваших подключенных модулей пока нет аналитических панелей. Проверьте состав доступных модулей или обратитесь к администратору.
                      </p>
                    </div>
                  ) : (
                    filteredDashboards.map((dashboard) => {
                      const isActive = resolvedActiveView === dashboard.id
                      if ('component' in dashboard && dashboard.component) {
                        const Component = dashboard.component
                        return (
                          <div
                            key={dashboard.id}
                            className={cn(
                              "w-full h-full absolute inset-0 overflow-auto",
                              isActive ? "z-10" : "z-0 invisible"
                            )}
                          >
                            {isActive && <Component />}
                          </div>
                        )
                      }
                      return (
                        <iframe
                          key={dashboard.id}
                          src={'url' in dashboard ? dashboard.url : ''}
                          className={cn(
                            "w-full h-full absolute inset-0 border-0 bg-background",
                            isActive ? "z-10" : "z-0 invisible"
                          )}
                          title={dashboard.label}
                          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                        />
                      )
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
