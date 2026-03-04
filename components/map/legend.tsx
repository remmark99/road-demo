"use client"

import { useEffect, useState } from "react"
import { fetchCameras } from "@/lib/api/cameras"
import { HIGHWAY_CONFIG } from "@/lib/api/roads"
import type { Camera, RoadStatus } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Camera as CameraIcon, Route, MapPin } from "lucide-react"

const statusLabels: Record<RoadStatus, string> = {
  clean: "Чистый",
  dirty: "Загрязнён",
  warning: "Требует внимания",
  unknown: "Нет данных"
}

interface LegendProps {
  statusOverride?: Record<string, RoadStatus>
  hoveredSegmentId?: string | null
  onHoverSegment?: (segmentId: string | null) => void
}

// Show the road types we display on the map
const LEGEND_HIGHWAYS = [
  "trunk",
  "primary",
  "secondary",
  "tertiary",
]

export function Legend({ statusOverride, hoveredSegmentId, onHoverSegment }: LegendProps) {
  const [cameras, setCameras] = useState<Camera[]>([])

  useEffect(() => {
    fetchCameras().then(setCameras)
  }, [])

  const onlineCameras = cameras.filter(c => c.status === "online").length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Информация
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-2">
            <Route className="h-4 w-4 text-muted-foreground" />
            Состояние участков
          </div>
          <div className="space-y-1.5">
            {([
              { status: "clean" as RoadStatus, color: "bg-road-clean" },
              { status: "dirty" as RoadStatus, color: "bg-road-dirty" },
              { status: "warning" as RoadStatus, color: "bg-road-warning" },
              { status: "unknown" as RoadStatus, color: "bg-road-unknown" }
            ]).map(({ status, color }) => (
              <div key={status} className="flex items-center gap-2 text-sm">
                <div className={`w-4 h-1 rounded-full ${color}`} />
                <span className="text-muted-foreground">{statusLabels[status]}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-2">
            <CameraIcon className="h-4 w-4 text-muted-foreground" />
            Камеры
            <Badge variant="outline" className="ml-auto text-xs">
              {onlineCameras}/{cameras.length}
            </Badge>
          </div>
          <ScrollArea className="h-24">
            <div className="space-y-1.5">
              {cameras.filter(c => c.status === "online").map(camera => (
                <div key={camera.id} className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-road-clean" />
                  <span className="text-muted-foreground truncate">{camera.name}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <Separator />

        {/* Road types legend */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-2">
            <Route className="h-4 w-4 text-muted-foreground" />
            Типы дорог
          </div>
          <div className="space-y-1.5">
            {LEGEND_HIGHWAYS.map(highway => {
              const cfg = HIGHWAY_CONFIG[highway]
              if (!cfg) return null
              return (
                <div key={highway} className="flex items-center gap-2 text-sm">
                  <div
                    className="rounded-full"
                    style={{
                      width: `${Math.max(cfg.width * 4, 8)}px`,
                      height: `${Math.max(cfg.width, 2)}px`,
                      backgroundColor: cfg.color,
                      opacity: cfg.opacity,
                    }}
                  />
                  <span className="text-muted-foreground">{cfg.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
