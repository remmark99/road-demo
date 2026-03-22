"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { fetchCameras } from "@/lib/api/cameras"
import { fetchRoadsGeoJSON, HIGHWAY_CONFIG, type RoadsGeoJSON } from "@/lib/api/roads"
import { fetchBusStopsGeoJSON, type BusStopsGeoJSON } from "@/lib/api/bus-stops"
import type { Camera, RoadStatus } from "@/lib/types"
import { VideoModal } from "./video-modal"
import { BusStopModal, type SelectedBusStop } from "./bus-stop-modal"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useModuleAccess } from "@/components/providers/module-context"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

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
  hoveredSegmentId?: string | null
  onHoverSegment?: (segmentId: string | null) => void
}

// Build MapLibre expressions for road styling based on highway type
function buildWidthExpression(): any {
  const cases: any[] = []
  for (const [highway, cfg] of Object.entries(HIGHWAY_CONFIG)) {
    cases.push(["==", ["get", "highway"], highway], cfg.width)
  }
  return ["case", ...cases, 1.5] // default width
}

// Color roads by snow status: clean = green, warning = amber, dirty = red
function buildStatusColorExpression(): any {
  return [
    "case",
    ["==", ["get", "status"], "clean"], "#4ade80",
    ["==", ["get", "status"], "warning"], "#f59e0b",
    ["==", ["get", "status"], "dirty"], "#ef4444",
    "#6b7280" // unknown
  ]
}

function buildStatusOpacityExpression(): any {
  return [
    "case",
    ["==", ["get", "status"], "clean"], 0.7,
    ["==", ["get", "status"], "warning"], 0.8,
    ["==", ["get", "status"], "dirty"], 0.85,
    0.5
  ]
}

export function SurgutMap({ statusOverride, hoveredSegmentId, onHoverSegment }: SurgutMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)
  const [selectedBusStop, setSelectedBusStop] = useState<SelectedBusStop | null>(null)
  const [spiderifiedStop, setSpiderifiedStop] = useState<{ id: number; lat: number; lng: number } | null>(null)
  const spiderifiedStopRef = useRef<{ id: number; lat: number; lng: number } | null>(null)
  
  // Sync state to ref for callbacks
  useEffect(() => {
    spiderifiedStopRef.current = spiderifiedStop
  }, [spiderifiedStop])

  const { modules, hasModule, loading: modulesLoading } = useModuleAccess()
  const [isDark, setIsDark] = useState(true)
  const lastThemeRef = useRef(isDark)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [hoveredCamera, setHoveredCamera] = useState<Camera | null>(null)
  const [showAllFov, setShowAllFov] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [roadsData, setRoadsData] = useState<RoadsGeoJSON | null>(null)
  const [busStopsData, setBusStopsData] = useState<BusStopsGeoJSON | null>(null)

  // Filter States
  const [cameraFilters, setCameraFilters] = useState({ online: true, offline: false })
  const [busStopFilters, setBusStopFilters] = useState({ online: true, offline: false, incidents: true, unequipped: true })
  const [showClusters, setShowClusters] = useState(true)

  const [selectedContractor, setSelectedContractor] = useState<string>("all")

  // Add roads as a single GeoJSON source with styled layers
  const addRoads = useCallback(() => {
    if (!map.current) return

    const sourceId = "roads"
    const glowLayerId = "roads-glow"
    const mainLayerId = "roads-main"
    const labelLayerId = "roads-labels"

    // Skip if already exists
    if (map.current.getSource(sourceId)) return

    map.current.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })



    // Glow layer (wider, blurred effect)
    map.current.addLayer({
      id: glowLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": buildStatusColorExpression(),
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, ["*", buildWidthExpression(), 0.5],
          14, ["*", buildWidthExpression(), 2],
          18, ["*", buildWidthExpression(), 3],
        ],
        "line-opacity": ["*", buildStatusOpacityExpression(), 0.3],
      },
    })

    // Main road layer
    map.current.addLayer({
      id: mainLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": buildStatusColorExpression(),
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, ["*", buildWidthExpression(), 0.3],
          14, buildWidthExpression(),
          18, ["*", buildWidthExpression(), 1.8],
        ],
        "line-opacity": buildStatusOpacityExpression(),
      },
    })

    // Road name labels at higher zoom
    map.current.addLayer({
      id: labelLayerId,
      type: "symbol",
      source: sourceId,
      minzoom: 15,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-size": 11,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-offset": [0, -0.8],
        "text-anchor": "center",
        "text-max-angle": 30,
      },
      paint: {
        "text-color": isDark ? "#d1d5db" : "#374151",
        "text-halo-color": isDark ? "#1f2937" : "#ffffff",
        "text-halo-width": 1.5,
        "text-opacity": 0.8,
      },
    })

    // Hover popup for road names
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
    })

    map.current.on("mouseenter", mainLayerId, (e) => {
      map.current!.getCanvas().style.cursor = "pointer"
      const feature = e.features?.[0]
      if (feature && feature.properties) {
        const highway = feature.properties.highway
        const status = feature.properties.status
        const cfg = HIGHWAY_CONFIG[highway]
        const statusLabels: Record<string, { label: string; color: string }> = {
          clean: { label: 'Чисто', color: '#4ade80' },
          warning: { label: 'Требует внимания', color: '#f59e0b' },
          dirty: { label: 'Заснежено', color: '#ef4444' },
        }
        const statusInfo = statusLabels[status] || { label: 'Нет данных', color: '#6b7280' }
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="p-2 text-sm whitespace-nowrap">
              <div class="font-semibold">${feature.properties.name || "Без названия"}</div>
              <div class="text-muted-foreground text-xs">${cfg?.label ?? highway}</div>
              <div class="mt-1.5 flex items-center gap-1.5 border-t pt-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                <span class="text-xs font-medium">${feature.properties.contractor || "Не назначен"}</span>
              </div>
              <div class="flex items-center gap-1.5 mt-1.5">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusInfo.color}"></span>
                <span class="text-xs text-muted-foreground">${statusInfo.label}</span>
              </div>
            </div>`
          )
          .addTo(map.current!)
      }
    })

    map.current.on("mouseleave", mainLayerId, () => {
      map.current!.getCanvas().style.cursor = ""
      popup.remove()
    })

    map.current.on("mousemove", mainLayerId, (e) => {
      if (e.features?.[0]?.properties) {
        popup.setLngLat(e.lngLat)
      }
    })
  }, [isDark])


  const addBusStops = useCallback(() => {
    if (!map.current) return

    const sourceId = "bus-stops"
    const layerId = "bus-stops-layer"

    if (map.current.getSource(sourceId)) return

    map.current.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 18,
      clusterRadius: 50
    })

    map.current.addSource(`${sourceId}-raw`, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    })

    // Cluster circles
    map.current.addLayer({
      id: `${sourceId}-clusters`,
      type: "circle",
      source: sourceId,
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": [
          "step",
          ["get", "point_count"],
          15,    // 15px radius for small clusters
          10, 20, // 20px radius when count >= 10
          50, 25  // 25px radius when count >= 50
        ],
        "circle-color": "#2563eb",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
      layout: {
        "visibility": showClusters ? "visible" : "none"
      }
    })

    // Cluster counts
    map.current.addLayer({
      id: `${sourceId}-cluster-count`,
      type: "symbol",
      source: sourceId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
        "visibility": showClusters ? "visible" : "none"
      },
      paint: {
        "text-color": "#ffffff"
      }
    })

    const paintConfig = {
      "circle-radius": 10,
      "circle-color": [
        "case",
        ["==", ["has", "has_equipment"], false], "#3b82f6",
        ["all", ["==", ["get", "has_equipment"], false], ["==", ["get", "is_partly_equipped"], false]], "#3b82f6",
        ["==", ["get", "is_online"], false], "#9ca3af",
        ["==", ["get", "glass_broken"], true], "#ef4444",
        ["==", ["get", "heater_working"], false], "#f59e0b",
        "#22c55e"
      ] as any,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    }

    const symbolLayout = {
      "icon-image": "bus-icon",
      "icon-allow-overlap": true,
      "visibility": "visible"
    } as any

    // Unclustered single points (when clustering is OFF or max zoom)
    map.current.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: paintConfig,
      layout: { "visibility": "visible" }
    })

    // Add Bus Stop icon layer on top of circles
    map.current.addLayer({
      id: `${layerId}-symbol`,
      type: "symbol",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      layout: symbolLayout
    })

    // --- BADGE LAYERS FOR CAMERA COUNT ---
    // Badge Background (small circle offset to top-right)
    map.current.addLayer({
      id: `${layerId}-badge-bg`,
      type: "circle",
      source: sourceId,
      filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "cameraCount"], 0]],
      paint: {
        "circle-radius": 7,
        "circle-color": "#0ea5e9", // beautiful blue
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
        "circle-translate": [10, -10] // offset top-right
      },
      layout: { "visibility": "visible" }
    })

    // Badge Text (the number)
    map.current.addLayer({
      id: `${layerId}-badge-text`,
      type: "symbol",
      source: sourceId,
      filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "cameraCount"], 0]],
      layout: {
        "text-field": ["to-string", ["get", "cameraCount"]],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 10,
        "text-allow-overlap": true,
        "visibility": "visible"
      },
      paint: {
        "text-color": "#ffffff",
        "text-translate": [10, -10] // match offset
      }
    })

    // Raw points (for when clustering is disabled)
    map.current.addLayer({
      id: `${layerId}-raw`,
      type: "circle",
      source: `${sourceId}-raw`,
      paint: paintConfig,
      layout: { "visibility": "none" }
    })

    map.current.addLayer({
      id: `${layerId}-raw-symbol`,
      type: "symbol",
      source: `${sourceId}-raw`,
      layout: { ...symbolLayout, "visibility": "none" }
    })

    // Badge layers for RAW source
    map.current.addLayer({
      id: `${layerId}-raw-badge-bg`,
      type: "circle",
      source: `${sourceId}-raw`,
      filter: [">", ["get", "cameraCount"], 0],
      paint: {
        "circle-radius": 7,
        "circle-color": "#0ea5e9",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
        "circle-translate": [10, -10]
      },
      layout: { "visibility": "none" }
    })
    
    map.current.addLayer({
      id: `${layerId}-raw-badge-text`,
      type: "symbol",
      source: `${sourceId}-raw`,
      filter: [">", ["get", "cameraCount"], 0],
      layout: {
        "text-field": ["to-string", ["get", "cameraCount"]],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 10,
        "text-allow-overlap": true,
        "visibility": "none"
      },
      paint: {
        "text-color": "#ffffff",
        "text-translate": [10, -10]
      }
    })
    // -------------------------------------

    // Click on a cluster to zoom in
    map.current.on("click", `${sourceId}-clusters`, (e) => {
      const features = map.current?.queryRenderedFeatures(e.point, {
        layers: [`${sourceId}-clusters`]
      })
      if (!features?.length) return

      const clusterId = features[0].properties.cluster_id
      const source = map.current?.getSource(sourceId) as maplibregl.GeoJSONSource

      source.getClusterExpansionZoom(clusterId).then(async zoom => {
        if (zoom > 18 || map.current!.getZoom() >= 18) {
          // Max zoom reached, spiderify bus stops inside popup
          const leaves = await source.getClusterLeaves(clusterId, 100, 0)

          let html = `<div class="p-2 min-w-48"><div class="font-bold mb-2 text-sm border-b pb-1">Остановки (${leaves.length}):</div><div class="space-y-1">`
          leaves.forEach((f: any, index: number) => {
            const props = f.properties
            const colorClass = props.is_online ? (props.glass_broken ? 'bg-red-500' : 'bg-green-500') : (props.has_equipment === false ? 'bg-blue-500' : 'bg-gray-400')
            html += `<div class="bus-stop-cluster-row flex items-center gap-2 text-xs p-1.5 hover:bg-muted cursor-pointer rounded" data-index="\${index}">
               <div class="w-2 h-2 rounded-full \${colorClass}"></div>
               <span class="truncate max-w-[150px] font-medium">\${props.name || 'Остановка'}</span>
             </div>`
          })
          html += `</div></div>`

          const popupContent = document.createElement("div")
          popupContent.innerHTML = html

          const rows = popupContent.querySelectorAll('.bus-stop-cluster-row')
          rows.forEach((row, i) => {
            row.addEventListener('click', () => {
              const props = leaves[i].properties as any
              setSelectedBusStop({
                id: props.id,
                name: props.name,
                description: props.description,
                address: props.address,
                sensor_data: {
                  ...props
                }
              })
            })
          })

          new maplibregl.Popup({ closeOnClick: true, maxWidth: '250px' })
            .setDOMContent(popupContent)
            .setLngLat((features[0].geometry as any).coordinates)
            .addTo(map.current!)

        } else {
          map.current?.easeTo({
            center: (features[0].geometry as any).coordinates,
            zoom: Math.min(zoom, 18),
          })
        }
      }).catch((err) => console.error(err))
    })

    map.current.on("mouseenter", `${sourceId}-clusters`, () => {
      map.current!.getCanvas().style.cursor = "pointer"
    })
    map.current.on("mouseleave", `${sourceId}-clusters`, () => {
      map.current!.getCanvas().style.cursor = ""
    })

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
    })

      ;[layerId, `${layerId}-raw`].forEach((id: string) => {
        map.current!.on("mouseenter", id, (e) => {
          map.current!.getCanvas().style.cursor = "pointer"
          const feature = e.features?.[0]
          if (feature) {
            const props = feature.properties as any
            popup
              .setLngLat((e as unknown as { lngLat: any }).lngLat)
              .setHTML(
                `<div class="p-2 text-sm">
                <div class="font-semibold flex items-center gap-1.5 mb-1 ${props.is_online ? (props.glass_broken ? 'text-red-500' : 'text-green-500') : 'text-[#3b82f6]'}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
                  ${props.name || 'Остановка'}
                </div>
                ${props.address ? `<div class="text-muted-foreground text-xs">${props.address}</div>` : ''}
              </div>`
              )
              .addTo(map.current!)
          }
        })

        map.current!.on("mouseleave", id, () => {
          map.current!.getCanvas().style.cursor = ""
          popup.remove()
        })

        map.current!.on("click", id, (e) => {
          const feature = e.features?.[0]
          if (feature) {
            const props = feature.properties as any
            const lng = (feature.geometry as any).coordinates[0]
            const lat = (feature.geometry as any).coordinates[1]

            // Check if this stop has any cameras
            const hasCams = props.cameraCount > 0

            if (hasCams) {
              if (spiderifiedStopRef.current?.id === props.id) {
                // Already spiderified, user clicked it again -> open Modal
                setSelectedBusStop({
                  id: props.id,
                  name: props.name,
                  description: props.description,
                  address: props.address,
                  sensor_data: {
                    ...props
                  }
                })
              } else {
                // Open spiderify
                setSpiderifiedStop({ id: props.id, lat, lng })
              }
            } else {
              // No cameras, open Modal immediately
              setSelectedBusStop({
                id: props.id,
                name: props.name,
                description: props.description,
                address: props.address,
                sensor_data: {
                  ...props
                }
              })
            }
          }
        })
      })
  }, [isDark])

  const addCameraLayers = useCallback(() => {
    if (!map.current) return

    const sourceId = "cameras"
    const layerId = "cameras-layer"

    if (map.current.getSource(sourceId)) return

    map.current.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 18,
      clusterRadius: 50
    })

    map.current.addSource(`${sourceId}-raw`, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    })

    // Camera Cluster circles
    map.current.addLayer({
      id: `${sourceId}-clusters`,
      type: "circle",
      source: sourceId,
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": [
          "step",
          ["get", "point_count"],
          15,
          10, 20,
          50, 25
        ],
        "circle-color": "#9333ea", // Purple
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
      layout: {
        "visibility": showClusters ? "visible" : "none"
      }
    })

    // Camera Cluster counts
    map.current.addLayer({
      id: `${sourceId}-cluster-count`,
      type: "symbol",
      source: sourceId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
        "visibility": showClusters ? "visible" : "none"
      },
      paint: {
        "text-color": "#ffffff"
      }
    })

    const paintConfig = {
      "circle-radius": 10,
      "circle-color": [
        "case",
        ["==", ["get", "status"], "online"], "#22c55e",
        "#9ca3af" // offline gray
      ] as any,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    }

    const spiderPaintConfig = {
      "circle-radius": 12,
      "circle-color": [
        "case",
        ["==", ["get", "status"], "online"], "#0ea5e9", // distinct color for bus stop cams
        "#9ca3af"
      ] as any,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    }

    const symbolLayout = {
      "icon-image": "cam-icon",
      "icon-allow-overlap": true,
      "visibility": "visible"
    } as any

    // Unclustered cameras (Circle)
    map.current.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: paintConfig,
      layout: { "visibility": "visible" }
    })

    // Add Camera icon layer on top of circles
    map.current.addLayer({
      id: `${layerId}-symbol`,
      type: "symbol",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      layout: symbolLayout
    })

    // Raw cameras (Circle)
    map.current.addLayer({
      id: `${layerId}-raw`,
      type: "circle",
      source: `${sourceId}-raw`,
      paint: paintConfig,
      layout: { "visibility": "none" }
    })

    map.current.addLayer({
      id: `${layerId}-raw-symbol`,
      type: "symbol",
      source: `${sourceId}-raw`,
      layout: { ...symbolLayout, "visibility": "none" }
    })

    // --- SPIDERIFY LAYERS ---
    if (!map.current.getSource("spider-lines")) {
      map.current.addSource("spider-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      })
      map.current.addLayer({
        id: "spider-lines-layer",
        type: "line",
        source: "spider-lines",
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.8
        }
      })
    }

    if (!map.current.getSource("spider-cameras")) {
      map.current.addSource("spider-cameras", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      })
      map.current.addLayer({
        id: "spider-cameras-layer",
        type: "circle",
        source: "spider-cameras",
        paint: spiderPaintConfig
      })
      map.current.addLayer({
        id: "spider-cameras-symbol",
        type: "symbol",
        source: "spider-cameras",
        layout: symbolLayout
      })

      // Click on spider camera
      map.current.on("click", "spider-cameras-layer", (e) => {
        const feature = e.features?.[0]
        if (feature) {
          const props = feature.properties as any
          setSelectedCamera({
            id: props.id,
            name: props.name,
            description: props.description,
            status: props.status,
            hlsUrl: props.hlsUrl,
            rtspUrl: props.rtspUrl,
            cameraIndex: props.cameraIndex,
            lat: (feature.geometry as any).coordinates[1],
            lng: (feature.geometry as any).coordinates[0], // the offset coordinate
            fovAngle: props.fovAngle,
            fovDirection: props.fovDirection,
            fovDistance: props.fovDistance
          } as Camera)
        }
      })
      map.current.on("mouseenter", "spider-cameras-layer", () => {
        map.current!.getCanvas().style.cursor = "pointer"
      })
      map.current.on("mouseleave", "spider-cameras-layer", () => {
        map.current!.getCanvas().style.cursor = ""
      })
    }
    // ------------------------

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    })

      ;[layerId, `${layerId}-raw`].forEach((id: string) => {
        map.current!.on("mouseenter", id, (e) => {
          map.current!.getCanvas().style.cursor = "pointer"
          const feature = e.features?.[0]
          if (feature) {
            const props = feature.properties as any
            setHoveredCamera({ id: props.id } as Camera) // Minimal info for FOV highlighting

            popup
              .setLngLat((e as unknown as { lngLat: any }).lngLat)
              .setHTML(
                `<div class="p-2 text-sm">
                <div class="font-semibold">${props.name}</div>
                <div class="text-muted-foreground">${props.description}</div>
              </div>`
              )
              .addTo(map.current!)
          }
        })

        map.current!.on("mouseleave", id, () => {
          map.current!.getCanvas().style.cursor = ""
          setHoveredCamera(null)
          popup.remove()
        })

        map.current!.on("click", id, (e) => {
          const feature = e.features?.[0]
          if (feature) {
            const props = feature.properties as any
            setSelectedCamera({
              id: props.id,
              name: props.name,
              description: props.description,
              status: props.status,
              hlsUrl: props.hlsUrl,
              rtspUrl: props.rtspUrl,
              cameraIndex: props.cameraIndex,
              lat: (feature.geometry as any).coordinates[1],
              lng: (feature.geometry as any).coordinates[0],
              fovAngle: props.fovAngle,
              fovDirection: props.fovDirection,
              fovDistance: props.fovDistance
            } as Camera)
          }
        })
      })

    // Click on camera cluster -> zoom or spiderify if max zoom
    map.current.on("click", `${sourceId}-clusters`, (e) => {
      const features = map.current?.queryRenderedFeatures(e.point, {
        layers: [`${sourceId}-clusters`]
      })
      if (!features?.length) return

      const clusterId = features[0].properties.cluster_id
      const source = map.current?.getSource(sourceId) as maplibregl.GeoJSONSource

      source.getClusterExpansionZoom(clusterId).then(async zoom => {
        if (zoom > 18 || map.current!.getZoom() >= 18) {
          // Max zoom reached, spiderify cameras inside popup
          const leaves = await source.getClusterLeaves(clusterId, 100, 0)

          let html = `<div class="p-2 min-w-48"><div class="font-bold mb-2 text-sm border-b pb-1">Камеры (${leaves.length}):</div><div class="space-y-1">`
          leaves.forEach((f: any, index: number) => {
            const props = f.properties
            html += `<div class="camera-cluster-row flex items-center gap-2 text-xs p-1.5 hover:bg-muted cursor-pointer rounded" data-index="${index}">
               <div class="w-2 h-2 rounded-full ${props.status === 'online' ? 'bg-[#22c55e]' : 'bg-gray-400'}"></div>
               <span class="truncate max-w-[150px] font-medium">${props.name}</span>
             </div>`
          })
          html += `</div></div>`

          const popupContent = document.createElement("div")
          popupContent.innerHTML = html

          // Safely bind React state clicks without globals
          const rows = popupContent.querySelectorAll('.camera-cluster-row')
          rows.forEach((row, i) => {
            row.addEventListener('click', () => {
              const props = leaves[i].properties as any
              setSelectedCamera({
                id: props.id,
                name: props.name,
                description: props.description,
                status: props.status,
                hlsUrl: props.hlsUrl,
                rtspUrl: props.rtspUrl,
                cameraIndex: props.cameraIndex,
                lat: (leaves[i].geometry as any).coordinates[1],
                lng: (leaves[i].geometry as any).coordinates[0],
                fovAngle: props.fovAngle,
                fovDirection: props.fovDirection,
                fovDistance: props.fovDistance
              } as Camera)
            })
          })

          new maplibregl.Popup({ closeOnClick: true, maxWidth: '250px' })
            .setDOMContent(popupContent)
            .setLngLat((features[0].geometry as any).coordinates)
            .addTo(map.current!)

        } else {
          map.current?.easeTo({
            center: (features[0].geometry as any).coordinates,
            zoom: Math.min(zoom, 18),
          })
        }
      }).catch((err) => console.error(err))
    })

    map.current.on("mouseenter", `${sourceId}-clusters`, () => {
      map.current!.getCanvas().style.cursor = "pointer"
    })
    map.current.on("mouseleave", `${sourceId}-clusters`, () => {
      map.current!.getCanvas().style.cursor = ""
    })

  }, [])

  // Fetch data based on allowed modules
  useEffect(() => {
    if (modulesLoading) return
    fetchCameras(modules).then(setCameras)

    if (hasModule('roads')) {
      fetchRoadsGeoJSON().then(setRoadsData)
    } else {
      setRoadsData({ type: "FeatureCollection", features: [] })
    }

    if (hasModule('stops')) {
      fetchBusStopsGeoJSON().then(setBusStopsData)
    } else {
      setBusStopsData({ type: "FeatureCollection", features: [] })
    }
  }, [modules, hasModule, modulesLoading])

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
      addRoads()
      addBusStops()
      addCameraLayers()
    })
  }, [isDark, addRoads, addBusStops, addCameraLayers, mapLoaded])

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
      // Add custom SVG icons
      if (map.current) {
        const camSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`
        const busSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>`

        const camImg = new window.Image(14, 14)
        camImg.onload = () => map.current?.addImage('cam-icon', camImg)
        camImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(camSvg)

        const busImg = new window.Image(14, 14)
        busImg.onload = () => map.current?.addImage('bus-icon', busImg)
        busImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(busSvg)
      }
      setMapLoaded(true)
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Add base map layers when map loads
  useEffect(() => {
    if (!mapLoaded) return
    addRoads()
    addBusStops()
    addCameraLayers()

    // Global click listener to close spiderify if clicked elsewhere
    if (map.current) {
      const clickHandler = (e: any) => {
        const features = map.current?.queryRenderedFeatures(e.point, {
          layers: [
            "bus-stops-layer", "bus-stops-layer-raw", "bus-stops-clusters",
            "spider-cameras-layer", "cameras-layer", "cameras-layer-raw", "cameras-clusters"
          ]
        })
        if (!features || features.length === 0) {
          setSpiderifiedStop(null)
        }
      }
      map.current.on('click', clickHandler)
      return () => {
        map.current?.off('click', clickHandler)
      }
    }
  }, [mapLoaded, addRoads, addBusStops, addCameraLayers])

  // Sync camera data to the GeoJSON source
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const source = map.current.getSource("cameras") as maplibregl.GeoJSONSource
    const rawSource = map.current.getSource("cameras-raw") as maplibregl.GeoJSONSource
    if (!source || !rawSource) return

    const visibleCameras = cameras.filter(camera => {
      if (camera.status === "online" && !cameraFilters.online) return false
      if (camera.status !== "online" && !cameraFilters.offline) return false
      if (camera.busStopId) return false // hide bus stop cameras from the main pool
      return true
    })

    const geojson: any = {
      type: "FeatureCollection",
      features: visibleCameras.map(camera => ({
        type: "Feature",
        properties: {
          id: camera.id,
          cameraIndex: camera.cameraIndex,
          name: camera.name,
          description: camera.description,
          status: camera.status,
          hlsUrl: camera.hlsUrl,
          rtspUrl: camera.rtspUrl,
          fovAngle: camera.fovAngle,
          fovDirection: camera.fovDirection,
          fovDistance: camera.fovDistance
        },
        geometry: {
          type: "Point",
          coordinates: [camera.lng, camera.lat]
        }
      }))
    }
    source.setData(geojson)
    rawSource.setData(geojson)

    const clusterLayers = ["cameras-clusters", "cameras-cluster-count", "cameras-layer", "cameras-layer-symbol"]
    const rawLayers = ["cameras-layer-raw", "cameras-layer-raw-symbol"]

    clusterLayers.forEach(l => {
      if (map.current!.getLayer(l)) {
        map.current!.setLayoutProperty(l, "visibility", showClusters ? "visible" : "none")
      }
    })

    rawLayers.forEach(l => {
      if (map.current!.getLayer(l)) {
        map.current!.setLayoutProperty(l, "visibility", showClusters ? "none" : "visible")
      }
    })

  }, [cameras, cameraFilters, mapLoaded, addCameraLayers, showClusters])

  // Sync spiderified cameras
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const linesSource = map.current.getSource("spider-lines") as maplibregl.GeoJSONSource
    const camsSource = map.current.getSource("spider-cameras") as maplibregl.GeoJSONSource
    if (!linesSource || !camsSource) return

    if (!spiderifiedStop) {
      linesSource.setData({ type: "FeatureCollection", features: [] })
      camsSource.setData({ type: "FeatureCollection", features: [] })
      return
    }

    const stopCams = cameras.filter(c => c.busStopId === spiderifiedStop.id)
    
    // Spread them in a circle
    const n = stopCams.length
    const radiusLng = 0.00015 // approx 10 meters
    const radiusLat = 0.00010 // scaling for lat distance

    const featuresPoints: any[] = []
    const featuresLines: any[] = []

    stopCams.forEach((cam, i) => {
      const angle = (2 * Math.PI * i) / n
      const offsetLng = spiderifiedStop.lng + Math.cos(angle) * radiusLng
      const offsetLat = spiderifiedStop.lat + Math.sin(angle) * radiusLat

      featuresLines.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [spiderifiedStop.lng, spiderifiedStop.lat],
            [offsetLng, offsetLat]
          ]
        }
      })

      featuresPoints.push({
        type: "Feature",
        properties: {
          id: cam.id,
          cameraIndex: cam.cameraIndex,
          name: cam.name,
          description: cam.description,
          status: cam.status,
          hlsUrl: cam.hlsUrl,
          rtspUrl: cam.rtspUrl,
          fovAngle: cam.fovAngle,
          fovDirection: cam.fovDirection,
          fovDistance: cam.fovDistance
        },
        geometry: {
          type: "Point",
          coordinates: [offsetLng, offsetLat]
        }
      })
    })

    linesSource.setData({ type: "FeatureCollection", features: featuresLines })
    camsSource.setData({ type: "FeatureCollection", features: featuresPoints })
  }, [cameras, spiderifiedStop, mapLoaded])

  // Sync roads data to the GeoJSON source
  useEffect(() => {
    if (!map.current || !mapLoaded || !roadsData) return
    const source = map.current.getSource("roads") as maplibregl.GeoJSONSource
    if (source) {
      let features = roadsData.features;

      // Apply external status override locally (from Timeline)
      if (statusOverride && Object.keys(statusOverride).length > 0) {
        features = features.map((f: any) => {
          const override = statusOverride[f.properties.osm_id.toString()];
          if (override) {
            return {
              ...f,
              properties: {
                ...f.properties,
                status: override
              }
            }
          }
          return f;
        })
      }

      // Apply contractor filter
      if (selectedContractor !== "all") {
        features = features.filter((f: any) => f.properties.contractor === selectedContractor)
      }

      const dataToSet: any = {
        type: "FeatureCollection",
        features: features
      }
      source.setData(dataToSet)
    }
  }, [roadsData, mapLoaded, addRoads, statusOverride, selectedContractor])

  // Sync bus stops data to the GeoJSON source
  useEffect(() => {
    if (!map.current || !mapLoaded || !busStopsData) return
    const source = map.current.getSource("bus-stops") as maplibregl.GeoJSONSource
    const rawSource = map.current.getSource("bus-stops-raw") as maplibregl.GeoJSONSource
    if (source && rawSource) {
      // Filter bus stops based on state
      const filteredFeatures = busStopsData.features.filter(f => {
        const sd: any = f.properties.sensor_data || {}

        if (!sd.has_equipment && !sd.is_partly_equipped) {
          return busStopFilters.unequipped
        }

        if (sd.heater_working === false || sd.glass_broken) {
          return busStopFilters.incidents
        }

        if (sd.is_online) {
          return busStopFilters.online
        } else {
          return busStopFilters.offline
        }
      })

      // Flatten sensor_data for MapLibre expressions, and calculate camera count
      const flatData = {
        ...busStopsData,
        features: filteredFeatures.map(f => {
          const camCount = cameras.filter(c => c.busStopId === f.properties.id).length
          return {
            ...f,
            properties: {
              ...f.properties,
              ...(f.properties.sensor_data || {}),
              cameraCount: camCount
            }
          }
        })
      }
      source.setData(flatData as any)
      rawSource.setData(flatData as any)
    }
  }, [busStopsData, cameras, mapLoaded, addBusStops, busStopFilters])

  // Update bus stops visibility independently of full re-add
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const clusterLayers = ["bus-stops-clusters", "bus-stops-cluster-count", "bus-stops-layer", "bus-stops-layer-symbol", "bus-stops-layer-badge-bg", "bus-stops-layer-badge-text"]
    const rawLayers = ["bus-stops-layer-raw", "bus-stops-layer-raw-symbol", "bus-stops-layer-raw-badge-bg", "bus-stops-layer-raw-badge-text"]

    clusterLayers.forEach(l => {
      if (map.current!.getLayer(l)) {
        map.current!.setLayoutProperty(l, "visibility", showClusters ? "visible" : "none")
      }
    })

    rawLayers.forEach(l => {
      if (map.current!.getLayer(l)) {
        map.current!.setLayoutProperty(l, "visibility", showClusters ? "none" : "visible")
      }
    })
  }, [showClusters, mapLoaded, busStopsData, cameras])

  // Update/show FOV
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const sourceId = "camera-fovs"
    const layerId = "camera-fovs-layer"

    const updateFovs = () => {
      // Find cameras that should have FOV visible
      const fovCameras = cameras.filter(camera => {
        const isVisible = (camera.status === "online" && cameraFilters.online) || (camera.status !== "online" && cameraFilters.offline)
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
  }, [cameras, cameraFilters, showAllFov, hoveredCamera, mapLoaded])

  return (
    <>
      <div ref={mapContainer} className="w-full h-full rounded-lg" />

      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 w-72">
        {hasModule('roads') && (
          <Select value={selectedContractor} onValueChange={setSelectedContractor}>
            <SelectTrigger className="w-full bg-card text-card-foreground border border-border rounded-lg h-10 shadow-sm font-medium">
              <SelectValue placeholder="Выберите подрядчика" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все подрядчики</SelectItem>
              <SelectItem value="Подрядчик 1">Подрядчик 1</SelectItem>
              <SelectItem value="Подрядчик 2">Подрядчик 2</SelectItem>
              <SelectItem value="Подрядчик 3">Подрядчик 3</SelectItem>
              <SelectItem value="Подрядчик 4">Подрядчик 4</SelectItem>
              <SelectItem value="Подрядчик 5">Подрядчик 5</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-4">
            {/* Display Toggles */}
            <div className="space-y-3">
              <div className="font-medium text-sm border-b pb-1 mb-2">Отображение</div>
              <div className="flex items-center space-x-2">
                <Checkbox id="clusters" checked={showClusters} onCheckedChange={(checked) => setShowClusters(!!checked)} />
                <Label htmlFor="clusters" className="text-sm font-medium leading-none cursor-pointer">Группировка меток</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="fovs" checked={showAllFov} onCheckedChange={(checked) => setShowAllFov(!!checked)} />
                <Label htmlFor="fovs" className="text-sm font-medium leading-none cursor-pointer">Азимуты камер</Label>
              </div>
            </div>

            {/* Camera Filters */}
            <div className="space-y-3">
              <div className="font-medium text-sm border-b pb-1 mb-2">Камеры (📷)</div>
              <div className="flex items-center space-x-2">
                <Checkbox id="cam-online" checked={cameraFilters.online} onCheckedChange={(checked) => setCameraFilters(prev => ({ ...prev, online: !!checked }))} />
                <Label htmlFor="cam-online" className="text-sm cursor-pointer">Показывать рабочие</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="cam-offline" checked={cameraFilters.offline} onCheckedChange={(checked) => setCameraFilters(prev => ({ ...prev, offline: !!checked }))} />
                <Label htmlFor="cam-offline" className="text-sm cursor-pointer">Показывать не в сети</Label>
              </div>
            </div>

            {/* Bus Stop Filters */}
            {hasModule('stops') && (
              <div className="space-y-3">
                <div className="font-medium text-sm border-b pb-1 mb-2">Остановки (🚌)</div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="bus-online" checked={busStopFilters.online} onCheckedChange={(checked) => setBusStopFilters(prev => ({ ...prev, online: !!checked }))} />
                  <Label htmlFor="bus-online" className="text-sm cursor-pointer">В сети</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="bus-offline" checked={busStopFilters.offline} onCheckedChange={(checked) => setBusStopFilters(prev => ({ ...prev, offline: !!checked }))} />
                  <Label htmlFor="bus-offline" className="text-sm cursor-pointer">Не в сети</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="bus-incidents" checked={busStopFilters.incidents} onCheckedChange={(checked) => setBusStopFilters(prev => ({ ...prev, incidents: !!checked }))} />
                  <Label htmlFor="bus-incidents" className="text-sm cursor-pointer">Инциденты/Поломки</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="bus-unequipped" checked={busStopFilters.unequipped} onCheckedChange={(checked) => setBusStopFilters(prev => ({ ...prev, unequipped: !!checked }))} />
                  <Label htmlFor="bus-unequipped" className="text-sm cursor-pointer">Без оборудования</Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <VideoModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
      />

      <BusStopModal
        busStop={selectedBusStop}
        onClose={() => setSelectedBusStop(null)}
      />
    </>
  )
}
