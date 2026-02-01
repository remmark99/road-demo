"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { fetchAlerts, fetchAlertTypes, ALERT_TYPE_CONFIG } from "@/lib/api/alerts"
import { fetchCameras } from "@/lib/api/cameras"
import type { Alert, Camera } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
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
  Camera as CameraIcon
} from "lucide-react"

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const alertIcons: Record<string, typeof Truck> = {
  snowplow: Truck,
  canny: Snowflake
}

export default function NotificationsPage() {
  const searchParams = useSearchParams()
  const initialCamera = searchParams.get('camera')

  // Filters state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedCameras, setSelectedCameras] = useState<number[]>(
    initialCamera ? [parseInt(initialCamera)] : []
  )

  // Data state
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Pagination state
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  // Expanded alert
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Fetch cameras for filter dropdown
  useEffect(() => {
    fetchCameras().then(setCameras)
  }, [])

  // Fetch alerts when filters or pagination changes
  useEffect(() => {
    setLoading(true)
    fetchAlerts({
      types: selectedTypes.length > 0 ? selectedTypes : undefined,
      cameraIndexes: selectedCameras.length > 0 ? selectedCameras : undefined,
      limit: pageSize,
      offset: page * pageSize
    }).then(result => {
      setAlerts(result.alerts)
      setTotal(result.total)
      setLoading(false)
    })
  }, [selectedTypes, selectedCameras, page, pageSize])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [selectedTypes, selectedCameras, pageSize])

  const totalPages = Math.ceil(total / pageSize)

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const formatTimeAgo = (dateStr: string) => {
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

  const getCameraName = (index: number | null) => {
    if (index === null) return "—"
    const cam = cameras.find(c => c.cameraIndex === index)
    return cam ? cam.name : `Камера #${index}`
  }

  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const toggleCamera = (index: number) => {
    setSelectedCameras(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  const clearFilters = () => {
    setSelectedTypes([])
    setSelectedCameras([])
  }

  const hasFilters = selectedTypes.length > 0 || selectedCameras.length > 0

  // Online cameras for filter
  const onlineCameras = cameras.filter(c => c.status === "online")

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
              События с камер мониторинга
            </p>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
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
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Type filter */}
              <div>
                <div className="text-sm text-muted-foreground mb-2">Тип события</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ALERT_TYPE_CONFIG).map(([type, config]) => {
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

              {/* Camera filter */}
              <div>
                <div className="text-sm text-muted-foreground mb-2">Камеры</div>
                <div className="flex flex-wrap gap-2">
                  {onlineCameras.slice(0, 10).map(camera => {
                    const isSelected = selectedCameras.includes(camera.cameraIndex)
                    return (
                      <Button
                        key={camera.cameraIndex}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => toggleCamera(camera.cameraIndex)}
                      >
                        <CameraIcon className="h-3 w-3" />
                        #{camera.cameraIndex}
                      </Button>
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
                    Выбрано: {selectedCameras.map(i => `#${i}`).join(", ")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">
              {loading ? (
                "Загрузка..."
              ) : (
                <>Найдено: <span className="font-medium text-foreground">{total}</span> уведомлений</>
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
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Alerts table/list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : alerts.length === 0 ? (
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
                <div className="col-span-1">Severity</div>
                <div className="col-span-1"></div>
              </div>

              {/* Alert rows */}
              {alerts.map(alert => {
                const config = ALERT_TYPE_CONFIG[alert.alert_type] || {
                  label: alert.alert_type,
                  color: 'text-muted-foreground bg-muted'
                }
                const Icon = alertIcons[alert.alert_type] || Snowflake
                const isExpanded = expandedId === alert.id

                return (
                  <Card
                    key={alert.id}
                    className={`transition-colors cursor-pointer hover:border-primary/50 ${isExpanded ? 'border-primary' : ''
                      }`}
                    onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                  >
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* Time */}
                        <div className="md:col-span-2 flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground md:hidden" />
                          <span className="text-muted-foreground md:text-foreground">
                            {formatTimeAgo(alert.timestamp)}
                          </span>
                        </div>

                        {/* Type */}
                        <div className="md:col-span-2">
                          <Badge className={`gap-1.5 ${config.color}`}>
                            <Icon className="h-3 w-3" />
                            {config.label}
                          </Badge>
                        </div>

                        {/* Camera */}
                        <div className="md:col-span-2 text-sm">
                          <span className="text-muted-foreground md:hidden">Камера: </span>
                          {getCameraName(alert.camera_index)}
                        </div>

                        {/* Message */}
                        <div className="md:col-span-4 text-sm truncate">
                          {alert.message}
                        </div>

                        {/* Severity */}
                        <div className="md:col-span-1">
                          <Badge variant="secondary" className="text-xs">
                            {alert.severity >= 0.7 ? "Высокая" : alert.severity >= 0.4 ? "Средняя" : "Низкая"}
                          </Badge>
                        </div>

                        {/* Expand indicator */}
                        <div className="md:col-span-1 flex justify-end">
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''
                            }`} />
                        </div>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Video */}
                            <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                              {alert.clip_path ? (
                                <video
                                  className="w-full h-full object-cover"
                                  controls
                                  preload="metadata"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <source src={alert.clip_path} type="video/mp4" />
                                </video>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <p className="text-muted-foreground text-sm">Видео недоступно</p>
                                </div>
                              )}
                            </div>

                            {/* Details */}
                            <div className="space-y-3 text-sm">
                              <div>
                                <div className="text-muted-foreground">Время события</div>
                                <div className="font-medium">{formatTime(alert.timestamp)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Модуль</div>
                                <div className="font-medium">{alert.module_name}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Источник видео</div>
                                <div className="font-medium truncate">{alert.source_video}</div>
                              </div>
                              {alert.clip_path && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                  onClick={e => e.stopPropagation()}
                                >
                                  <a href={alert.clip_path} download target="_blank" rel="noopener noreferrer">
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Страница {page + 1} из {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Назад
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Вперёд
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
