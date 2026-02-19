"use client"

import type { Alert } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  PlayCircle,
  Snowflake,
  Droplets,
  CircleAlert
} from "lucide-react"
import { cn } from "@/lib/utils"

const typeConfig: Record<string, { icon: typeof AlertTriangle; label: string; className: string }> = {
  snow_covered: {
    icon: Snowflake,
    label: "Снег на дороге",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30"
  },
  snow_clear: {
    icon: Snowflake,
    label: "Дорога очищена",
    className: "bg-green-500/20 text-green-400 border-green-500/30"
  },
  puddle: {
    icon: Droplets,
    label: "Лужа",
    className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
  },
  pothole: {
    icon: CircleAlert,
    label: "Яма",
    className: "bg-destructive/20 text-destructive border-destructive/30"
  },
  default: {
    icon: AlertTriangle,
    label: "Событие",
    className: "bg-chart-4/20 text-chart-4 border-chart-4/30"
  }
}

interface NotificationCardProps {
  alert: Alert
  isExpanded: boolean
  onToggle: () => void
}

export function NotificationCard({ alert, isExpanded, onToggle }: NotificationCardProps) {
  const config = typeConfig[alert.alert_type] || typeConfig.default
  const Icon = config.icon
  const isImage = alert.clip_path?.toLowerCase().match(/\.(jpg|jpeg|png)$/)

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 60) return `${minutes} мин. назад`
    if (hours < 24) return `${hours} ч. назад`
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const severityLabel = alert.severity >= 0.7
    ? "Высокая"
    : alert.severity >= 0.4
      ? "Средняя"
      : "Низкая"

  return (
    <Card className={cn(
      "transition-all cursor-pointer hover:border-primary/50",
      isExpanded && "border-primary"
    )}>
      <CardHeader className="pb-2" onClick={onToggle}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn(
              "p-2 rounded-lg border",
              config.className
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{config.label}</CardTitle>
              <CardDescription className="mt-1">
                {alert.message}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {severityLabel}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(alert.timestamp)}
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="border-t border-border pt-4 mt-2">
            {/* Video clip */}
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              {alert.clip_path ? (
                isImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={alert.clip_path}
                    alt={config.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    className="w-full h-full object-cover"
                    controls
                    preload="metadata"
                  >
                    <source src={alert.clip_path} type="video/mp4" />
                    Ваш браузер не поддерживает видео
                  </video>
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="relative w-full h-full bg-black/80">
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <PlayCircle className="h-16 w-16 text-primary/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Видео недоступно
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">
                Время события: {new Date(alert.timestamp).toLocaleString("ru-RU")}
              </span>
              {alert.clip_path && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a href={alert.clip_path} download target="_blank" rel="noopener noreferrer">
                    {isImage ? "Скачать фото" : "Скачать видео"}
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
