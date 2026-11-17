"use client"

import { Suspense, useState, type ComponentType } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
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
  Cctv,
  Map,
  Users2,
  ShieldAlert,
  AlertCircle,
  ShieldCheck,
  LifeBuoy,
  Siren,
  Trash2,
  Route,
  DoorClosed,
  LayoutDashboard,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useModuleAccess } from "@/components/providers/module-context"
import { GlossaryDialog } from "@/components/dashboard/glossary-dialog"

import { Skeleton } from "@/components/ui/skeleton"
import type { VisionView } from "@/components/dashboard/stops-v2/kit"

const LiveStopsVision = dynamic(() => import("@/components/dashboard/stops-v2/live-shell").then(m => m.LiveStopsVision), { loading: () => <Skeleton className="h-64 w-full" /> })

const ShoreSecurityAnalytics = dynamic(() => import("@/components/dashboard/shore-security-analytics").then(m => m.ShoreSecurityAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const ShoreSafetyAnalytics = dynamic(() => import("@/components/dashboard/shore-safety-analytics").then(m => m.ShoreSafetyAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const ShoreEmergencyAnalytics = dynamic(() => import("@/components/dashboard/shore-emergency-analytics").then(m => m.ShoreEmergencyAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const ParkSecurityAnalytics = dynamic(() => import("@/components/dashboard/park-security-analytics").then(m => m.ParkSecurityAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const ParkOperationsAnalytics = dynamic(() => import("@/components/dashboard/park-operations-analytics").then(m => m.ParkOperationsAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const TransportRouteAnalytics = dynamic(() => import("@/components/dashboard/transport-route-analytics").then(m => m.TransportRouteAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const TransportServiceAnalytics = dynamic(() => import("@/components/dashboard/transport-service-analytics").then(m => m.TransportServiceAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const RoadCurrentAnalytics = dynamic(() => import("@/components/dashboard/road-current-analytics").then(m => m.RoadCurrentAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const RoadEfficiencyMatrixAnalytics = dynamic(() => import("@/components/dashboard/road-efficiency-matrix-analytics").then(m => m.RoadEfficiencyMatrixAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const RoadContractorsAnalytics = dynamic(() => import("@/components/dashboard/road-contractors-analytics").then(m => m.RoadContractorsAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const RoadPrecipitationAnalytics = dynamic(() => import("@/components/dashboard/road-precipitation-analytics").then(m => m.RoadPrecipitationAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })
const RoadCityAnalytics = dynamic(() => import("@/components/dashboard/road-city-analytics").then(m => m.RoadCityAnalytics), { loading: () => <Skeleton className="h-64 w-full" /> })

type DashboardView =
  | "general"
  | "cleaning"
  | "incidents"
  | "predictions"
  | "city"
  | "stop_overview"
  | "stop_clean"
  | "stop_districts"
  | "stop_security"
  | "stop_passenger"
  | "stop_equipment"
  | "stop_sensors"
  | "shore_security"
  | "shore_safety"
  | "shore_emergency"
  | "park_security"
  | "park_operations"
  | "transport_route"
  | "transport_service"

type DashboardModule = "roads" | "stops" | "shore" | "parks" | "transport"
type StopAnalyticsMode = "current" | "plan"
type DashboardComponent = ComponentType

interface DashboardDefinition {
  id: DashboardView
  label: string
  icon: LucideIcon
  module: DashboardModule
  url?: string
  component?: DashboardComponent
  stopModes?: Partial<Record<StopAnalyticsMode, DashboardComponent>>
  /** Раздел новой аналитики остановок (components/dashboard/stops-v2). */
  vision?: VisionView
}

const STOP_ANALYTICS_MODES: { id: StopAnalyticsMode; label: string }[] = [
  { id: "current", label: "Текущее состояние" },
  { id: "plan", label: "Демо" },
]

const DASHBOARDS: readonly DashboardDefinition[] = [
  {
    id: "general",
    label: "Текущее состояние",
    icon: Activity,
    module: "roads",
    component: RoadCurrentAnalytics,
  },
  {
    id: "cleaning",
    label: "Матрица эффективности",
    icon: Grid3X3,
    module: "roads",
    component: RoadEfficiencyMatrixAnalytics,
  },
  {
    id: "incidents",
    label: "Подрядчики",
    icon: Users,
    module: "roads",
    component: RoadContractorsAnalytics,
  },
  {
    id: "predictions",
    label: "Влияние осадков",
    icon: CloudRain,
    module: "roads",
    component: RoadPrecipitationAnalytics,
  },
  {
    id: "city",
    label: "Город",
    icon: Building2,
    module: "roads",
    component: RoadCityAnalytics,
  },
  { id: "stop_overview", label: "Сводка", icon: LayoutDashboard, module: "stops", vision: "overview" },
  { id: "stop_security", label: "События безопасности", icon: ShieldAlert, module: "stops", vision: "safety" },
  { id: "stop_clean", label: "Чистота", icon: Trash2, module: "stops", vision: "clean" },
  { id: "stop_equipment", label: "Оборудование", icon: Cctv, module: "stops", vision: "equipment" },
  { id: "stop_sensors", label: "Датчики", icon: Thermometer, module: "stops", vision: "sensors" },
  { id: "stop_passenger", label: "Загруженность", icon: Users2, module: "stops", vision: "load" },
  { id: "stop_districts", label: "Микрорайоны", icon: Map, module: "stops", vision: "districts" },
  {
    id: "shore_security",
    label: "Охрана периметра",
    icon: ShieldCheck,
    module: "shore",
    component: ShoreSecurityAnalytics,
  },
  {
    id: "shore_safety",
    label: "Безопасность посетителей",
    icon: LifeBuoy,
    module: "shore",
    component: ShoreSafetyAnalytics,
  },
  {
    id: "shore_emergency",
    label: "Критические ситуации",
    icon: Siren,
    module: "shore",
    component: ShoreEmergencyAnalytics,
  },
  {
    id: "park_security",
    label: "Инциденты и безопасность",
    icon: ShieldAlert,
    module: "parks",
    component: ParkSecurityAnalytics,
  },
  {
    id: "park_operations",
    label: "Эксплуатация территории",
    icon: Trash2,
    module: "parks",
    component: ParkOperationsAnalytics,
  },
  {
    id: "transport_route",
    label: "Маршрутная дисциплина",
    icon: Route,
    module: "transport",
    component: TransportRouteAnalytics,
  },
  {
    id: "transport_service",
    label: "Обслуживание остановок",
    icon: DoorClosed,
    module: "transport",
    component: TransportServiceAnalytics,
  }
] as const

const ROADS_DASHBOARDS = ["general", "cleaning", "incidents", "predictions", "city"]
const STOPS_DASHBOARDS = ["stop_overview", "stop_security", "stop_clean", "stop_equipment", "stop_sensors", "stop_passenger", "stop_districts"]
const SHORE_DASHBOARDS = ["shore_security", "shore_safety", "shore_emergency"]
const PARK_DASHBOARDS = ["park_security", "park_operations"]
const TRANSPORT_DASHBOARDS = ["transport_route", "transport_service"]
const SIDEBAR_SECTION_DEFAULTS = {
  roads: true,
  stops: true,
  shore: true,
  parks: true,
  transport: true,
}

interface SidebarSection {
  key: keyof typeof SIDEBAR_SECTION_DEFAULTS
  title: string
  dashboards: DashboardDefinition[]
}

function orderDashboards(dashboards: DashboardDefinition[], order: readonly string[]) {
  return dashboards
    .slice()
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
}

function getAvailableStopModes(dashboard: DashboardDefinition | undefined) {
  if (!dashboard?.stopModes) return []

  return STOP_ANALYTICS_MODES
    .map((mode) => mode.id)
    .filter((mode) => Boolean(dashboard.stopModes?.[mode]))
}

function getFirstAvailableStopMode(dashboard: DashboardDefinition | undefined) {
  return getAvailableStopModes(dashboard)[0] ?? null
}

function DashboardContent() {
  const searchParams = useSearchParams()
  // Вкладка хранится в адресе, чтобы кнопка «назад» возвращала на неё же.
  const [activeView, setActiveView] = useState<DashboardView>(() => (searchParams.get("view") as DashboardView | null) ?? "stop_overview")
  const [stopMode, setStopMode] = useState<StopAnalyticsMode>("current")
  const [expandedSections, setExpandedSections] = useState(SIDEBAR_SECTION_DEFAULTS)
  const { hasModule, loading: modulesLoading } = useModuleAccess()

  const filteredDashboards = DASHBOARDS.filter(d => {
    return hasModule(d.module)
  })

  const roadsDashboardsList = orderDashboards(filteredDashboards.filter(d => ROADS_DASHBOARDS.includes(d.id)), ROADS_DASHBOARDS)
  const stopsDashboardsList = orderDashboards(filteredDashboards.filter(d => STOPS_DASHBOARDS.includes(d.id)), STOPS_DASHBOARDS)
  const shoreDashboardsList = orderDashboards(filteredDashboards.filter(d => SHORE_DASHBOARDS.includes(d.id)), SHORE_DASHBOARDS)
  const parkDashboardsList = orderDashboards(filteredDashboards.filter(d => PARK_DASHBOARDS.includes(d.id)), PARK_DASHBOARDS)
  const transportDashboardsList = orderDashboards(filteredDashboards.filter(d => TRANSPORT_DASHBOARDS.includes(d.id)), TRANSPORT_DASHBOARDS)
  const resolvedActiveView =
    filteredDashboards.find((dashboard) => dashboard.id === activeView)?.id ??
    filteredDashboards[0]?.id
  const activeDashboard = filteredDashboards.find((dashboard) => dashboard.id === resolvedActiveView)
  const activeStopModes = getAvailableStopModes(activeDashboard)
  const resolvedStopMode =
    activeDashboard?.stopModes && activeDashboard.stopModes[stopMode]
      ? stopMode
      : getFirstAvailableStopMode(activeDashboard) ?? stopMode
  const showStopModeToggle = Boolean(activeDashboard?.stopModes && activeStopModes.length > 1)
  const sidebarSectionDefinitions: SidebarSection[] = [
    { key: "roads", title: "Состояние дорог", dashboards: roadsDashboardsList },
    { key: "stops", title: "Остановки", dashboards: stopsDashboardsList },
    { key: "shore", title: "Безопасный берег", dashboards: shoreDashboardsList },
    { key: "parks", title: "Безопасный парк", dashboards: parkDashboardsList },
    { key: "transport", title: "Контроль транспорта", dashboards: transportDashboardsList },
  ]
  const sidebarSections = sidebarSectionDefinitions.filter((section) => section.dashboards.length > 0)

  const toggleSection = (sectionKey: keyof typeof SIDEBAR_SECTION_DEFAULTS) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  const handleDashboardSelect = (dashboard: DashboardDefinition) => {
    const firstAvailableMode = getFirstAvailableStopMode(dashboard)

    if (dashboard.stopModes && firstAvailableMode && !dashboard.stopModes[stopMode]) {
      setStopMode(firstAvailableMode)
    }

    setActiveView(dashboard.id)
    window.history.replaceState(null, "", `?view=${dashboard.id}`)
  }

  const renderDashboardButton = (dashboard: DashboardDefinition) => {
    const DashboardIcon = dashboard.icon
    const isActive = resolvedActiveView === dashboard.id

    return (
      <Button
        key={dashboard.id}
        variant={isActive ? "default" : "ghost"}
        className={cn(
          "justify-start gap-3 h-auto min-h-11 py-2.5 w-full whitespace-normal text-left",
          isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        onClick={() => handleDashboardSelect(dashboard)}
      >
        <DashboardIcon className="h-4 w-4" />
        <span>{dashboard.label}</span>
      </Button>
    )
  }

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
                      {sidebarSections.map((section) => {
                        const isExpanded = expandedSections[section.key as keyof typeof SIDEBAR_SECTION_DEFAULTS]
                        return (
                          <div key={section.key} className="space-y-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto w-full justify-start gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                              onClick={() => toggleSection(section.key as keyof typeof SIDEBAR_SECTION_DEFAULTS)}
                              aria-expanded={isExpanded}
                              aria-controls={`dashboard-section-${section.key}`}
                            >
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 transition-transform",
                                  isExpanded && "rotate-90 text-primary"
                                )}
                              />
                              <span>{section.title}</span>
                            </Button>

                            {isExpanded && (
                              <div
                                id={`dashboard-section-${section.key}`}
                                className="flex flex-col gap-1"
                              >
                                {section.dashboards.map((dashboard) => renderDashboardButton(dashboard))}
                              </div>
                            )}
                          </div>
                        )
                      })}
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
                        Данные об осадках получены из системы метеомониторинга
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
                    <>
                      {showStopModeToggle && (
                        <div className="flex flex-none flex-col gap-3 border-b bg-background/95 px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <BusFront className="h-4 w-4 text-primary" />
                            <span>Режим аналитики остановок</span>
                          </div>
                          <div className="inline-flex w-fit rounded-lg bg-muted p-1">
                            {STOP_ANALYTICS_MODES.filter((mode) => activeStopModes.includes(mode.id)).map((mode) => {
                              const isActive = resolvedStopMode === mode.id

                              return (
                                <Button
                                  key={mode.id}
                                  type="button"
                                  size="sm"
                                  variant={isActive ? "default" : "ghost"}
                                  className="h-8 rounded-md px-3 transition-colors"
                                  onClick={() => setStopMode(mode.id)}
                                >
                                  {mode.label}
                                </Button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <div className="relative min-h-0 flex-1">
                        {activeDashboard?.vision && (
                          <div className="w-full h-full absolute inset-0 overflow-auto z-10">
                            <LiveStopsVision
                              view={activeDashboard.vision}
                              onViewChange={(view) => {
                                const target = filteredDashboards.find((dashboard) => dashboard.vision === view)
                                if (target) handleDashboardSelect(target)
                              }}
                              viewToUrl={(view) => filteredDashboards.find((dashboard) => dashboard.vision === view)?.id ?? view}
                            />
                          </div>
                        )}
                        {filteredDashboards.map((dashboard) => {
                          if (dashboard.vision) return null
                          const isActive = resolvedActiveView === dashboard.id
                          const modeForDashboard = isActive
                            ? resolvedStopMode
                            : getFirstAvailableStopMode(dashboard)
                          const StopModeComponent = modeForDashboard && dashboard.stopModes?.[modeForDashboard]
                          const Component = StopModeComponent ?? dashboard.component

                          if (Component) {
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
                              src={dashboard.url ?? ""}
                              className={cn(
                                "w-full h-full absolute inset-0 border-0 bg-background",
                                isActive ? "z-10" : "z-0 invisible"
                              )}
                              title={dashboard.label}
                              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                            />
                          )
                        })}
                      </div>
                    </>
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <DashboardContent />
    </Suspense>
  )
}
