import { sessionRequest, rangeRequestKey } from '../request-cache'
import { fetchStopSafetyAlerts, type StopSafetyAlert } from "@/lib/api/alerts"
import {
    fetchBusynessWindows,
    fetchLatestBusynessWindow,
    getBusStopIdFromLocationId,
    type BusynessWindowRow,
    type FetchBusynessWindowsResult,
} from "@/lib/api/busyness-windows"
import { createClient } from "@/lib/supabase/client"
import { fetchStopDistrictAssignments, fetchStopDistricts } from "@/lib/api/stop-districts"
import {
    STOP_MONITORED_COMPLEXES,
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
    stopIdByCameraIndex: Map<number, number>
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

let currentStopsPromise: Promise<CurrentStopInfo[]> | null = null

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

export const UNKNOWN_DISTRICT = "Район не определен"

/** camera_index → bus_stop_id по таблице cameras. */
export function buildStopIdByCameraIndex(cameras: StopCameraRow[]) {
    const result = new Map<number, number>()
    for (const camera of cameras) {
        if (camera.camera_index !== null && camera.bus_stop_id !== null) result.set(camera.camera_index, camera.bus_stop_id)
    }
    return result
}

/**
 * Остановка по location_id аналитики. У комплексов location_id («73-24») — не id остановки,
 * поэтому остановка берётся по их камерам из таблицы cameras.
 */
export function resolveLocationStopId(locationId: string, stopIdByCameraIndex: Map<number, number>) {
    const complex = getStopComplexByLocationId(locationId)
    if (!complex) return getBusStopIdFromLocationId(locationId)

    for (let index = complex.cameraFrom; index <= complex.cameraTo; index++) {
        const stopId = stopIdByCameraIndex.get(index)
        if (stopId !== undefined) return stopId
    }

    return null
}

export function buildStopDisplay(locationId: string, stopsById: Map<number, CurrentStopInfo>, stopIdByCameraIndex: Map<number, number>) {
    const monitoredComplex = getStopComplexByLocationId(locationId)
    const stopId = resolveLocationStopId(locationId, stopIdByCameraIndex)
    const stop = stopId !== null ? stopsById.get(stopId) : undefined
    const label = monitoredComplex?.stopName || stop?.short_name?.trim() || stop?.name?.trim()
    const direction = stop?.description?.trim()

    return {
        stopId,
        label: label || (stopId !== null ? `Остановка ${stopId}` : `Остановочное направление ${locationId}`),
        detail: direction ? `${direction} · ID ${locationId}` : `ID ${locationId}`,
        districtName: stop?.districtName ?? UNKNOWN_DISTRICT,
    }
}

/** Микрорайон события: по камере, иначе по location_id. */
export function getEventDistrictName(
    cameraIndex: number | null | undefined,
    locationId: string | null,
    stopsById: Map<number, CurrentStopInfo>,
    stopIdByCameraIndex: Map<number, number>,
) {
    const cameraStopId = cameraIndex !== null && cameraIndex !== undefined ? stopIdByCameraIndex.get(cameraIndex) : undefined
    if (cameraStopId !== undefined) return stopsById.get(cameraStopId)?.districtName ?? UNKNOWN_DISTRICT
    if (locationId) return buildStopDisplay(locationId, stopsById, stopIdByCameraIndex).districtName

    return UNKNOWN_DISTRICT
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

export function getAllBusynessLocationIds(rows: BusynessWindowRow[]) {
    return Array.from(new Set(rows.map((row) => row.location_id))).sort(compareLocationId)
}

async function loadCurrentStops(): Promise<CurrentStopInfo[]> {
    const [response, districtRows, assignments] = await Promise.all([
        fetch("/api/bus-stops"),
        fetchStopDistricts(),
        fetchStopDistrictAssignments(),
    ])

    if (!response.ok) {
        throw new Error(`Failed to fetch bus stops: ${response.status}`)
    }

    const data = await response.json() as BusStopsFeatureCollection
    const districtNames = new Map(districtRows.map((district) => [district.id, district.name]))
    const districtByStop = new Map(assignments.map((stop) => [stop.id, stop.district_id]))

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
                districtName: districtNames.get(districtByStop.get(properties.id) ?? -1) ?? UNKNOWN_DISTRICT,
            } satisfies CurrentStopInfo
        })
        .filter((stop): stop is CurrentStopInfo => stop !== null)
        .sort((a, b) => a.id - b.id)
}

export async function fetchCurrentStops(): Promise<CurrentStopInfo[]> {
    if (!currentStopsPromise) {
        currentStopsPromise = loadCurrentStops().catch((error: unknown) => {
            currentStopsPromise = null
            throw error
        })
    }

    return currentStopsPromise
}

export function fetchStopCameras(): Promise<StopCameraRow[]> {
    return sessionRequest('analytics-cameras', 30_000, loadStopCameras)
}
async function loadStopCameras(): Promise<StopCameraRow[]> {
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

export function fetchStopCurrentAnalyticsData(range: RangeBounds): Promise<StopCurrentAnalyticsData> {
    return sessionRequest(`stop-analytics:${rangeRequestKey(range.from, range.to)}`,15_000,()=>loadStopCurrentAnalyticsData(range))
}
async function loadStopCurrentAnalyticsData(range: RangeBounds): Promise<StopCurrentAnalyticsData> {
    const [stops, initialBusynessResult, initialAlerts, cameras] = await Promise.all([
        fetchCurrentStops(),
        fetchBusynessWindows({ from: range.from, to: range.to }),
        fetchStopSafetyAlerts({ from: range.from, to: range.to }),
        fetchStopCameras(),
    ])
    let busynessResult: FetchBusynessWindowsResult = initialBusynessResult
    let alerts = initialAlerts
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
            ;[busynessResult, alerts] = await Promise.all([
                fetchBusynessWindows({ from: fallbackRange.from, to: fallbackRange.to }),
                fetchStopSafetyAlerts({ from: fallbackRange.from, to: fallbackRange.to }),
            ])
        }
    }

    const stopsById = new Map(stops.map((stop) => [stop.id, stop]))

    return {
        stops,
        stopsById,
        stopIdByCameraIndex: buildStopIdByCameraIndex(cameras),
        busynessRows: busynessResult.rows,
        alerts: filterAlertsByRange(alerts, displayedRange),
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
            const display = buildStopDisplay(locationId, data.stopsById, data.stopIdByCameraIndex)

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
    const cityStopsByDistrict = new Map<string, number>()
    for (const stop of data.stops) {
        cityStopsByDistrict.set(stop.districtName, (cityStopsByDistrict.get(stop.districtName) ?? 0) + 1)
    }
    const districtMap = new Map<
        string,
        {
            connected: Map<string, string>
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
        connected: new Map<string, string>(),
        liveDirections: 0,
        currentPeopleSum: 0,
        peakPeople: 0,
        safetyEvents: 0,
        safetyEventsByType: {},
        latestAt: null,
        topStops: [],
    }
    // Подключённая остановка считается один раз, даже если у неё несколько направлений.
    const connect = (districtName: string, locationId: string) => {
        const current = getCurrent(districtName)
        const display = buildStopDisplay(locationId, data.stopsById, data.stopIdByCameraIndex)
        const key = display.stopId !== null ? `stop:${display.stopId}` : `location:${locationId}`
        if (!current.connected.has(key)) current.connected.set(key, display.label)
        districtMap.set(districtName, current)
        return current
    }

    for (const complex of STOP_MONITORED_COMPLEXES) {
        connect(buildStopDisplay(complex.locationId, data.stopsById, data.stopIdByCameraIndex).districtName, complex.locationId)
    }

    for (const location of locationSummaries) {
        const current = connect(location.districtName, location.locationId)

        if (location.windows > 0) {
            current.liveDirections += 1
            current.currentPeopleSum += location.currentPeople
        }
        current.peakPeople = Math.max(current.peakPeople, location.peakPeople)
        if (location.latestAt && (!current.latestAt || location.latestAt > current.latestAt)) {
            current.latestAt = location.latestAt
        }
        current.topStops.push(location)
    }

    for (const alert of data.alerts) {
        const locationId = getStopComplexByCameraIndex(alert.camera_index)?.locationId ?? getAlertLocationId(alert)
        const districtName = getEventDistrictName(alert.camera_index, locationId, data.stopsById, data.stopIdByCameraIndex)
        const current = locationId ? connect(districtName, locationId) : getCurrent(districtName)

        current.safetyEvents += 1
        current.safetyEventsByType[alert.alert_type] = (current.safetyEventsByType[alert.alert_type] ?? 0) + 1
        districtMap.set(districtName, current)
    }

    return Array.from(districtMap.entries())
        .map(([districtName, value]) => {
            const connectedStops = value.connected.size
            const totalStops = Math.max(cityStopsByDistrict.get(districtName) ?? 0, connectedStops)
            const coveragePct = totalStops > 0 ? Math.round((connectedStops / totalStops) * 100) : 0

            return {
                districtName,
                stops: connectedStops,
                connectedStopNames: Array.from(new Set(value.connected.values())),
                estimatedTotalMin: totalStops,
                estimatedTotalMax: totalStops,
                estimatedTotalLabel: `${totalStops}`,
                liveDirections: value.liveDirections,
                averagePeople: value.liveDirections > 0
                    ? Number((value.currentPeopleSum / value.liveDirections).toFixed(1))
                    : 0,
                peakPeople: value.peakPeople,
                safetyEvents: value.safetyEvents,
                safetyEventsByType: value.safetyEventsByType,
                coverageMinPct: coveragePct,
                coverageMaxPct: coveragePct,
                coverageMidPct: coveragePct,
                coverageLabel: `${coveragePct}%`,
                coveragePct,
                latestAt: value.latestAt,
                topStops: value.topStops
                    .sort((a, b) => b.currentPeople - a.currentPeople || b.safetyEvents - a.safetyEvents)
                    .slice(0, 3)
                    .map((stop) => stop.label),
            }
        })
        .sort((a, b) => b.averagePeople - a.averagePeople || b.safetyEvents - a.safetyEvents || a.districtName.localeCompare(b.districtName, "ru"))
}
