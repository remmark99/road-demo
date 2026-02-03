"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
  const lastThemeRef = useRef(isDark)
  const [showOffline, setShowOffline] = useState(false)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [hoveredCamera, setHoveredCamera] = useState<Camera | null>(null)
  const [showAllFov, setShowAllFov] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Add road segments only once - no statusOverride dependency
  const addRoadSegments = useCallback(() => {
    if (!map.current) return

    roadSegments.forEach(segment => {
      const color = statusColors[segment.currentStatus]

      const sourceId = `road-${segment.id}`
      const glowLayerId = `road-${segment.id}-glow`
      const mainLayerId = `road-${segment.id}`

      // Skip if already exists
      if (map.current!.getSource(sourceId)) return

      map.current!.addSource(sourceId, {
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
        id: glowLayerId,
        type: "line",
        source: sourceId,
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
        id: mainLayerId,
        type: "line",
        source: sourceId,
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
  }, [])

  const addCameraMarkers = useCallback(() => {
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
  }, [cameras, showOffline])

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
    if (!map.current || !mapLoaded) return
    if (lastThemeRef.current === isDark) return

    lastThemeRef.current = isDark
    map.current.setStyle(getMapStyle(isDark))

    map.current.once("style.load", () => {
      addRoadSegments()
      addCameraMarkers()
    })
  }, [isDark, addRoadSegments, addCameraMarkers, mapLoaded])

  // Initialize map - this should only run once
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
      setMapLoaded(true)
    })

    return () => {
      markersRef.current.forEach(marker => marker.remove())
      map.current?.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Add road segments and camera markers when map loads
  useEffect(() => {
    if (!mapLoaded) return
    addRoadSegments()
    addCameraMarkers()
  }, [mapLoaded, addRoadSegments, addCameraMarkers])

  // Update/show FOV
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const sourceId = "camera-fovs"
    const layerId = "camera-fovs-layer"

    const updateFovs = () => {
      // Find cameras that should have FOV visible
      const fovCameras = cameras.filter(camera => {
        const isVisible = camera.status === "online" || showOffline
        if (!isVisible) return false

        return showAllFov || (hoveredCamera && camera.id === hoveredCamera.id)
      })

      const features = fovCameras.map(camera => ({
        type: "Feature",
        properties: {
          id: camera.id,
          isHovered: hoveredCamera?.id === camera.id,
          status: camera.status
        },
        geometry: {
          type: "Polygon",
          coordinates: [generateFovPolygon(
            camera.lat,
            camera.lng,
            camera.fovDirection,
            camera.fovAngle,
            camera.fovDistance
          )]
        }
      }))

      const geojson: any = {
        type: "FeatureCollection",
        features: features
      }

      const source = map.current?.getSource(sourceId) as maplibregl.GeoJSONSource
      if (source) {
        source.setData(geojson)
      } else {
        map.current?.addSource(sourceId, {
          type: "geojson",
          data: geojson
        })

        map.current?.addLayer({
          id: layerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "status"], "online"], "#4ade80",
              "#6b7280"
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["get", "isHovered"], false], 0.4,
              0.15
            ]
          }
        })

        map.current?.addLayer({
          id: `${layerId}-outline`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "status"], "online"], "#22c55e",
              "#9ca3af"
            ],
            "line-width": [
              "case",
              ["boolean", ["get", "isHovered"], false], 2,
              0.5
            ],
            "line-opacity": 0.6
          }
        })
      }
    }

    if (map.current.isStyleLoaded()) {
      updateFovs()
    } else {
      map.current.once("idle", updateFovs)
    }

    return () => {
      // No cleanup needed here as we reuse the source/layers
    }
  }, [cameras, showOffline, showAllFov, hoveredCamera, mapLoaded])

  // Update road colors when statusOverride changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    roadSegments.forEach(segment => {
      const status = statusOverride?.[segment.id] ?? segment.currentStatus
      const color = statusColors[status]

      if (map.current?.getLayer(`road-${segment.id}`)) {
        map.current.setPaintProperty(`road-${segment.id}`, "line-color", color)
      }
      if (map.current?.getLayer(`road-${segment.id}-glow`)) {
        map.current.setPaintProperty(`road-${segment.id}-glow`, "line-color", color)
      }
    })
  }, [statusOverride, mapLoaded])

  return (
    <>
      <div ref={mapContainer} className="w-full h-full rounded-lg" />

      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setShowOffline(!showOffline)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-60 ${showOffline
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
          <span className="truncate">
            {showOffline ? "Показать только активные" : "Показать все"}
          </span>
        </button>

        <button
          onClick={() => setShowAllFov(!showAllFov)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-60 ${showAllFov
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground border border-border"
            }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16.24 7.76-1.42 1.42" />
            <path d="m20.48 3.51-1.42 1.42" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="12" r="10" />
            <path d="m16.24 16.24-1.42-1.42" />
            <path d="m20.48 20.48-1.42-1.42" />
            <path d="m7.76 16.24 1.42-1.42" />
            <path d="m3.51 20.48 1.42-1.42" />
            <path d="m7.76 7.76 1.42 1.42" />
            <path d="m3.51 3.51 1.42 1.42" />
          </svg>
          <span className="truncate">
            {showAllFov ? "Скрыть азимуты" : "Показать азимуты"}
          </span>
        </button>
      </div>

      <VideoModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
      />
    </>
  )
}
