"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { roadSegments, notifications } from "@/lib/mock-data"
import { fetchCameras } from "@/lib/api/cameras"
import type { Camera } from "@/lib/types"
import { Camera as CameraIcon, Route, AlertTriangle, Clock } from "lucide-react"

export function StatsCards() {
  const [cameras, setCameras] = useState<Camera[]>([])

  useEffect(() => {
    fetchCameras().then(setCameras)
  }, [])

  const cleanSegments = roadSegments.filter(s => s.currentStatus === "clean").length
  const onlineCameras = cameras.filter(c => c.status === "online").length
  const recentAlerts = notifications.filter(n => n.type === "alert").length

  const stats = [
    {
      title: "Всего участков",
      value: roadSegments.length,
      description: `${cleanSegments} из ${roadSegments.length} чистые`,
      icon: Route,
      color: "text-chart-1"
    },
    {
      title: "Камеры онлайн",
      value: `${onlineCameras}/${cameras.length}`,
      description: "Активных камер",
      icon: CameraIcon,
      color: "text-chart-2"
    },
    {
      title: "Оповещений сегодня",
      value: recentAlerts,
      description: "Требуют внимания",
      icon: AlertTriangle,
      color: "text-chart-3"
    },
    {
      title: "Среднее время уборки",
      value: "2.5 ч",
      description: "За последнюю неделю",
      icon: Clock,
      color: "text-chart-4"
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </div>
                <div className={`p-3 rounded-lg bg-secondary ${stat.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
