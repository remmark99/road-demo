"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { roadSegments } from "@/lib/mock-data"
import { fetchCameras } from "@/lib/api/cameras"
import type { Camera, RoadStatus } from "@/lib/types"
import { VideoModal } from "./video-modal"

const statusColors: Record<RoadStatus, string> = {
  clean: "#4ade80",
  dirty: "#ef4444",
  warning: "#f59e0b",
  unknown: "#6b7280"
}

const getMapStyle = (isDark: boolean) => ({
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: isDark
        ? [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
        ]
        : [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      minzoom: 0,
      maxzoom: 19
    }
  ]
})

// Generate FOV polygon coordinates using proper geodesic math
function generateFovPolygon(
  lat: number,
  lng: number,
  direction: number,
  angle: number,
  distance: number
): [number, number][] {
  const points: [number, number][] = []
  const numPoints = 20 // segments for arc

  // Earth's radius in meters
  const R = 6371000

  // Convert lat to radians for proper calculation
  const latRad = lat * (Math.PI / 180)

  // Meters per degree at this latitude
  const metersPerDegLat = (Math.PI * R) / 180
  const metersPerDegLng = metersPerDegLat * Math.cos(latRad)

  // Start at camera position
  points.push([lng, lat])

  // Generate arc points
  const startAngle = direction - angle / 2
  const endAngle = direction + angle / 2

  for (let i = 0; i <= numPoints; i++) {
    const currentAngle = startAngle + (endAngle - startAngle) * (i / numPoints)
    // Convert to radians, 0 = North, clockwise positive
    const bearing = currentAngle * (Math.PI / 180)

    // Calculate offset in meters
    const dNorth = distance * Math.cos(bearing)
    const dEast = distance * Math.sin(bearing)

    // Convert to degrees
    const dLat = dNorth / metersPerDegLat
    const dLng = dEast / metersPerDegLng

    points.push([lng + dLng, lat + dLat])
  }

  // Close polygon
  points.push([lng, lat])

  return points
}

interface SurgutMapProps {
  selectedTime?: Date
  statusOverride?: Record<string, RoadStatus>
}

export function SurgutMap({ statusOverride }: SurgutMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [isDark, setIsDark] = useState(true)
  const [showOffline, setShowOffline] = useState(false)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [hoveredCamera, setHoveredCamera] = useState<Camera | null>(null)

  // Fetch cameras from Supabase
  useEffect(() => {
    fetchCameras().then(setCameras)
  }, [])

  // Watch for theme changes
  useEffect(() => {
    const checkTheme = () => {
      const dark = document.documentElement.classList.contains("dark")
      setIsDark(dark)
    }

    checkTheme()

    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    })

    return () => observer.disconnect()
  }, [])

  // Update map style when theme changes
  useEffect(() => {
    if (!map.current) return

    const center = map.current.getCenter()
    const zoom = map.current.getZoom()

    map.current.setStyle(getMapStyle(isDark))

    map.current.once("style.load", () => {
      map.current?.setCenter(center)
      map.current?.setZoom(zoom)
      addRoadSegments()
      addCameraMarkers()
    })
  }, [isDark])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const initialDark = document.documentElement.classList.contains("dark")

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyle(initialDark),
      center: [73.406, 61.253],
      zoom: 15
    })

    map.current.addControl(new maplibregl.NavigationControl(), "top-right")

    map.current.on("load", () => {
      addRoadSegments()
    })

    return () => {
      markersRef.current.forEach(marker => marker.remove())
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Add camera markers when cameras load or showOffline changes
  useEffect(() => {
    if (!map.current?.isStyleLoaded() || cameras.length === 0) return
    addCameraMarkers()
  }, [cameras, showOffline])

  // Update/show FOV when hovering
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return

    const sourceId = "camera-fov"
    const layerId = "camera-fov-layer"

    // Remove existing layer/source
    if (map.current.getLayer(layerId)) {
      map.current.removeLayer(layerId)
    }
    if (map.current.getSource(sourceId)) {
      map.current.removeSource(sourceId)
    }

    if (!hoveredCamera) return

    const fovCoords = generateFovPolygon(
      hoveredCamera.lat,
      hoveredCamera.lng,
      hoveredCamera.fovDirection,
      hoveredCamera.fovAngle,
      hoveredCamera.fovDistance
    )

    map.current.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [fovCoords]
        }
      }
    })

    map.current.addLayer({
      id: layerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": hoveredCamera.status === "online" ? "#4ade80" : "#6b7280",
        "fill-opacity": 0.3
      }
    })

    // Add outline
    map.current.addLayer({
      id: `${layerId}-outline`,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": hoveredCamera.status === "online" ? "#22c55e" : "#9ca3af",
        "line-width": 2,
        "line-opacity": 0.8
      }
    })

    return () => {
      if (map.current?.getLayer(`${layerId}-outline`)) {
        map.current.removeLayer(`${layerId}-outline`)
      }
    }
  }, [hoveredCamera])

  // Update road colors when statusOverride changes
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return

    roadSegments.forEach(segment => {
      const status = statusOverride?.[segment.id] ?? segment.currentStatus
      const color = statusColors[status]

      if (map.current?.getLayer(`road-${segment.id}`)) {
        map.current.setPaintProperty(`road-${segment.id}`, "line-color", color)
      }
    })
  }, [statusOverride])

  function addRoadSegments() {
    if (!map.current) return

    roadSegments.forEach(segment => {
      const status = statusOverride?.[segment.id] ?? segment.currentStatus
      const color = statusColors[status]

      if (map.current!.getSource(`road-${segment.id}`)) return

      map.current!.addSource(`road-${segment.id}`, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { name: segment.name },
          geometry: {
            type: "LineString",
            coordinates: segment.coordinates
          }
        }
      })

      // Background line (wider, for glow effect)
      map.current!.addLayer({
        id: `road-${segment.id}-glow`,
        type: "line",
        source: `road-${segment.id}`,
        layout: {
          "line-join": "round",
          "line-cap": "round"
        },
        paint: {
          "line-color": color,
          "line-width": 12,
          "line-opacity": 0.3
        }
      })

      // Main line
      map.current!.addLayer({
        id: `road-${segment.id}`,
        type: "line",
        source: `road-${segment.id}`,
        layout: {
          "line-join": "round",
          "line-cap": "round"
        },
        paint: {
          "line-color": color,
          "line-width": 6
        }
      })
    })
  }

  function addCameraMarkers() {
    if (!map.current) return

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    const visibleCameras = cameras.filter(camera =>
      camera.status === "online" || showOffline
    )

    visibleCameras.forEach(camera => {
      const el = document.createElement("div")
      el.className = "camera-marker"
      el.innerHTML = `
        <div class="relative cursor-pointer group">
          <div class="w-10 h-10 rounded-full bg-background border-2 ${camera.status === "online" ? "border-primary" : "border-muted"
        } flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${camera.status === "online" ? "text-primary" : "text-muted"
        }">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          ${camera.status === "online" ? '<div class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-road-clean animate-pulse"></div>' : ''}
        </div>
      `

      el.addEventListener("click", () => setSelectedCamera(camera))
      el.addEventListener("mouseenter", () => setHoveredCamera(camera))
      el.addEventListener("mouseleave", () => setHoveredCamera(null))

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([camera.lng, camera.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div class="p-2 text-sm">
              <div class="font-semibold">${camera.name}</div>
              <div class="text-muted-foreground">${camera.description}</div>
            </div>
          `)
        )
        .addTo(map.current!)

      markersRef.current.push(marker)
    })
  }

  return (
    <>
      <div ref={mapContainer} className="w-full h-full rounded-lg" />

      {/* Offline cameras toggle */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setShowOffline(!showOffline)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showOffline
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground border border-border"
            }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {showOffline ? (
              <>
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            ) : (
              <>
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </>
            )}
          </svg>
          {showOffline ? "Скрыть офлайн" : "Показать офлайн"}
        </button>
      </div>

      <VideoModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
      />

      <style jsx global>{`
        .maplibregl-popup-content {
          background: hsl(var(--card));
          color: hsl(var(--card-foreground));
          border: 1px solid hsl(var(--border));
          border-radius: 0.5rem;
          padding: 0;
        }
        .maplibregl-popup-tip {
          border-top-color: hsl(var(--card)) !important;
        }
      `}</style>
    </>
  )
}
