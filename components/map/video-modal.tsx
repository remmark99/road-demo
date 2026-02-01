"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import Link from "next/link"
import type { Camera, Alert } from "@/lib/types"
import { fetchAlertsByCamera, ALERT_TYPE_CONFIG } from "@/lib/api/alerts"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Video, Wifi, WifiOff, Loader2, Bell, Truck, Snowflake, ChevronRight, Clock } from "lucide-react"
import Hls from "hls.js"

const alertIcons: Record<string, typeof Truck> = {
  snowplow: Truck,
  canny: Snowflake
}

interface VideoModalProps {
  camera: Camera | null
  onClose: () => void
}

export function VideoModal({ camera, onClose }: VideoModalProps) {
  const hlsRef = useRef<Hls | null>(null)
  const [streamStatus, setStreamStatus] = useState<"loading" | "online" | "offline">("loading")
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)

  // Fetch recent alerts for this camera
  useEffect(() => {
    if (!camera) return

    setAlertsLoading(true)
    fetchAlertsByCamera(camera.cameraIndex, 5)
      .then(setRecentAlerts)
      .finally(() => setAlertsLoading(false))
  }, [camera?.cameraIndex])

  // Callback ref that initializes HLS when the video element is mounted
  const videoRef = useCallback((videoElement: HTMLVideoElement | null) => {
    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!videoElement || !camera?.hlsUrl) {
      setStreamStatus("offline")
      return
    }

    setStreamStatus("loading")

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingTimeOut: 5000,
        manifestLoadingMaxRetry: 2,
      })

      hlsRef.current = hls
      hls.loadSource(camera.hlsUrl)
      hls.attachMedia(videoElement)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamStatus("online")
        videoElement.play().catch(() => {
          // Autoplay blocked, user needs to interact
        })
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error("HLS error:", data)
        if (data.fatal) {
          setStreamStatus("offline")
          hls.destroy()
          hlsRef.current = null
        }
      })
    } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari)
      videoElement.src = camera.hlsUrl
      videoElement.addEventListener("loadedmetadata", () => {
        setStreamStatus("online")
        videoElement.play().catch(() => { })
      })
      videoElement.addEventListener("error", (e) => {
        console.error("Video error:", e)
        setStreamStatus("offline")
      })
    } else {
      setStreamStatus("offline")
    }
  }, [camera?.hlsUrl])

  if (!camera) return null

  const hasHlsStream = !!camera.hlsUrl
  const isOnline = hasHlsStream ? streamStatus === "online" : camera.status === "online"
  const isLoading = hasHlsStream && streamStatus === "loading"

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 60) return `${minutes} мин.`
    if (hours < 24) return `${hours} ч.`
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  }

  return (
    <Dialog open={!!camera} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {camera.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {camera.description}
            <Badge variant={isOnline ? "default" : "secondary"}>
              {isLoading ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Подключение...</>
              ) : isOnline ? (
                <><Wifi className="h-3 w-3 mr-1" /> Онлайн</>
              ) : (
                <><WifiOff className="h-3 w-3 mr-1" /> Оффлайн</>
              )}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
          {hasHlsStream ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                controls
                muted
                playsInline
              />
              {streamStatus === "loading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                  <p className="text-muted-foreground">Подключение к потоку...</p>
                </div>
              )}
              {streamStatus === "offline" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Поток недоступен</p>
                  <p className="text-xs text-muted-foreground mt-1">{camera.hlsUrl}</p>
                </div>
              )}
            </>
          ) : camera.status === "online" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="relative w-full h-full bg-black">
                <div className="absolute inset-0 opacity-20">
                  <div className="w-full h-full" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                    backgroundSize: "256px 256px"
                  }} />
                </div>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <Video className="h-12 w-12 mb-4 text-primary" />
                  <p className="text-lg font-medium">Видеопоток RTSP</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {camera.rtspUrl}
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">
                    Подключите IP камеры для просмотра потока
                  </p>
                </div>

                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                  <span className="text-xs text-white/80">REC</span>
                </div>

                <div className="absolute bottom-4 right-4 text-xs text-white/60 font-mono">
                  {new Date().toLocaleString("ru-RU")}
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <WifiOff className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Камера недоступна</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-muted-foreground">Протокол</div>
            <div className="font-medium">{hasHlsStream ? "HLS" : "RTSP"}</div>
          </div>
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-muted-foreground">Разрешение</div>
            <div className="font-medium">1920x1080</div>
          </div>
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-muted-foreground">FPS</div>
            <div className="font-medium">25</div>
          </div>
        </div>

        <Separator />

        {/* Recent Alerts Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Недавние события
            </h3>
            <Link href={`/notifications?camera=${camera.cameraIndex}`}>
              <Button variant="ghost" size="sm" className="text-xs">
                Все уведомления
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>

          {alertsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentAlerts.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Нет событий с этой камеры
            </div>
          ) : (
            <div className="space-y-2">
              {recentAlerts.map(alert => {
                const config = ALERT_TYPE_CONFIG[alert.alert_type] || ALERT_TYPE_CONFIG.canny
                const Icon = alertIcons[alert.alert_type] || Snowflake
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className={`p-1.5 rounded ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{config.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{alert.message}</div>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(alert.timestamp)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
