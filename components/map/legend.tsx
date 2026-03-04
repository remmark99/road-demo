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

        {/* Bus Stops legend */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M8 6v6" /><path d="M15 6v6" /><path d="M2 12h19.6" /><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>
            Общественный транспорт
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
              <span className="text-muted-foreground">Автобусная остановка</span>
            </div>
          </div>
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
