"use client"

import { EventsExport } from '@/components/notifications/events-export'
import { getAbandonedEpisode } from '@/lib/notifications/abandoned-episode'
import { PeriodFilter } from '@/components/notifications/period-filter'
import { CameraPlaceFilter } from '@/components/notifications/camera-place-filter'
import { buildCameraPlaces, filteredCameraIndexes, notificationPeriodBounds, formatEventDuration, type NotificationPeriod, type CameraPlace } from '@/lib/notifications/feed-filters'
import { fetchStopDirectory, type BusStopProperties } from '@/lib/api/bus-stops'
import { formatCameraConfidence, closedEpisodeImage } from '@/lib/notifications/camera-evidence'
import { getBinEpisode } from "@/lib/bin-episodes"
import { MediaLightbox, useMediaLightbox, type LightboxImage } from "@/components/notifications/media-lightbox"
import { cn } from "@/lib/utils"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import {
  fetchAlerts,
  fetchLyingPersonEpisodes,
  ALERT_TYPE_CONFIG,
  ALERT_CATEGORIES,
  type LyingPersonEpisode,
} from "@/lib/api/alerts"
import { fetchCameraDirectory } from "@/lib/api/cameras"
import { STOP_TRASH_OVERFLOW_ALERT_TYPES } from "@/lib/api/stop-condition-windows"
import {
  fetchControllerAlerts,
  getControllerAlertSourceLabel,
  getSensorLabel,
  isControllerLinkAlert,
  ALARM_CONFIG,
  CATEGORY_LABELS,
  FILTERABLE_CATEGORIES,
  type ControllerAlert,
} from "@/lib/api/controller-alerts"
import { CLIMATE_ELEMENT, GLASS_BREAK_ELEMENT } from "@/lib/api/measurements"
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
  Cigarette,
  Dog,
  Cctv,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import {
  getStopComplexByCameraIndex,
  getStopComplexByLocationId,
} from "@/lib/stop-analytics-config"

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const LYING_EPISODE_REFRESH_INTERVAL_MS = 30_000
const TRASH_OVERFLOW_FILTER_TYPES = [...STOP_TRASH_OVERFLOW_ALERT_TYPES]
const TRASH_OVERFLOW_FILTER_KEY = "trash-overflow"

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
  trash_overflow: Trash2,
  trash_bin_overflow: Trash2,
  bin_overflow: Trash2,
  bin_full: Trash2,
  garbage_overflow: Trash2,
  stop_trash_overflow: Trash2,
  stop_bin_overflow: Trash2,
  overflowing_trash: Trash2,
  overflowing_bin: Trash2,
  trash_full: Trash2,
  park_camera_obstruction: CameraOff,
  park_light_off: LightbulbOff,
  park_vehicle_detect: Car,
  park_dirty_road: Cloud,
  transport_route_deviation: Route,
  transport_wait_overrun: Clock,
  transport_doors_not_opened: DoorClosed,
  smoking: Cigarette,
  lying_person: PersonStanding,
  abandoned_object: PackageSearch,
  dogs_without_people: Dog,
  camera_offline: CameraOff,
  camera_online: CameraIcon,
}

const RUSSIAN_ALERT_MESSAGES: Record<string, string> = {
  snowplow: "Зафиксирована спецтехника",
  camera_obstruction: "Обзор камеры перекрыт или загрязнён",
  snow_slush: "Обнаружена снежная каша на дороге",
  canny: "Обнаружена заснеженность",
  snow_windrow: "Обнаружен снежный вал",
  snow_pile: "Обнаружена снежная куча",
  puddle: "Обнаружено подтопление дороги",
  dirt: "Обнаружена грязь на дороге",
  open_manhole: "Обнаружен открытый люк",
  tilted_sign: "Обнаружен покосившийся знак",
  dirty_sign: "Обнаружен загрязнённый знак",
  broken_light: "Зафиксировано неработающее освещение",
  worn_marking: "Обнаружена стёртая разметка",
  pothole: "Обнаружены ямы на дороге",
  line_cross: "Зафиксировано пересечение контрольной линии",
  person_detect: "Зафиксирован проход человека",
  vehicle_detect: "Зафиксирован проезд автомобиля",
  restricted_zone: "Обнаружен человек в запретной зоне",
  unaccompanied_child: "Обнаружен ребёнок без сопровождения",
  water_fall: "Зафиксировано падение в воду",
  fire_detect: "Обнаружено возгорание",
  park_left_item: "Обнаружен оставленный предмет",
  park_person_down: "Зафиксирован лежачий человек",
  park_fight: "Зафиксирована драка",
  park_fire: "Обнаружено возгорание",
  park_trash_overflow: "Зафиксирована переполненная урна",
  park_camera_obstruction: "Обзор камеры перекрыт",
  park_light_off: "Зафиксировано неработающее освещение",
  park_vehicle_detect: "Зафиксирован проезд автомобиля",
  park_dirty_road: "Требуется уборка покрытия",
  transport_route_deviation: "Автобус отклонился от маршрута",
  transport_wait_overrun: "Автобус превысил допустимое ожидание",
  transport_doors_not_opened: "Автобус не открыл двери на остановке",
  smoking: "Зафиксировано курение",
  lying_person: "Зафиксирован лежачий человек",
  abandoned_object: "Обнаружен оставленный предмет",
  dogs_without_people: "Обнаружены собаки без людей",
  bin_full: "Зафиксирована переполненная урна",
  trash_overflow: "Зафиксирована переполненная урна",
  trash_bin_overflow: "Зафиксирована переполненная урна",
  bin_overflow: "Зафиксирована переполненная урна",
  garbage_overflow: "Зафиксирована переполненная урна",
  stop_trash_overflow: "Зафиксирована переполненная урна",
  stop_bin_overflow: "Зафиксирована переполненная урна",
  overflowing_trash: "Зафиксирована переполненная урна",
  overflowing_bin: "Зафиксирована переполненная урна",
  trash_full: "Зафиксирована переполненная урна",
  camera_offline: "Камера не в сети",
  camera_online: "Камера снова в сети",
}

type AlertTypeFilterButton = {
  key: string
  types: string[]
  label: string
  Icon: LucideIcon
}

function isTrashOverflowType(type: string) {
  return TRASH_OVERFLOW_FILTER_TYPES.includes(type as typeof STOP_TRASH_OVERFLOW_ALERT_TYPES[number])
}

function buildAlertTypeFilterButtons(types: string[], fallbackIcon: LucideIcon): AlertTypeFilterButton[] {
  const buttons: AlertTypeFilterButton[] = []
  let trashOverflowAdded = false

  for (const type of types) {
    if (isTrashOverflowType(type)) {
      if (trashOverflowAdded) continue

      const groupedTypes = TRASH_OVERFLOW_FILTER_TYPES.filter((candidate) =>
        types.includes(candidate)
      )
      const primaryType = groupedTypes[0] ?? type
      const config = ALERT_TYPE_CONFIG[primaryType]

      buttons.push({
        key: TRASH_OVERFLOW_FILTER_KEY,
        types: groupedTypes.length > 0 ? groupedTypes : [type],
        label: config?.label ?? "Переполненная урна",
        Icon: alertIcons[primaryType] || fallbackIcon,
      })
      trashOverflowAdded = true
      continue
    }

    const config = ALERT_TYPE_CONFIG[type]
    if (!config) continue

    buttons.push({
      key: type,
      types: [type],
      label: config.label,
      Icon: alertIcons[type] || fallbackIcon,
    })
  }

  return buttons
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
  const formatBinTime = (value: string) => new Date(value).toLocaleString("ru-RU", {
    timeZone: "Asia/Yekaterinburg", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  })

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
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



function isDemoAlert(alert: Alert) {
  return alert.id.startsWith("demo-")
}

function hasCyrillic(value: string) {
  return /[А-Яа-яЁё]/.test(value)
}

function hasLatin(value: string) {
  return /[A-Za-z]/.test(value)
}

function getRussianAlertMessage(alert: Alert, fallbackLabel: string) {
  const rawMessage = alert.message?.trim()
  if (rawMessage && hasCyrillic(rawMessage) && !hasLatin(rawMessage)) {
    return rawMessage
  }

  return (
    RUSSIAN_ALERT_MESSAGES[alert.alert_type] ??
    (fallbackLabel === "Неизвестное событие"
      ? "Зафиксировано событие мониторинга"
      : `Зафиксировано событие: ${fallbackLabel}`)
  )
}

/**
 * Единицы измерения, которые не считаются латиницей.
 *
 * Сообщение контроллера с латинскими буквами заменяется общим: контроллер
 * подписывает свои каналы как «DIO1». Но «°C» — это единица измерения в нашем
 * собственном сообщении о пороге температуры, и без этой поправки оператор
 * вместо значения и порога увидел бы «Температура: критично».
 */
function withoutUnits(value: string) {
  return value.replace(/°\s?C/g, "°")
}

function getRussianControllerMessage(
  message: string,
  categoryLabel: string,
  alarmLabel: string
) {
  const rawMessage = message.trim()
  if (rawMessage && hasCyrillic(rawMessage) && !hasLatin(withoutUnits(rawMessage))) {
    return rawMessage
  }

  return `${categoryLabel}: ${alarmLabel.toLowerCase()}`
}

function getMetadataString(
  metadata: Alert["metadata"],
  keys: readonly string[]
) {
  if (!metadata) return null

  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value)
    }
  }

  return null
}

function getLyingPersonEpisodeId(alert: Alert) {
  if (alert.alert_type !== "lying_person") return null
  return getMetadataString(alert.metadata, ["episode_id"])
}

function versionEpisodeImage(imageUrl: string, updatedAt: string) {
  const separator = imageUrl.includes("?") ? "&" : "?"
  return `${imageUrl}${separator}v=${encodeURIComponent(updatedAt)}`
}

/**
 * Рамка для медиа с неизвестными пропорциями: кадр вписывается целиком
 * (object-contain), свободное место заполняет размытая копия кадра.
 */
function MediaFrame({
  className = "h-[240px] sm:h-[300px]",
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-lg bg-muted ${className}`}
    >
      {children}
    </div>
  )
}

function MediaPhoto({ src, alt, onExpand }: { src: string; alt: string; onExpand?: () => void }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        loading="lazy"
        decoding="async"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        loading="lazy"
        decoding="async"
        alt={alt}
        className={cn(
          "relative h-full w-full object-contain",
          onExpand && "cursor-zoom-in"
        )}
        onClick={(event) => {
          event.stopPropagation()
          onExpand?.()
        }}
      />
    </>
  )
}

function getStopCameraIndexCandidates(cameraIndex: number | null) {
  if (cameraIndex === null) return []

  const candidates = [cameraIndex]
  if (cameraIndex >= 10000) {
    candidates.push(cameraIndex - 10000)
  }

  return candidates
}

function getCameraDetail(cameraIndex: number | null) {
  if (cameraIndex === null) return "камера не указана"
  const normalizedIndex = cameraIndex >= 10000 ? cameraIndex - 10000 : cameraIndex
  return `камера ${normalizedIndex}`
}

function getAlertLocationId(alert: Alert) {
  const metadataLocation = getMetadataString(alert.metadata, [
    "location_id",
    "locationId",
    "stop_location_id",
  ])
  if (metadataLocation) return metadataLocation

  for (const cameraIndex of getStopCameraIndexCandidates(alert.camera_index)) {
    const complex = getStopComplexByCameraIndex(cameraIndex)
    if (complex) {
      return complex.locationId
    }
  }

  return null
}

function getAlertStopDisplay(alert: Alert) {
  // Массовое отключение оборудования: одно уведомление на много остановок.
  if (getMetadataString(alert.metadata, ["scope"]) === "mass") {
    const stopCount = getMetadataString(alert.metadata, ["stop_count"])
    return {
      label: "Несколько остановок",
      detail: stopCount ? `остановок: ${stopCount}` : "массовое отключение",
    }
  }

  const locationId = getAlertLocationId(alert)
  const locationComplex = getStopComplexByLocationId(locationId)
  const cameraComplex = getStopCameraIndexCandidates(alert.camera_index)
    .map((cameraIndex) => getStopComplexByCameraIndex(cameraIndex))
    .find(Boolean)
  const complex = locationComplex ?? cameraComplex ?? null
  const cameraDetail = getCameraDetail(alert.camera_index)

  if (complex) {
    return {
      label: complex.stopName,
      detail: `${complex.locationId} · ${cameraDetail}`,
    }
  }

  if (locationId) {
    return {
      label: `Остановка ${locationId}`,
      detail: cameraDetail,
    }
  }

  return {
    label: alert.camera_index === null ? "Остановка не указана" : "Остановка не определена",
    detail: cameraDetail,
  }
}

type QueryReader = {
  get(name: string): string | null
  getAll(name: string): string[]
}

function getQueryValues(searchParams: QueryReader, names: string[]) {
  return names
    .flatMap((name) => {
      const repeatedValues = searchParams.getAll(name)
      const fallbackValue = searchParams.get(name)

      return repeatedValues.length > 0 ? repeatedValues : fallbackValue ? [fallbackValue] : []
    })
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
}

function getQueryNumberValues(searchParams: QueryReader, names: string[]) {
  return Array.from(
    new Set(
      getQueryValues(searchParams, names)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value))
    )
  )
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
        Страница {page + 1}
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
            Показано:{" "}
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
function CameraAlertsTab({ cameras, places, period, onPeriodChange }: { cameras: Camera[]; places: CameraPlace[]; period: NotificationPeriod; onPeriodChange: (value: NotificationPeriod) => void }) {
  const searchParams = useSearchParams()
  const querySelectedTypes = useMemo(
    () => getQueryValues(searchParams, ["type", "types"]),
    [searchParams]
  )
  const querySelectedCameras = useMemo(
    () => getQueryNumberValues(searchParams, ["camera", "cameras"]),
    [searchParams]
  )
  const initialAlertId = searchParams.get("alertId")
  const { hasModule } = useModuleAccess()
  const hasRoads = hasModule("roads")
  const hasShore = hasModule("shore")
  const hasParks = hasModule("parks")
  const hasTransport = hasModule("transport")
  const hasStops = hasModule("stops")

  const [selectedTypes, setSelectedTypes] = useState<string[]>(querySelectedTypes)
  const [repairShortcutSelected, setRepairShortcutSelected] = useState(false)
  const [selectedCameras, setSelectedCameras] = useState<number[]>(querySelectedCameras)
  const [cameraSearch, setCameraSearch] = useState('')
  const effectiveCameras = useMemo(() => filteredCameraIndexes(places, cameraSearch, selectedCameras), [places, cameraSearch, selectedCameras])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [lyingPersonEpisodes, setLyingPersonEpisodes] = useState<
    LyingPersonEpisode[]
  >([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [expandedId, setExpandedId] = useState<string | null>(initialAlertId)
  const [episodeRefreshTick, setEpisodeRefreshTick] = useState(0)
  const { lightboxProps, openLightbox } = useMediaLightbox()
  useEffect(() => {
    // Keep the stops feed fresh even when no episode is currently visible:
    // the next poll may discover a newly opened lying-person episode.
    if (!hasStops) return
    const timer = window.setInterval(
      () => setEpisodeRefreshTick((current) => current + 1),
      LYING_EPISODE_REFRESH_INTERVAL_MS
    )
    return () => window.clearInterval(timer)
  }, [hasStops])

  useEffect(() => {
    if (initialAlertId && !loading) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`alert-${initialAlertId}`)
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [initialAlertId, loading])

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
    if (hasStops) {
      types.push(
        ...ALERT_CATEGORIES.bus_stop_monitoring.types,
        ...ALERT_CATEGORIES.bus_stop_equipment.types
      )
    }
    return types
  }, [hasParks, hasRoads, hasShore, hasStops, hasTransport])

  const repairTypes = ALERT_CATEGORIES.repair.types
  const effectiveSelectedTypes = useMemo(
    () =>
      repairShortcutSelected
        ? Array.from(new Set([...selectedTypes, ...repairTypes]))
        : selectedTypes,
    [repairShortcutSelected, repairTypes, selectedTypes]
  )

  useEffect(() => { setPage(0) }, [period.from, period.to])

  useEffect(() => {
    setLoading(true)
    let bounds
    try { bounds = notificationPeriodBounds(period) } catch {
      setAlerts([]); setLyingPersonEpisodes([]); setTotal(0); setLoading(false); return
    }
    const request =
      allowedTypes.length === 0
        ? Promise.resolve({ alerts: [], total: 0, hasMore: false })
        : fetchAlerts({
            types:
              effectiveSelectedTypes.length > 0
                ? effectiveSelectedTypes
                : allowedTypes,
            ...bounds,
            cameraIndexes: effectiveCameras,
            limit: pageSize,
            countExact: false,
            offset: page * pageSize,
          })

    let cancelled = false

    request.then(async (result) => {
      const episodeIds = Array.from(
        new Set(
          result.alerts
            .map(getLyingPersonEpisodeId)
            .filter((id): id is string => id !== null)
        )
      )
      const episodes = await fetchLyingPersonEpisodes(episodeIds)

      if (cancelled) return

      setAlerts(result.alerts)
      setLyingPersonEpisodes(episodes)
      setTotal(result.total)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [
    effectiveSelectedTypes,
    effectiveCameras,
    period.from,
    period.to,
    page,
    pageSize,
    allowedTypes,
    episodeRefreshTick,
  ])

  const totalPages = Math.ceil(total / pageSize)

  const toggleTypes = (types: readonly string[]) => {
    setLoading(true)
    setPage(0)
    if (types.some((type) => repairTypes.includes(type))) {
      setRepairShortcutSelected(false)
    }
    const typeSet = new Set(types)
    setSelectedTypes((prev) =>
      types.some((type) => prev.includes(type))
        ? prev.filter((type) => !typeSet.has(type))
        : Array.from(new Set([...prev, ...types]))
    )
  }

  const toggleType = (type: string) => {
    toggleTypes([type])
  }

  const toggleRepairShortcut = () => {
    setLoading(true)
    setPage(0)
    setRepairShortcutSelected((prev) => !prev)
  }

  const clearFilters = () => {
    setLoading(true)
    setPage(0)
    setSelectedTypes([])
    setRepairShortcutSelected(false)
    setSelectedCameras([])
    setCameraSearch('')
  }

  const hasFilters =
    selectedTypes.length > 0 || repairShortcutSelected || selectedCameras.length > 0 || !!cameraSearch
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
          effectiveSelectedTypes.length === 0 ||
          effectiveSelectedTypes.includes(alert.alert_type)
        const cameraMatches =
          effectiveCameras === undefined ||
          (alert.camera_index !== null && effectiveCameras.includes(alert.camera_index))
        let periodMatches = false
        try {
          const { fromInclusive, toExclusive } = notificationPeriodBounds(period)
          periodMatches = (!fromInclusive || alert.timestamp >= fromInclusive) && (!toExclusive || alert.timestamp < toExclusive)
        } catch { /* Invalid period has no results. */ }
        return typeMatches && cameraMatches && periodMatches
      }),
    [demoAlerts, effectiveSelectedTypes, effectiveCameras, period.from, period.to]
  )
  const visibleAlerts = useMemo(
    () => [...alerts, ...(page === 0 ? filteredDemoAlerts : [])],
    [alerts, filteredDemoAlerts, page]
  )
  const lyingPersonEpisodesById = useMemo(
    () => new Map(lyingPersonEpisodes.map((episode) => [episode.id, episode])),
    [lyingPersonEpisodes]
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
                  <Button
                    variant={repairShortcutSelected ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={toggleRepairShortcut}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Ремонтная техника
                  </Button>
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

          {hasStops && (
            <>
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <BusFront className="h-4 w-4 text-amber-400" />
                  Остановочные пункты
                </div>
                <div className="flex flex-wrap gap-2">
                  {buildAlertTypeFilterButtons(ALERT_CATEGORIES.bus_stop_monitoring.types, BusFront).map((filter) => {
                    const isSelected = filter.types.some((type) => selectedTypes.includes(type))
                    const Icon = filter.Icon

                    return (
                      <Button
                        key={filter.key}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleTypes(filter.types)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {filter.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Cctv className="h-4 w-4 text-red-400" />
                  Оборудование остановок
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALERT_CATEGORIES.bus_stop_equipment.types.map((type) => {
                    const config = ALERT_TYPE_CONFIG[type]
                    if (!config) return null
                    const Icon = alertIcons[type] || CameraIcon
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

          <CameraPlaceFilter places={places} query={cameraSearch} selected={selectedCameras}
            onQueryChange={value => { setPage(0); setCameraSearch(value) }}
            onSelectionChange={value => { setPage(0); setSelectedCameras(value) }} />
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter value={period} onChange={onPeriodChange} />
        <EventsExport channel="cameras" period={period} filters={{types:(effectiveSelectedTypes.length ? effectiveSelectedTypes : allowedTypes).join(','),cameras:selectedCameras.join(','),search:cameraSearch}} />
      </div>

      <ResultsHeader
        total={alerts.length}
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
            <div className="col-span-2">Остановка</div>
            <div className="col-span-4">Сообщение</div>
            <div className="col-span-1">Точность</div>
            <div className="col-span-1"></div>
          </div>

          {visibleAlerts.map((alert) => {
            const config = ALERT_TYPE_CONFIG[alert.alert_type] || {
              label: "Неизвестное событие",
              color: "text-muted-foreground bg-muted",
            }
            const Icon = alertIcons[alert.alert_type] || Snowflake
            const demoAlert = isDemoAlert(alert)
            const isExpanded = expandedId === alert.id
            const isHighlighted = alert.id === initialAlertId
            const place = places.find(place => place.cameraIndexes.includes(alert.camera_index ?? -1)
              || (alert.module_name === 'stops' && place.cameraIndexes.some(index => index >= 10000 && index - 10000 === alert.camera_index)))
            const stopDisplay = place ? { label: place.label, detail: place.detail } : getAlertStopDisplay(alert)
            const message = getRussianAlertMessage(alert, config.label)
            const episodeId = getLyingPersonEpisodeId(alert)
            const episode = episodeId
              ? lyingPersonEpisodesById.get(episodeId)
              : undefined
            const episodeIsOpen = episode?.status === "open"
            const abandonedEpisode = getAbandonedEpisode(alert)
            const binEpisode = getBinEpisode(alert) || abandonedEpisode
            const timedEvent = binEpisode || episode
            const duration = timedEvent ? formatEventDuration(timedEvent.started_at,
              timedEvent.status === 'open' ? new Date().toISOString() : timedEvent.ended_at || timedEvent.last_seen_at) : ['bin_full', 'lying_person', 'abandoned_object'].includes(alert.alert_type) ? 'не определена' : null

            return (
              <Card
                id={`alert-${alert.id}`}
                key={alert.id}
                className={`transition-all duration-300 hover:border-primary/50 ${
                  demoAlert ? "cursor-default" : "cursor-pointer"
                } ${isExpanded ? "border-primary" : ""} ${
                  isHighlighted
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_15px_rgba(59,130,246,0.35)] dark:shadow-[0_0_15px_rgba(255,255,255,0.15)] border-primary"
                    : ""
                }`}
                onClick={() =>
                  demoAlert ? undefined : setExpandedId(isExpanded ? null : alert.id)
                }
              >
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-2 flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground md:hidden" />
                      <span className="text-muted-foreground md:text-foreground">
                        {binEpisode ? `Начало: ${formatBinTime(binEpisode.started_at)}` : formatTimeAgo(alert.timestamp)}
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

                    <div className="md:col-span-2 min-w-0 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground md:hidden">
                        <BusFront className="h-4 w-4" />
                        <span>Остановка</span>
                      </div>
                      <div className="font-medium truncate">
                        {stopDisplay.label}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {stopDisplay.detail}
                      </div>
                    </div>

                    <div className="md:col-span-4 min-w-0 text-sm">
                      <div className="truncate">{message}</div>
                      {binEpisode && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">
                            {binEpisode.status === "open" ? "Продолжается" : "Завершено"}
                          </Badge>
                          <span>
                            {binEpisode.ended_at
                              ? `Завершено: ${formatBinTime(binEpisode.ended_at)}`
                              : `Последнее обнаружение: ${formatBinTime(binEpisode.last_seen_at)}`}
                          </span>
                        </div>
                      )}
                      {episode && (
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge
                            variant="outline"
                            className={
                              episodeIsOpen
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                            }
                          >
                            {episodeIsOpen ? "Продолжается" : "Завершено"}
                          </Badge>
                          <span className="truncate">
                            {formatTime(episode.started_at)} — {episodeIsOpen ? "продолжается" : formatTime(episode.ended_at || episode.last_seen_at)}
                          </span>

                        </div>
                      )}
                      {duration && <p className="mt-2 font-medium">Длительность: {duration}{timedEvent?.status === 'open' ? ' · продолжается' : ''}</p>}
                    </div>

                    <div className="md:col-span-1">
                      <Badge variant="secondary" className="text-xs">
                        <span className="md:hidden">Точность: </span>
                        {formatCameraConfidence(alert)}
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
                        {binEpisode ? (
                          (() => {
                            const binEpisodeItems = [
                              { label: abandonedEpisode ? "До — предмет оставлен" : "До — переполненная урна",
                                url: binEpisode.first_image_url || alert.clip_path,
                                time: binEpisode.first_image_at, empty: "Фото недоступно" },
                              { label: abandonedEpisode ? "После — предмет убран" : "После — очищенная урна", url: binEpisode.closed_image_url,
                                time: binEpisode.closed_image_at || binEpisode.ended_at, empty: binEpisode.status === "open" ? "Событие продолжается" : "Фото завершения недоступно" },
                            ]
                            const binEpisodeImages: LightboxImage[] = binEpisodeItems
                              .filter((item) => !!item.url)
                              .map((item) => ({ src: item.url as string, alt: item.label, label: item.label }))
                            return (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                                {binEpisodeItems.map(({ label, url, time, empty }) => <div key={label} className="space-y-1.5">
                                  <div className="text-xs font-medium text-muted-foreground">{label}</div>
                                  <MediaFrame className="h-[180px] lg:h-[200px]">
                                    {url ? (
                                      <MediaPhoto
                                        src={url}
                                        alt={label}
                                        onExpand={() => openLightbox(binEpisodeImages, url)}
                                      />
                                    ) : <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">{empty}</div>}
                                  </MediaFrame>
                                  {time && <div className="text-xs text-muted-foreground">{formatBinTime(time)}</div>}
                                </div>)}
                              </div>
                            )
                          })()
                        ) : episode ? (
                          (() => {
                            const episodeItems = [
                              {
                                label: "До — начало события",
                                imageUrl: episode.first_image_url,
                              },
                              {
                                label: "После — событие завершено",
                                imageUrl: episode.status === "closed" ? closedEpisodeImage(alert.metadata) : null,
                              },
                            ]
                            const episodeImages: LightboxImage[] = episodeItems
                              .filter((item) => !!item.imageUrl)
                              .map((item) => ({
                                src: versionEpisodeImage(item.imageUrl as string, episode.updated_at),
                                alt: `${config.label}: ${item.label.toLowerCase()}`,
                                label: item.label,
                              }))
                            return (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                                {episodeItems.map(({ label, imageUrl }) => {
                                  const src = imageUrl ? versionEpisodeImage(imageUrl, episode.updated_at) : null
                                  return (
                                    <div key={label} className="space-y-1.5">
                                      <div className="text-xs font-medium text-muted-foreground">
                                        {label}
                                      </div>
                                      <MediaFrame className="h-[180px] lg:h-[200px]">
                                        {src ? (
                                          <MediaPhoto
                                            src={src}
                                            alt={`${config.label}: ${label.toLowerCase()}`}
                                            onExpand={() => openLightbox(episodeImages, src)}
                                          />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                                            {label.startsWith("После") ? episodeIsOpen ? "Событие продолжается" : "Фото завершения недоступно" : "Фото недоступно"}
                                          </div>
                                        )}
                                      </MediaFrame>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()
                        ) : (
                          <MediaFrame>
                            {alert.clip_path ? (
                              (() => {
                                const isImage =
                                  alert.clip_path &&
                                  alert.clip_path
                                    .toLowerCase()
                                    .match(/\.(jpg|jpeg|png)$/)
                                return isImage ? (
                                  <MediaPhoto
                                    src={alert.clip_path}
                                    alt={config.label}
                                    onExpand={() => openLightbox([{ src: alert.clip_path as string, alt: config.label, label: config.label }])}
                                  />
                                ) : (
                                  <video
                                    className="w-full h-full object-contain"
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
                          </MediaFrame>
                        )}

                        <div className="space-y-3 text-sm">
                      {episode && (
                            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                              <div>
                                <div className="text-muted-foreground">Статус</div>
                                <div className="font-medium">
                                  {episodeIsOpen ? "Продолжается" : "Завершено"}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Длительность</div>
                                <div className="font-medium">
                                  {duration}
                                </div>
                              </div>
                              <div className="col-span-2">
                                <div className="text-muted-foreground">Начало и завершение</div>
                                <div className="font-medium">
                                  {formatTime(episode.started_at)} — {episodeIsOpen ? "продолжается" : formatTime(episode.ended_at || episode.last_seen_at)}
                                </div>
                              </div>

                            </div>
                          )}
                          <div>
                            <div className="text-muted-foreground">
                              Остановка
                            </div>
                            <div className="font-medium">
                              {stopDisplay.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {stopDisplay.detail}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              Время события
                            </div>
                            <div className="font-medium">
                              {formatTime(alert.timestamp)}
                            </div>
                          </div>
                          {alert.clip_path &&
                            !binEpisode &&
                            !episode &&
                            !alert.clip_path.toLowerCase().match(/\.(jpg|jpeg|png)$/) && (
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
                                  Скачать видео
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

      {lightboxProps && <MediaLightbox {...lightboxProps} />}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Controller Alerts Tab
// ═══════════════════════════════════════════════════════════════════════
function ControllerCategoryIcon({
  category,
  className,
}: {
  category: string
  className: string
}) {
  if (category === "temperature") return <Thermometer className={className} />
  if (category === "humidity") return <Droplets className={className} />
  if (category === "incident" || category === "glass_break" || category === "digital input") return <Hammer className={className} />
  if (category === "controller_offline") return <WifiOff className={className} />
  if (category === "controller_online") return <Wifi className={className} />
  return <Activity className={className} />
}

function ControllerAlertsTab({ period, onPeriodChange }: { period: NotificationPeriod; onPeriodChange: (value: NotificationPeriod) => void }) {
  const [selectedElements, setSelectedElements] = useState<number[]>([])
  const [selectedAlarms, setSelectedAlarms] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [alerts, setAlerts] = useState<ControllerAlert[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { lightboxProps, openLightbox } = useMediaLightbox()

  useEffect(() => { setPage(0) }, [period.from, period.to])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    let bounds
    try { bounds = notificationPeriodBounds(period) } catch {
      setAlerts([]); setTotal(0); setLoading(false); return
    }
    fetchControllerAlerts({
      ...bounds,
      elements: selectedElements.length > 0 ? selectedElements : undefined,
      alarms: selectedAlarms.length > 0 ? selectedAlarms : undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      limit: pageSize,
            countExact: false,
      offset: page * pageSize,
    }).then((result) => {
      if (cancelled) return
      setAlerts(result.alerts)
      setTotal(result.total)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedElements, selectedAlarms, selectedCategories, page, pageSize, period.from, period.to])

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
              {[GLASS_BREAK_ELEMENT, CLIMATE_ELEMENT].map((el) => {
                const isSelected = selectedElements.includes(el)
                return (
                  <Button
                    key={el}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => toggleElement(el)}
                  >
                    {el === GLASS_BREAK_ELEMENT
                      ? <Hammer className="h-3.5 w-3.5" />
                      : <Thermometer className="h-3.5 w-3.5" />}
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
              {FILTERABLE_CATEGORIES.map((key) => {
                const label = CATEGORY_LABELS[key]
                const isSelected = selectedCategories.includes(key)
                return (
                  <Button
                    key={key}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => toggleCategory(key)}
                  >
                    <ControllerCategoryIcon category={key} className="h-3.5 w-3.5" />
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter value={period} onChange={onPeriodChange} />
        <EventsExport channel="sensors" period={period} filters={{elements:selectedElements.join(','),alarms:selectedAlarms.join(','),categories:selectedCategories.join(',')}} />
      </div>

      <ResultsHeader
        total={alerts.length}
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
          <div className="hidden md:grid md:grid-cols-[minmax(8rem,_1fr)_minmax(10rem,_1.3fr)_minmax(8rem,_1fr)_minmax(6rem,_0.8fr)_minmax(12rem,_1.6fr)_minmax(0,_1.5fr)_2rem] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="min-w-0">Время</div>
            <div className="min-w-0">Датчик</div>
            <div className="min-w-0">Категория</div>
            <div className="min-w-0">Значение</div>
            <div className="min-w-0">Статус</div>
            <div className="min-w-0">Сообщение</div>
            <div className="min-w-0"></div>
          </div>

          {alerts.map((alert) => {
            const alarmCfg = ALARM_CONFIG[alert.alarm] || {
              label: "Неизвестный статус",
              color: "text-muted-foreground bg-muted",
            }
            const prevAlarmCfg = alert.prev_alarm
              ? ALARM_CONFIG[alert.prev_alarm]
              : null
            const categoryLabel =
              CATEGORY_LABELS[alert.category] || "Другая категория"
            const unit = isControllerLinkAlert(alert) ? "мин" : alert.category === "temperature" ? "°C" : alert.category === "humidity" ? "%" : ""
            const message = getRussianControllerMessage(
              alert.message,
              categoryLabel,
              alarmCfg.label
            )
            const hasMedia = Boolean(alert.clip_path)
            const isExpanded = expandedId === alert.id

            return (
              <Card
                key={alert.id}
                className={`transition-all duration-300 hover:border-primary/50 ${
                  hasMedia ? "cursor-pointer" : ""
                } ${isExpanded ? "border-primary" : ""}`}
                onClick={() =>
                  hasMedia ? setExpandedId(isExpanded ? null : alert.id) : undefined
                }
              >
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 gap-4 items-center md:grid-cols-[minmax(8rem,_1fr)_minmax(10rem,_1.3fr)_minmax(8rem,_1fr)_minmax(6rem,_0.8fr)_minmax(12rem,_1.6fr)_minmax(0,_1.5fr)_2rem]">
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
                      {getControllerAlertSourceLabel(alert)}
                    </div>

                    {/* Category */}
                    <div className="min-w-0">
                      <Badge
                        variant="outline"
                        className="max-w-full gap-1.5 overflow-hidden"
                      >
                        <ControllerCategoryIcon category={alert.category} className="h-3 w-3" />
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
                      {message}
                      {alert.category === 'controller_online' && Number.isFinite(Date.parse(alert.created_at)) && Number.isFinite(alert.value) && alert.value >= 0 && <p className="mt-2 whitespace-normal font-medium text-foreground">Длительность отключения: {formatEventDuration(new Date(Date.parse(alert.created_at) - alert.value * 60_000).toISOString(), alert.created_at)}</p>}
                    </div>

                    {/* Chevron icon indicator for media */}
                    <div className="hidden md:flex justify-end items-center">
                      {hasMedia && (
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Expanded view when alert has image / clip */}
                  {isExpanded && hasMedia && alert.clip_path && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <MediaFrame>
                          {alert.clip_path.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/) ? (
                            <MediaPhoto
                              src={alert.clip_path}
                              alt={categoryLabel}
                              onExpand={() => openLightbox([{ src: alert.clip_path as string, alt: categoryLabel, label: categoryLabel }])}
                            />
                          ) : (
                            <video
                              className="w-full h-full object-contain"
                              controls
                              preload="metadata"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <source src={alert.clip_path} type="video/mp4" />
                            </video>
                          )}
                        </MediaFrame>

                        <div className="space-y-3 text-sm">
                          <div>
                            <div className="text-muted-foreground">Датчик</div>
                            <div className="font-medium">
                              {getSensorLabel(alert.element)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Элемент #{alert.element}, адрес #{alert.address}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              Время фиксации
                            </div>
                            <div className="font-medium">
                              {formatTime(alert.created_at)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Категория</div>
                            <div className="font-medium">{categoryLabel}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Сообщение</div>
                            <div className="font-medium">{message}</div>
                          </div>
                          {!alert.clip_path.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/) && (
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
                                Скачать видео
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

      {lightboxProps && <MediaLightbox {...lightboxProps} />}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════
function NotificationsContent() {
  const { modules, hasModule, loading: modulesLoading } = useModuleAccess()
  const [cameras, setCameras] = useState<Camera[]>([])
  const [stops, setStops] = useState<BusStopProperties[]>([])
  const [period, setPeriod] = useState<NotificationPeriod>({ from: '', to: '' })
  const [tab, setTab] = useState('camera')
  const places = useMemo(() => buildCameraPlaces(cameras, stops), [cameras, stops])

  useEffect(() => {
    if (modulesLoading) return
    let cancelled = false
    fetchCameraDirectory(modules).then(value => { if (!cancelled) setCameras(value) }).catch(() => { if (!cancelled) setCameras([]) })
    if (modules.includes('stops')) fetchStopDirectory().then(value => { if (!cancelled) setStops(value.features.map(feature => feature.properties)) }).catch(() => { if (!cancelled) setStops([]) })
    else setStops([])
    return () => { cancelled = true }
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
              События с камер города и датчиков
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={setTab} className="space-y-6">
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
              <CameraAlertsTab cameras={cameras} places={places} period={period} onPeriodChange={setPeriod} />
            </TabsContent>

            {showStops && (
              <TabsContent value="controller">
                <ControllerAlertsTab period={period} onPeriodChange={setPeriod} />
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
