"use client"

import { useEffect, useState } from "react"
import { fetchCameras } from "@/lib/api/cameras"
import { HIGHWAY_CONFIG } from "@/lib/api/roads"
import type { Camera } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Camera as CameraIcon, Route, MapPin, Snowflake } from "lucide-react"

const snowStatusItems = [
  { label: "Чисто", color: "#4ade80" },
  { label: "Требует внимания", color: "#f59e0b" },
  { label: "Заснежено", color: "#ef4444" },
]

// Show the road types we display on the map
const LEGEND_HIGHWAYS = [
  "trunk",
  "primary",
  "secondary",
  "tertiary",
]

export function Legend() {
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
        {/* Snow status legend */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-2">
            <Snowflake className="h-4 w-4 text-muted-foreground" />
            Состояние дорог
          </div>
          <div className="space-y-1.5">
            {snowStatusItems.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <div
                  className="w-6 h-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-muted-foreground">{label}</span>
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

        {/* Road types by width */}
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
                    className="rounded-full bg-muted-foreground"
                    style={{
                      width: `${Math.max(cfg.width * 4, 8)}px`,
                      height: `${Math.max(cfg.width, 2)}px`,
                      opacity: 0.5,
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
