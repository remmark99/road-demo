"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { fetchAlerts, ALERT_TYPE_CONFIG, ALERT_CATEGORIES, MODULE_MAP } from "@/lib/api/alerts"
import { fetchCameras } from "@/lib/api/cameras"
import {
  fetchControllerAlerts,
  getSensorLabel,
  ALARM_CONFIG,
  CATEGORY_LABELS,
  type ControllerAlert,
} from "@/lib/api/controller-alerts"
import type { Alert, Camera } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useModuleAccess } from "@/components/providers/module-context"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Bell,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Truck,
  Snowflake,
  X,
  Filter,
  Camera as CameraIcon,
  Droplets,
  Zap,
  Hammer,
  TriangleAlert,
  Mountain,
  MountainSnow,
  CameraOff,
  Cloud,
  CircleDot,
  Signpost,
  LightbulbOff,
  Minus,
  Wrench,
  Sparkles,
  Thermometer,
  Activity,
  ArrowRight,
  Footprints,
  User,
  Car,
  ShieldAlert,
  Baby,
  LifeBuoy,
  Flame,
  BusFront,
  DoorClosed,
  PackageSearch,
  PersonStanding,
  Route,
  Trash2,
  type LucideIcon,
} from "lucide-react"

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const alertIcons: Record<string, LucideIcon> = {
  snowplow: Truck,
  camera_obstruction: CameraOff,
  snow_slush: Snowflake,
  canny: Snowflake,
  snow_windrow: Mountain,
  snow_pile: MountainSnow,
  puddle: Droplets,
  dirt: Cloud,
  open_manhole: CircleDot,
  tilted_sign: Signpost,
  dirty_sign: Signpost,
  broken_light: LightbulbOff,
  worn_marking: Minus,
  pothole: TriangleAlert,
  line_cross: Footprints,
  person_detect: User,
  vehicle_detect: Car,
  restricted_zone: ShieldAlert,
  unaccompanied_child: Baby,
  water_fall: LifeBuoy,
  fire_detect: Flame,
  park_left_item: PackageSearch,
  park_person_down: PersonStanding,
  park_fight: ShieldAlert,
  park_fire: Flame,
  park_trash_overflow: Trash2,
  park_camera_obstruction: CameraOff,
  park_light_off: LightbulbOff,
  park_vehicle_detect: Car,
  park_dirty_road: Cloud,
  transport_route_deviation: Route,
  transport_wait_overrun: Clock,
  transport_doors_not_opened: DoorClosed,
}

type DemoAlertSeed = {
  id: string
  module: "parks" | "transport"
  moduleName: string
  alertType: string
  message: string
  severity: number
  minutesAgo: number
}

const DEMO_ALERT_SEEDS: DemoAlertSeed[] = [
  {
    id: "park-left-item",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_left_item",
    message: "У детской площадки обнаружен оставленный предмет",
    severity: 0.72,
    minutesAgo: 11,
  },
  {
    id: "park-person-down",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_person_down",
    message: "На центральной аллее зафиксирован лежачий человек",
    severity: 0.91,
    minutesAgo: 17,
  },
  {
    id: "park-fight",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_fight",
    message: "У входной группы зафиксирована драка",
    severity: 0.94,
    minutesAgo: 24,
  },
  {
    id: "park-fire",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_fire",
    message: "В зоне отдыха обнаружено возгорание",
    severity: 0.98,
    minutesAgo: 31,
  },
  {
    id: "park-trash-overflow",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_trash_overflow",
    message: "Переполненная урна у павильона №2 требует уборки",
    severity: 0.53,
    minutesAgo: 42,
  },
  {
    id: "park-camera-obstruction",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_camera_obstruction",
    message: "Обзор камеры перекрыт посторонним объектом",
    severity: 0.81,
    minutesAgo: 49,
  },
  {
    id: "park-light-off",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_light_off",
    message: "На северной аллее не работает освещение",
    severity: 0.63,
    minutesAgo: 56,
  },
  {
    id: "park-vehicle-detect",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_vehicle_detect",
    message: "На пешеходной дорожке зафиксирован проезд автомобиля",
    severity: 0.76,
    minutesAgo: 68,
  },
  {
    id: "park-dirty-road",
    module: "parks",
    moduleName: "park_monitoring",
    alertType: "park_dirty_road",
    message: "На сервисной дороге парка требуется уборка покрытия",
    severity: 0.47,
    minutesAgo: 74,
  },
  {
    id: "transport-route-deviation",
    module: "transport",
    moduleName: "transport_monitoring",
    alertType: "transport_route_deviation",
    message: "Автобус маршрута №24 отклонился от согласованной трассы",
    severity: 0.79,
    minutesAgo: 14,
  },
  {
    id: "transport-wait-overrun",
    module: "transport",
    moduleName: "transport_monitoring",
    alertType: "transport_wait_overrun",
    message: "Автобус маршрута №12 превысил допустимое ожидание на остановке",
    severity: 0.58,
    minutesAgo: 27,
  },
  {
    id: "transport-doors-not-opened",
    module: "transport",
    moduleName: "transport_monitoring",
    alertType: "transport_doors_not_opened",
    message: "Автобус маршрута №8 не открыл двери на остановочном пункте",
    severity: 0.58,
    minutesAgo: 36,
  },
]
const DEMO_ALERT_BASE_TIME = Date.now()

// ── Shared helpers ──────────────────────────────────────────────────────
function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes} мин. назад`
  if (hours < 24) return `${hours} ч. назад`
  if (days < 7) return `${days} дн. назад`
  return formatTime(dateStr)
}

function getModuleLabel(moduleName: string | null | undefined) {
  if (!moduleName) return "—"
  return MODULE_MAP[moduleName] ?? moduleName
}

function isDemoAlert(alert: Alert) {
  return alert.id.startsWith("demo-")
}

// ── Pagination component ────────────────────────────────────────────────
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-6">
      <div className="text-sm text-muted-foreground">
        Страница {page + 1} из {totalPages}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Назад
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Вперёд
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}

// ── Results header with count + page size ───────────────────────────────
function ResultsHeader({
  total,
  loading,
  pageSize,
  setPageSize,
}: {
  total: number
  loading: boolean
  pageSize: number
  setPageSize: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="text-sm text-muted-foreground">
        {loading ? (
          "Загрузка..."
        ) : (
          <>
            Найдено:{" "}
            <span className="font-medium text-foreground">{total}</span>{" "}
            уведомлений
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">На странице:</span>
        <Select
          value={pageSize.toString()}
          onValueChange={(v) => setPageSize(parseInt(v))}
        >
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={size.toString()}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Camera Alerts Tab
// ═══════════════════════════════════════════════════════════════════════
function CameraAlertsTab({ cameras }: { cameras: Camera[] }) {
  const searchParams = useSearchParams()
  const initialCamera = searchParams.get("camera")
  const { hasModule } = useModuleAccess()
  const hasRoads = hasModule("roads")
  const hasShore = hasModule("shore")
  const hasParks = hasModule("parks")
  const hasTransport = hasModule("transport")

  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedCameras, setSelectedCameras] = useState<number[]>(
    initialCamera ? [parseInt(initialCamera)] : []
  )
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const allowedTypes = useMemo(() => {
    const types: string[] = []
    if (hasRoads) {
      types.push(
        ...ALERT_CATEGORIES.equipment.types,
        ...ALERT_CATEGORIES.cleaning.types,
        ...ALERT_CATEGORIES.repair.types
      )
    }
    if (hasShore) {
      types.push(
        ...ALERT_CATEGORIES.shore_security.types,
        ...ALERT_CATEGORIES.shore_safety.types
      )
    }
    if (hasParks) {
      types.push(...ALERT_CATEGORIES.park_monitoring.types)
    }
    if (hasTransport) {
      types.push(...ALERT_CATEGORIES.transport_monitoring.types)
    }
    return types
  }, [hasParks, hasRoads, hasShore, hasTransport])

  useEffect(() => {
    const request =
      allowedTypes.length === 0
        ? Promise.resolve({ alerts: [], total: 0 })
        : fetchAlerts({
            types: selectedTypes.length > 0 ? selectedTypes : allowedTypes,
            cameraIndexes:
              selectedCameras.length > 0 ? selectedCameras : undefined,
            limit: pageSize,
            offset: page * pageSize,
          })

    request.then((result) => {
      setAlerts(result.alerts)
      setTotal(result.total)
      setLoading(false)
    })
  }, [selectedTypes, selectedCameras, page, pageSize, allowedTypes])

  const totalPages = Math.ceil(total / pageSize)

  const getCameraName = (index: number | null) => {
    if (index === null) return "—"
    const cam = cameras.find((c) => c.cameraIndex === index)
    return cam ? cam.name : `Камера #${index}`
  }

  const toggleType = (type: string) => {
    setLoading(true)
    setPage(0)
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const toggleCamera = (index: number) => {
    setLoading(true)
    setPage(0)
    setSelectedCameras((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    )
  }

  const clearFilters = () => {
    setLoading(true)
    setPage(0)
    setSelectedTypes([])
    setSelectedCameras([])
  }

  const hasFilters = selectedTypes.length > 0 || selectedCameras.length > 0
  const onlineCameras = cameras.filter((c) => c.status === "online")
  const demoAlerts = useMemo<Alert[]>(() => {
    const resolveCameraIndex = (module: DemoAlertSeed["module"]) => {
      return (
        onlineCameras.find((camera) => camera.module === module)?.cameraIndex ??
        cameras.find((camera) => camera.module === module)?.cameraIndex ??
        onlineCameras[0]?.cameraIndex ??
        cameras[0]?.cameraIndex ??
        null
      )
    }

    return DEMO_ALERT_SEEDS
      .filter((seed) => (seed.module === "parks" ? hasParks : hasTransport))
      .map((seed) => {
        const timestamp = new Date(
          DEMO_ALERT_BASE_TIME - seed.minutesAgo * 60 * 1000
        ).toISOString()

        return {
          id: `demo-${seed.id}`,
          module_name: seed.moduleName,
          alert_type: seed.alertType,
          severity: seed.severity,
          message: seed.message,
          metadata: { demo: true },
          timestamp,
          video_timestamp: 0,
          source_video: `demo://${seed.id}`,
          clip_path: null,
          created_at: timestamp,
          camera_index: resolveCameraIndex(seed.module),
        }
      })
  }, [cameras, hasParks, hasTransport, onlineCameras])
  const filteredDemoAlerts = useMemo(
    () =>
      demoAlerts.filter((alert) => {
        const typeMatches =
          selectedTypes.length === 0 || selectedTypes.includes(alert.alert_type)
        const cameraMatches =
          selectedCameras.length === 0 ||
          (alert.camera_index !== null &&
            selectedCameras.includes(alert.camera_index))
        return typeMatches && cameraMatches
      }),
    [demoAlerts, selectedCameras, selectedTypes]
  )
  const visibleAlerts = useMemo(
    () => [...alerts, ...(page === 0 ? filteredDemoAlerts : [])],
    [alerts, filteredDemoAlerts, page]
  )

  return (
    <>
      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4 pb-3">
          <div className="text-base font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Фильтры
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={clearFilters}
              >
                <X className="h-3 w-3 mr-1" />
                Сбросить
              </Button>
            )}
          </div>
        </div>
        <CardContent className="space-y-4 pt-0">
          {hasRoads && (
            <>
              {/* Спецтехника */}
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-blue-400" />
                  Спецтехника
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.equipment.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || Snowflake
                    const isSelected = selectedTypes.includes(type)
                    return (
                      <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleType(type)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Уборка */}
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  Уборка
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.cleaning.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || Snowflake
                    const isSelected = selectedTypes.includes(type)
                    return (
                      <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleType(type)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Ремонт */}
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-orange-400" />
                  Ремонт
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.repair.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || Snowflake
                    const isSelected = selectedTypes.includes(type)
                    return (
                      <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleType(type)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />
            </>
          )}

          {hasShore && (
            <>
              {/* Охрана периметра */}
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Охрана периметра
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.shore_security.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || Snowflake
                    const isSelected = selectedTypes.includes(type)
                    return (
                      <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleType(type)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Безопасность людей */}
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4 text-red-500" />
                  Безопасность людей
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.shore_safety.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || Snowflake
                    const isSelected = selectedTypes.includes(type)
                    return (
                      <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleType(type)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />
            </>
          )}

          {hasParks && (
            <>
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-emerald-400" />
                  Безопасный парк
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.park_monitoring.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || ShieldAlert
                    const isSelected = selectedTypes.includes(type)
                    return (
                      <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleType(type)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />
            </>
          )}

          {hasTransport && (
            <>
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <BusFront className="h-4 w-4 text-sky-400" />
                  Контроль транспорта
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.transport_monitoring.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || BusFront
                    const isSelected = selectedTypes.includes(type)
                    return (
                      <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleType(type)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />
            </>
          )}

          {/* Camera filter */}
          <div>
            <div className="text-sm text-muted-foreground mb-2">Камеры</div>
            <div className="flex flex-wrap gap-2">
              {onlineCameras.slice(0, 10).map((camera) => {
                const isSelected = selectedCameras.includes(camera.cameraIndex)
                return (
                  <Tooltip key={camera.cameraIndex}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => toggleCamera(camera.cameraIndex)}
                      >
                        <CameraIcon className="h-3 w-3" />
                        #{camera.cameraIndex}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {camera.description ? (
                        <p className="text-xs opacity-80">
                          {camera.description}
                        </p>
                      ) : (
                        <p className="text-xs opacity-80">Без описания</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
              {onlineCameras.length > 10 && (
                <span className="text-xs text-muted-foreground self-center ml-2">
                  +{onlineCameras.length - 10} камер
                </span>
              )}
            </div>
            {selectedCameras.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                Выбрано: {selectedCameras.map((i) => `#${i}`).join(", ")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ResultsHeader
        total={total}
        loading={loading}
        pageSize={pageSize}
        setPageSize={(value) => {
          setLoading(true)
          setPage(0)
          setPageSize(value)
        }}
      />

      {/* Alert rows */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visibleAlerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Нет уведомлений</p>
            {hasFilters && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Сбросить фильтры
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Время</div>
            <div className="col-span-2">Тип</div>
            <div className="col-span-2">Камера</div>
            <div className="col-span-4">Сообщение</div>
            <div className="col-span-1">Срочность</div>
            <div className="col-span-1"></div>
          </div>

          {visibleAlerts.map((alert) => {
            const config = ALERT_TYPE_CONFIG[alert.alert_type] || {
              label: alert.alert_type,
              color: "text-muted-foreground bg-muted",
            }
            const Icon = alertIcons[alert.alert_type] || Snowflake
            const demoAlert = isDemoAlert(alert)
            const isExpanded = expandedId === alert.id

            return (
              <Card
                key={alert.id}
                className={`transition-colors hover:border-primary/50 ${
                  demoAlert ? "cursor-default" : "cursor-pointer"
                } ${isExpanded ? "border-primary" : ""}`}
                onClick={() =>
                  demoAlert ? undefined : setExpandedId(isExpanded ? null : alert.id)
                }
              >
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-2 flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground md:hidden" />
                      <span className="text-muted-foreground md:text-foreground">
                        {formatTimeAgo(alert.timestamp)}
                      </span>
                    </div>

                    <div className="md:col-span-2 min-w-0">
                      <Badge
                        className={`max-w-full gap-1.5 overflow-hidden ${config.color}`}
                      >
                        <Icon className="h-3 w-3" />
                        <span className="truncate">{config.label}</span>
                      </Badge>
                    </div>

                    <div className="md:col-span-2 min-w-0 text-sm truncate">
                      <span className="text-muted-foreground md:hidden">
                        Камера:{" "}
                      </span>
                      {getCameraName(alert.camera_index)}
                    </div>

                    <div className="md:col-span-4 text-sm truncate">
                      {alert.message}
                    </div>

                    <div className="md:col-span-1">
                      <Badge variant="secondary" className="text-xs">
                        {alert.severity >= 0.7
                          ? "Высокая"
                          : alert.severity >= 0.4
                            ? "Средняя"
                            : "Низкая"}
                      </Badge>
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      {demoAlert ? (
                        <div className="h-4 w-4" />
                      ) : (
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      )}
                    </div>
                  </div>

                  {isExpanded && !demoAlert && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                          {alert.clip_path ? (
                            (() => {
                              const isImage =
                                alert.clip_path &&
                                alert.clip_path
                                  .toLowerCase()
                                  .match(/\.(jpg|jpeg|png)$/)
                              return isImage ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={alert.clip_path}
                                  alt={config.label}
                                  className="w-full h-full object-cover"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <video
                                  className="w-full h-full object-cover"
                                  controls
                                  preload="metadata"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <source
                                    src={alert.clip_path}
                                    type="video/mp4"
                                  />
                                </video>
                              )
                            })()
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <p className="text-muted-foreground text-sm">
                                Видео недоступно
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 text-sm">
                          <div>
                            <div className="text-muted-foreground">
                              Время события
                            </div>
                            <div className="font-medium">
                              {formatTime(alert.timestamp)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Модуль</div>
                            <div className="font-medium">
                              {getModuleLabel(alert.module_name)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              Источник видео
                            </div>
                            <div className="font-medium truncate">
                              {alert.source_video}
                            </div>
                          </div>
                          {alert.clip_path && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a
                                href={alert.clip_path}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {alert.clip_path
                                  .toLowerCase()
                                  .match(/\.(jpg|jpeg|png)$/)
                                  ? "Скачать фото"
                                  : "Скачать видео"}
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(nextPage) => {
          setLoading(true)
          setPage(nextPage)
        }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Controller Alerts Tab
// ═══════════════════════════════════════════════════════════════════════
function ControllerAlertsTab() {
  const [selectedElements, setSelectedElements] = useState<number[]>([])
  const [selectedAlarms, setSelectedAlarms] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [alerts, setAlerts] = useState<ControllerAlert[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    fetchControllerAlerts({
      elements: selectedElements.length > 0 ? selectedElements : undefined,
      alarms: selectedAlarms.length > 0 ? selectedAlarms : undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }).then((result) => {
      setAlerts(result.alerts)
      setTotal(result.total)
      setLoading(false)
    })
  }, [selectedElements, selectedAlarms, selectedCategories, page, pageSize])

  const totalPages = Math.ceil(total / pageSize)

  const toggleElement = (el: number) => {
    setLoading(true)
    setPage(0)
    setSelectedElements((prev) =>
      prev.includes(el) ? prev.filter((e) => e !== el) : [...prev, el]
    )
  }

  const toggleAlarm = (alarm: string) => {
    setLoading(true)
    setPage(0)
    setSelectedAlarms((prev) =>
      prev.includes(alarm)
        ? prev.filter((a) => a !== alarm)
        : [...prev, alarm]
    )
  }

  const toggleCategory = (cat: string) => {
    setLoading(true)
    setPage(0)
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  const clearFilters = () => {
    setLoading(true)
    setPage(0)
    setSelectedElements([])
    setSelectedAlarms([])
    setSelectedCategories([])
  }

  const hasFilters =
    selectedElements.length > 0 ||
    selectedAlarms.length > 0 ||
    selectedCategories.length > 0

  return (
    <>
      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4 pb-3">
          <div className="text-base font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Фильтры
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={clearFilters}
              >
                <X className="h-3 w-3 mr-1" />
                Сбросить
              </Button>
            )}
          </div>
        </div>
        <CardContent className="space-y-4 pt-0">
          {/* Element filter */}
          <div>
            <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Датчик
            </div>
            <div className="flex flex-wrap gap-2">
              {[13, 14].map((el) => {
                const isSelected = selectedElements.includes(el)
                return (
                  <Button
                    key={el}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => toggleElement(el)}
                  >
                    <Thermometer className="h-3.5 w-3.5" />
                    {getSensorLabel(el)}
                  </Button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Category filter */}
          <div>
            <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              Категория
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                const isSelected = selectedCategories.includes(key)
                return (
                  <Button
                    key={key}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => toggleCategory(key)}
                  >
                    {key === "temperature" ? (
                      <Thermometer className="h-3.5 w-3.5" />
                    ) : key === "humidity" ? (
                      <Droplets className="h-3.5 w-3.5" />
                    ) : key === "glass_break" ? (
                      <Hammer className="h-3.5 w-3.5" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    {label}
                  </Button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Alarm status filter */}
          <div>
            <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              Статус
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ALARM_CONFIG).map(([key, cfg]) => {
                const isSelected = selectedAlarms.includes(key)
                return (
                  <Button
                    key={key}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => toggleAlarm(key)}
                  >
                    {cfg.label}
                  </Button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <ResultsHeader
        total={total}
        loading={loading}
        pageSize={pageSize}
        setPageSize={(value) => {
          setLoading(true)
          setPage(0)
          setPageSize(value)
        }}
      />

      {/* Controller alert rows */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Нет уведомлений от датчиков</p>
            {hasFilters && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Сбросить фильтры
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="hidden md:grid md:grid-cols-[minmax(8rem,_1fr)_minmax(10rem,_1.3fr)_minmax(8rem,_1fr)_minmax(6rem,_0.8fr)_minmax(12rem,_1.6fr)_minmax(0,_1.5fr)] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="min-w-0">Время</div>
            <div className="min-w-0">Датчик</div>
            <div className="min-w-0">Категория</div>
            <div className="min-w-0">Значение</div>
            <div className="min-w-0">Статус</div>
            <div className="min-w-0">Сообщение</div>
          </div>

          {alerts.map((alert) => {
            const alarmCfg = ALARM_CONFIG[alert.alarm] || {
              label: alert.alarm,
              color: "text-muted-foreground bg-muted",
            }
            const prevAlarmCfg = alert.prev_alarm
              ? ALARM_CONFIG[alert.prev_alarm]
              : null
            const categoryLabel =
              CATEGORY_LABELS[alert.category] || alert.category
            const unit = alert.category === "temperature" ? "°C" : alert.category === "humidity" ? "%" : alert.category === "digital input" ? "В" : ""

            return (
              <Card
                key={alert.id}
                className="transition-colors hover:border-primary/50"
              >
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 gap-4 items-center md:grid-cols-[minmax(8rem,_1fr)_minmax(10rem,_1.3fr)_minmax(8rem,_1fr)_minmax(6rem,_0.8fr)_minmax(12rem,_1.6fr)_minmax(0,_1.5fr)]">
                    {/* Time */}
                    <div className="min-w-0 flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground md:hidden" />
                      <span className="text-muted-foreground md:text-foreground">
                        {formatTimeAgo(alert.created_at)}
                      </span>
                    </div>

                    {/* Sensor */}
                    <div className="min-w-0 text-sm truncate">
                      <span className="text-muted-foreground md:hidden">
                        Датчик:{" "}
                      </span>
                      {getSensorLabel(alert.element)}
                    </div>

                    {/* Category */}
                    <div className="min-w-0">
                      <Badge
                        variant="outline"
                        className="max-w-full gap-1.5 overflow-hidden"
                      >
                        {alert.category === "temperature" ? (
                          <Thermometer className="h-3 w-3" />
                        ) : alert.category === "humidity" ? (
                          <Droplets className="h-3 w-3" />
                        ) : alert.category === "glass_break" ? (
                          <Hammer className="h-3 w-3" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        <span className="truncate">{categoryLabel}</span>
                      </Badge>
                    </div>

                    {/* Value */}
                    <div className="min-w-0 text-sm">
                      <span className="font-bold tabular-nums text-base">
                        {alert.value.toFixed(1)}
                      </span>
                      <span className="text-muted-foreground ml-1">{unit}</span>
                    </div>

                    {/* Alarm status with transition */}
                    <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                      {prevAlarmCfg && alert.prev_alarm !== alert.alarm && (
                        <>
                          <Badge
                            className={`text-xs ${prevAlarmCfg.color} opacity-60`}
                          >
                            {prevAlarmCfg.label}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                      <Badge className={`text-xs ${alarmCfg.color}`}>
                        {alarmCfg.label}
                      </Badge>
                    </div>

                    {/* Message */}
                    <div className="min-w-0 text-sm text-muted-foreground truncate">
                      {alert.message}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(nextPage) => {
          setLoading(true)
          setPage(nextPage)
        }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════
function NotificationsContent() {
  const { modules, hasModule, loading: modulesLoading } = useModuleAccess()
  const [cameras, setCameras] = useState<Camera[]>([])

  useEffect(() => {
    if (modulesLoading) return
    fetchCameras(modules).then(setCameras)
  }, [modules, modulesLoading])

  const showStops = hasModule('stops')

  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <div className="pt-14">
        <div className="max-w-6xl mx-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              Уведомления
            </h1>
            <p className="text-muted-foreground mt-1">
              События с камер мониторинга и датчиков
            </p>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="camera" className="space-y-6">
            <TabsList>
              <TabsTrigger value="camera" className="gap-2">
                <CameraIcon className="h-4 w-4" />
                Камеры
              </TabsTrigger>
              {showStops && (
                <TabsTrigger value="controller" className="gap-2">
                  <Activity className="h-4 w-4" />
                  Датчики
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="camera">
              <CameraAlertsTab cameras={cameras} />
            </TabsContent>

            {showStops && (
              <TabsContent value="controller">
                <ControllerAlertsTab />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </main>
  )
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NotificationsContent />
    </Suspense>
  )
}
