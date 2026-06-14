import { fetchStopSafetyAlerts, type StopSafetyAlert } from "@/lib/api/alerts"
import {
    fetchBusynessWindows,
    fetchLatestBusynessWindow,
    getBusStopIdFromLocationId,
    type BusynessWindowRow,
    type FetchBusynessWindowsResult,
} from "@/lib/api/busyness-windows"
import { createClient } from "@/lib/supabase/client"
import { districts } from "@/lib/districts"
import {
    STOP_MONITORED_COMPLEXES,
    getStopDistrictCoverageEstimate,
    getStopComplexByCameraIndex,
    getStopComplexByLocationId,
    type StopSafetyAlertType,
} from "@/lib/stop-analytics-config"

export interface RangeBounds {
    from: Date
    to: Date
}

export interface StopCameraRow {
    id: number
    camera_index: number | null
    module: string | null
    bus_stop_id: number | null
    status: string | null
    lat: number | null
    lng: number | null
    updated_at: string | null
}

export interface CurrentStopInfo {
    id: number
    name: string | null
    short_name: string | null
    description: string | null
    address: string | null
    coordinates: [number, number] | null
    districtName: string
}

export interface StopCurrentAnalyticsData {
    stops: CurrentStopInfo[]
    stopsById: Map<number, CurrentStopInfo>
    busynessRows: BusynessWindowRow[]
    alerts: StopSafetyAlert[]
    cameras: StopCameraRow[]
    displayedRange: RangeBounds
    fallbackRange: RangeBounds | null
    busynessTruncated: boolean
    busynessLimit: number
}

export interface StopLocationSummary {
    locationId: string
    stopId: number | null
    label: string
    detail: string
    districtName: string
    currentPeople: number
    averagePeople: number
    peakPeople: number
    windows: number
    latestAt: string | null
    safetyEvents: number
}

export interface StopDistrictSummary {
    districtName: string
    stops: number
    connectedStopNames: string[]
    estimatedTotalMin: number
    estimatedTotalMax: number
    estimatedTotalLabel: string
    liveDirections: number
    averagePeople: number
    peakPeople: number
    safetyEvents: number
    safetyEventsByType: Partial<Record<StopSafetyAlertType, number>>
    coverageMinPct: number
    coverageMaxPct: number
    coverageMidPct: number
    coverageLabel: string
    coveragePct: number
    latestAt: string | null
    topStops: string[]
}

interface BusStopsFeatureCollection {
    features?: Array<{
        properties?: {
            id?: number
            name?: string | null
            short_name?: string | null
            description?: string | null
            address?: string | null
        }
        geometry?: {
            coordinates?: [number, number]
        }
    }>
}

function startOfLocalDay(date: Date) {
    const result = new Date(date)
    result.setHours(0, 0, 0, 0)
    return result
}

function endOfLocalDay(date: Date) {
    const result = new Date(date)
    result.setHours(23, 59, 59, 999)
    return result
}

function toFiniteNumber(value: number | null | undefined) {
    return Number.isFinite(value) ? Number(value) : 0
}

function compareLocationId(a: string, b: string) {
    return a.localeCompare(b, "ru", { numeric: true })
}

function getNearestDistrictName(coordinates: [number, number] | null) {
    if (!coordinates) return "Район не определен"

    const [lng, lat] = coordinates
    const nearest = districts
        .map((district) => {
            const [districtLng, districtLat] = district.coordinates
            const distance = Math.hypot(lng - districtLng, lat - districtLat)

            return { name: district.name, distance }
        })
        .sort((a, b) => a.distance - b.distance)[0]

    return nearest?.name ?? "Район не определен"
}

function buildStopDisplay(locationId: string, stopsById: Map<number, CurrentStopInfo>) {
    const monitoredComplex = getStopComplexByLocationId(locationId)
    const stopId = getBusStopIdFromLocationId(locationId)
    const stop = stopId !== null ? stopsById.get(stopId) : undefined
    const label = monitoredComplex?.stopName || stop?.short_name?.trim() || stop?.name?.trim()
    const direction = stop?.description?.trim()

    return {
        stopId,
        label: label || (stopId !== null ? `Остановка ${stopId}` : `Остановочное направление ${locationId}`),
        detail: direction ? `${direction} · ID ${locationId}` : `ID ${locationId}`,
        districtName: monitoredComplex?.districtName ?? stop?.districtName ?? "Район не определен",
    }
}

function getAlertLocationId(alert: StopSafetyAlert) {
    return typeof alert.metadata?.location_id === "string" ? alert.metadata.location_id : null
}

function filterAlertsByRange(alerts: StopSafetyAlert[], range: RangeBounds) {
    const from = range.from.getTime()
    const to = range.to.getTime()

    return alerts.filter((alert) => {
        const time = new Date(alert.timestamp).getTime()

        return time >= from && time <= to
    })
}

function getAlertDistrictName(alert: StopSafetyAlert, stopsById: Map<number, CurrentStopInfo>) {
    const cameraComplex = getStopComplexByCameraIndex(alert.camera_index)
    if (cameraComplex) return cameraComplex.districtName

    const locationId = getAlertLocationId(alert)
    if (locationId) return buildStopDisplay(locationId, stopsById).districtName

    return "Район не определен"
}

export function getAllBusynessLocationIds(rows: BusynessWindowRow[]) {
    return Array.from(new Set(rows.map((row) => row.location_id))).sort(compareLocationId)
}

export async function fetchCurrentStops(): Promise<CurrentStopInfo[]> {
    const response = await fetch("/api/bus-stops")

    if (!response.ok) {
        throw new Error(`Failed to fetch bus stops: ${response.status}`)
    }

    const data = await response.json() as BusStopsFeatureCollection

    return (data.features ?? [])
        .map((feature) => {
            const properties = feature.properties

            if (!properties?.id) return null

            const coordinates = feature.geometry?.coordinates ?? null

            return {
                id: properties.id,
                name: properties.name ?? null,
                short_name: properties.short_name ?? null,
                description: properties.description ?? null,
                address: properties.address ?? null,
                coordinates,
                districtName: getNearestDistrictName(coordinates),
            } satisfies CurrentStopInfo
        })
        .filter((stop): stop is CurrentStopInfo => stop !== null)
        .sort((a, b) => a.id - b.id)
}

export async function fetchStopCameras(): Promise<StopCameraRow[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from("cameras")
        .select("id,camera_index,module,bus_stop_id,status,lat,lng,updated_at")
        .limit(10000)

    if (error) {
        throw new Error(error.message)
    }

    return (data ?? []) as StopCameraRow[]
}

export async function fetchStopCurrentAnalyticsData(range: RangeBounds): Promise<StopCurrentAnalyticsData> {
    const [stops, initialBusynessResult, allAlerts, cameras] = await Promise.all([
        fetchCurrentStops(),
        fetchBusynessWindows({ from: range.from, to: range.to }),
        fetchStopSafetyAlerts(),
        fetchStopCameras(),
    ])
    let busynessResult: FetchBusynessWindowsResult = initialBusynessResult
    let displayedRange = range
    let fallbackRange: RangeBounds | null = null

    if (initialBusynessResult.rows.length === 0) {
        const latestWindow = await fetchLatestBusynessWindow()

        if (latestWindow) {
            const latestDate = new Date(latestWindow.window_start)
            fallbackRange = {
                from: startOfLocalDay(latestDate),
                to: endOfLocalDay(latestDate),
            }
            displayedRange = fallbackRange
            busynessResult = await fetchBusynessWindows({
                from: fallbackRange.from,
                to: fallbackRange.to,
            })
        }
    }

    const stopsById = new Map(stops.map((stop) => [stop.id, stop]))

    return {
        stops,
        stopsById,
        busynessRows: busynessResult.rows,
        alerts: filterAlertsByRange(allAlerts, displayedRange),
        cameras,
        displayedRange,
        fallbackRange,
        busynessTruncated: busynessResult.truncated,
        busynessLimit: busynessResult.limit,
    }
}

export function buildStopLocationSummaries(data: StopCurrentAnalyticsData): StopLocationSummary[] {
    const locationMap = new Map<
        string,
        {
            latestRow: BusynessWindowRow | null
            weightedSum: number
            weight: number
            peakPeople: number
            windows: number
        }
    >()

    for (const row of data.busynessRows) {
        const current = locationMap.get(row.location_id) ?? {
            latestRow: null,
            weightedSum: 0,
            weight: 0,
            peakPeople: 0,
            windows: 0,
        }
        const sampleWeight = Math.max(1, toFiniteNumber(row.sample_count))

        current.weightedSum += toFiniteNumber(row.person_count_avg) * sampleWeight
        current.weight += sampleWeight
        current.peakPeople = Math.max(current.peakPeople, toFiniteNumber(row.person_count_max))
        current.windows += 1

        if (!current.latestRow || row.window_start > current.latestRow.window_start) {
            current.latestRow = row
        }

        locationMap.set(row.location_id, current)
    }

    const safetyEventsByLocation = new Map<string, number>()

    for (const alert of data.alerts) {
        const locationId = getAlertLocationId(alert)
        if (!locationId) continue
        safetyEventsByLocation.set(locationId, (safetyEventsByLocation.get(locationId) ?? 0) + 1)

        if (!locationMap.has(locationId)) {
            locationMap.set(locationId, {
                latestRow: null,
                weightedSum: 0,
                weight: 0,
                peakPeople: 0,
                windows: 0,
            })
        }
    }

    return Array.from(locationMap.entries())
        .map(([locationId, value]) => {
            const display = buildStopDisplay(locationId, data.stopsById)

            return {
                locationId,
                stopId: display.stopId,
                label: display.label,
                detail: display.detail,
                districtName: display.districtName,
                currentPeople: Math.round(toFiniteNumber(value.latestRow?.person_count_avg)),
                averagePeople: value.weight > 0 ? Number((value.weightedSum / value.weight).toFixed(1)) : 0,
                peakPeople: Math.round(value.peakPeople),
                windows: value.windows,
                latestAt: value.latestRow?.window_start ?? null,
                safetyEvents: safetyEventsByLocation.get(locationId) ?? 0,
            }
        })
        .sort((a, b) => (
            b.currentPeople - a.currentPeople
            || b.safetyEvents - a.safetyEvents
            || compareLocationId(a.locationId, b.locationId)
        ))
}

export function buildStopDistrictSummaries(data: StopCurrentAnalyticsData): StopDistrictSummary[] {
    const locationSummaries = buildStopLocationSummaries(data)
    const districtMap = new Map<
        string,
        {
            stopIds: Set<string>
            liveDirections: number
            currentPeopleSum: number
            peakPeople: number
            safetyEvents: number
            safetyEventsByType: Partial<Record<StopSafetyAlertType, number>>
            latestAt: string | null
            topStops: StopLocationSummary[]
        }
    >()

    const getCurrent = (districtName: string) => districtMap.get(districtName) ?? {
        stopIds: new Set<string>(),
        liveDirections: 0,
        currentPeopleSum: 0,
        peakPeople: 0,
        safetyEvents: 0,
        safetyEventsByType: {},
        latestAt: null,
        topStops: [],
    }

    for (const complex of STOP_MONITORED_COMPLEXES) {
        const current = getCurrent(complex.districtName)

        current.stopIds.add(complex.locationId)
        districtMap.set(complex.districtName, current)
    }

    for (const location of locationSummaries) {
        const current = getCurrent(location.districtName)

        current.stopIds.add(location.locationId)
        if (location.windows > 0) {
            current.liveDirections += 1
            current.currentPeopleSum += location.currentPeople
        }
        current.peakPeople = Math.max(current.peakPeople, location.peakPeople)
        if (location.latestAt && (!current.latestAt || location.latestAt > current.latestAt)) {
            current.latestAt = location.latestAt
        }
        current.topStops.push(location)
        districtMap.set(location.districtName, current)
    }

    for (const alert of data.alerts) {
        const districtName = getAlertDistrictName(alert, data.stopsById)
        const current = getCurrent(districtName)
        const locationId = getAlertLocationId(alert)
        const cameraComplex = getStopComplexByCameraIndex(alert.camera_index)

        if (cameraComplex) {
            current.stopIds.add(cameraComplex.locationId)
        } else if (locationId) {
            current.stopIds.add(locationId)
        }

        current.safetyEvents += 1
        current.safetyEventsByType[alert.alert_type] = (current.safetyEventsByType[alert.alert_type] ?? 0) + 1
        districtMap.set(districtName, current)
    }

    return Array.from(districtMap.entries())
        .map(([districtName, value]) => {
            const estimate = getStopDistrictCoverageEstimate(districtName)
            const fallbackStops = value.stopIds.size
            const fallbackCoveragePct = fallbackStops > 0
                ? Math.round((value.liveDirections / fallbackStops) * 100)
                : 0

            return {
                districtName,
                stops: estimate?.connectedStops ?? fallbackStops,
                connectedStopNames: estimate?.connectedStopNames ?? [],
                estimatedTotalMin: estimate?.estimatedTotalMin ?? fallbackStops,
                estimatedTotalMax: estimate?.estimatedTotalMax ?? fallbackStops,
                estimatedTotalLabel: estimate?.estimatedTotalLabel ?? `${fallbackStops}`,
                liveDirections: value.liveDirections,
                averagePeople: value.liveDirections > 0
                    ? Number((value.currentPeopleSum / value.liveDirections).toFixed(1))
                    : 0,
                peakPeople: value.peakPeople,
                safetyEvents: value.safetyEvents,
                safetyEventsByType: value.safetyEventsByType,
                coverageMinPct: estimate?.coverageMinPct ?? fallbackCoveragePct,
                coverageMaxPct: estimate?.coverageMaxPct ?? fallbackCoveragePct,
                coverageMidPct: estimate?.coverageMidPct ?? fallbackCoveragePct,
                coverageLabel: estimate?.coverageLabel ?? `${fallbackCoveragePct}%`,
                coveragePct: estimate?.coverageMidPct ?? fallbackCoveragePct,
                latestAt: value.latestAt,
                topStops: value.topStops
                    .sort((a, b) => b.currentPeople - a.currentPeople || b.safetyEvents - a.safetyEvents)
                    .slice(0, 3)
                    .map((stop) => stop.label),
            }
        })
        .sort((a, b) => b.averagePeople - a.averagePeople || b.safetyEvents - a.safetyEvents || a.districtName.localeCompare(b.districtName, "ru"))
}
