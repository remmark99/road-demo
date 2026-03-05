"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { fetchCameras } from "@/lib/api/cameras"
import { fetchRoadsGeoJSON, HIGHWAY_CONFIG, type RoadsGeoJSON } from "@/lib/api/roads"
import { fetchBusStopsGeoJSON, type BusStopsGeoJSON } from "@/lib/api/bus-stops"
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
  const [isDark, setIsDark] = useState(true)
  const lastThemeRef = useRef(isDark)
  const [showOffline, setShowOffline] = useState(false)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [hoveredCamera, setHoveredCamera] = useState<Camera | null>(null)
  const [showAllFov, setShowAllFov] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [roadsData, setRoadsData] = useState<RoadsGeoJSON | null>(null)
  const [busStopsData, setBusStopsData] = useState<BusStopsGeoJSON | null>(null)
  const [showBusStops, setShowBusStops] = useState(true)

  // Add roads as a single GeoJSON source with styled layers
  const addRoads = useCallback(() => {
    if (!map.current || !roadsData) return

    const sourceId = "roads"
    const glowLayerId = "roads-glow"
    const mainLayerId = "roads-main"
    const labelLayerId = "roads-labels"

    // Skip if already exists
    if (map.current.getSource(sourceId)) return

    map.current.addSource(sourceId, {
      type: "geojson",
      data: roadsData as any,
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
      if (feature && feature.properties?.name) {
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
            `<div class="p-2 text-sm">
              <div class="font-semibold">${feature.properties.name}</div>
              <div class="text-muted-foreground text-xs">${cfg?.label ?? highway}</div>
              <div class="flex items-center gap-1.5 mt-1">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusInfo.color}"></span>
                <span class="text-xs">${statusInfo.label}</span>
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
      if (e.features?.[0]?.properties?.name) {
        popup.setLngLat(e.lngLat)
      }
    })
  }, [roadsData])


  const addBusStops = useCallback(() => {
    if (!map.current || !busStopsData) return

    const sourceId = "bus-stops"
    const layerId = "bus-stops-layer"

    if (map.current.getSource(sourceId)) return

    map.current.addSource(sourceId, {
      type: "geojson",
      data: busStopsData as any,
      cluster: true,
      clusterMaxZoom: 18,
      clusterRadius: 50
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
        "visibility": showBusStops ? "visible" : "none"
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
        "visibility": showBusStops ? "visible" : "none"
      },
      paint: {
        "text-color": "#ffffff"
      }
    })

    // Unclustered single points
    map.current.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": "#60a5fa",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
      layout: {
        "visibility": showBusStops ? "visible" : "none"
      }
    })

    // Click on a cluster to zoom in
    map.current.on("click", `${sourceId}-clusters`, (e) => {
      const features = map.current?.queryRenderedFeatures(e.point, {
        layers: [`${sourceId}-clusters`]
      })
      if (!features?.length) return

      const clusterId = features[0].properties.cluster_id
      const source = map.current?.getSource(sourceId) as maplibregl.GeoJSONSource

      source.getClusterExpansionZoom(clusterId).then(zoom => {
        map.current?.easeTo({
          center: (features[0].geometry as any).coordinates,
          zoom: Math.min(zoom, 18),
        })
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

    map.current.on("mouseenter", layerId, (e) => {
      map.current!.getCanvas().style.cursor = "pointer"
      const feature = e.features?.[0]
      if (feature) {
        const props = feature.properties as any
        popup
          .setLngLat((e as unknown as { lngLat: any }).lngLat)
          .setHTML(
            `<div class="p-2 text-sm min-w-40">
              <div class="font-semibold mb-1 text-[#3b82f6] flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
                ${props.name || 'Остановка'}
              </div>
              <div class="text-muted-foreground text-xs px-1">
                ${props.address ? `<div class="mt-1.5 font-medium flex items-start gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 opacity-70"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> ${props.address}</div>` : ''}
              </div>
            </div>`
          )
          .addTo(map.current!)
      }
    })

    map.current.on("mouseleave", layerId, () => {
      map.current!.getCanvas().style.cursor = ""
      popup.remove()
    })
  }, [busStopsData, showBusStops])

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
      },
      paint: {
        "text-color": "#ffffff"
      }
    })

    // Unclustered cameras (Circle)
    map.current.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 8,
        "circle-color": [
          "case",
          ["==", ["get", "status"], "online"], "#22c55e",
          "#9ca3af" // offline gray
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      }
    })

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    })

    // Hover on unclustered cameras
    map.current.on("mouseenter", layerId, (e) => {
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

    map.current.on("mouseleave", layerId, () => {
      map.current!.getCanvas().style.cursor = ""
      setHoveredCamera(null)
      popup.remove()
    })

    // Click on unclustered camera
    map.current.on("click", layerId, (e) => {
      const feature = e.features?.[0]
      if (feature) {
        const props = feature.properties as any
        setSelectedCamera({
          id: props.id,
          name: props.name,
          description: props.description,
          status: props.status,
          url: props.url,
          lat: (feature.geometry as any).coordinates[1],
          lng: (feature.geometry as any).coordinates[0],
          fovAngle: props.fovAngle,
          fovDirection: props.fovDirection,
          fovDistance: props.fovDistance
        } as Camera)
      }
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
                url: props.url,
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

  // Fetch cameras, roads, and bus stops from Supabase
  useEffect(() => {
    fetchCameras().then(setCameras)
    fetchRoadsGeoJSON().then(setRoadsData)
    fetchBusStopsGeoJSON().then(setBusStopsData)
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
  }, [mapLoaded, addRoads, addBusStops, addCameraLayers])

  // Sync camera data to the GeoJSON source
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const source = map.current.getSource("cameras") as maplibregl.GeoJSONSource
    if (!source) return

    const visibleCameras = cameras.filter(camera =>
      camera.status === "online" || showOffline
    )

    const geojson: any = {
      type: "FeatureCollection",
      features: visibleCameras.map(camera => ({
        type: "Feature",
        properties: {
          id: camera.id,
          name: camera.name,
          description: camera.description,
          status: camera.status,
          url: camera.url,
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
  }, [cameras, showOffline, mapLoaded, addCameraLayers])

  // Update bus stops visibility independently of full re-add
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const layers = ["bus-stops-layer", "bus-stops-clusters", "bus-stops-cluster-count"]
    layers.forEach(l => {
      if (map.current!.getLayer(l)) {
        map.current!.setLayoutProperty(l, "visibility", showBusStops ? "visible" : "none")
      }
    })
  }, [showBusStops, mapLoaded, busStopsData])

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
            {showOffline ? "Только активные камеры" : "Показать все камеры"}
          </span>
        </button>

        <button
          onClick={() => setShowBusStops(!showBusStops)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-60 ${showBusStops
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground border border-border"
            }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6v6" />
            <path d="M15 6v6" />
            <path d="M2 12h19.6" />
            <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
            <circle cx="7" cy="18" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
          <span className="truncate">
            {showBusStops ? "Скрыть остановки" : "Показать остановки"}
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
