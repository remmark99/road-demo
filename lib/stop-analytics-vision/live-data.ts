"use client"
// Живые данные для новой аналитики остановок: собирает из базы тот же набор, что прототип
// строил из демо-генератора (lib/mock/stop-analytics-vision-data.ts), и ставит его в модуль.
import { createClient } from "@/lib/supabase/client"
import { getBinEpisode } from "@/lib/bin-episodes"
import { fetchCurrentStops, fetchStopCameras, resolveLocationStopId, toVmsCameraIndex } from "@/lib/api/stop-current-analytics"
import { fetchStopDistricts, fetchStopDistrictAssignments } from "@/lib/api/stop-districts"
import { fetchEquipmentState } from "@/lib/api/equipment"
import { fetchStopSafetyAlerts } from "@/lib/api/alerts"
import { fetchStopLoadAnalytics } from "@/lib/api/stop-load-analytics"
import { getStopComplexByLocationId } from "@/lib/stop-analytics-config"
import { analyticsClimateChunks } from "@/lib/stop-analytics-vision/chunks"
import type { StopConditionsResponse } from "@/lib/stop-conditions"
import {
    DAY,
    HOUR,
    cityDayStart,
    installVisionDataset,
    type SafetyType,
    type VBinEpisode,
    type VClimate,
    type VDevice,
    type VDistrict,
    type VOutage,
    type VOutageCause,
    type VSafetyEvent,
    type VStop,
    type VisionDataset,
} from "@/lib/mock/stop-analytics-vision-data"

/** События, эпизоды и отключения — за 62 дня: месяц и предыдущий месяц для сравнения. */
const HISTORY_DAYS = 62
/** Климат и загруженность — за 31 день (столько отдают их API за раз). */
const SERIES_DAYS = 31
/** Показание климата описывает момент, если оно не старше двух часов. */
const CLIMATE_MAX_AGE = 2 * HOUR
/** Отключения нескольких остановок, начавшиеся в пределах 5 минут, считаем аварией на сети. */
const NETWORK_WINDOW = 5 * 60_000
const NETWORK_MIN_STOPS = 3

type ClimatePoint = [number, number | null, number | null]

async function readPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, limit = 50_000) {
    const rows: T[] = []
    while (rows.length < limit) {
        const { data, error } = await page(rows.length, rows.length + 999)
        if (error) throw new Error("Не удалось загрузить данные аналитики")
        const chunk = (data ?? []) as T[]
        rows.push(...chunk)
        if (chunk.length < 1000) break
    }
    return rows
}

async function fetchClimate(now: number) {
    const climate = new Map<number, ClimatePoint[]>()
    const glass = new Map<number, number[]>()
    let thresholds: StopConditionsResponse["thresholds"] | null = null
    const chunks = analyticsClimateChunks(now)
    const responses = await Promise.all(chunks.map(async ([from, to]) => {
        const params = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() })
        const response = await fetch(`/api/stop-conditions?${params}`, { cache: "no-store", signal: AbortSignal.timeout(120_000) })
        if (!response.ok) throw new Error("Не удалось загрузить показания датчиков")
        return response.json() as Promise<StopConditionsResponse>
    }))
    for (const body of responses) {
        thresholds ??= body.thresholds
        for (const [stopId, series] of Object.entries(body.stops)) {
            const id = Number(stopId)
            climate.set(id, [...(climate.get(id) ?? []), ...series.climate])
            glass.set(id, [...(glass.get(id) ?? []), ...series.incidents])
        }
    }
    for (const points of climate.values()) points.sort((a, b) => a[0] - b[0])
    for (const [id, times] of glass) glass.set(id, [...new Set(times)].sort((a, b) => a - b))
    return { climate, glass, thresholds }
}

function climateLookup(climate: Map<number, ClimatePoint[]>) {
    return (stop: VStop, ts: number): VClimate => {
        const points = climate.get(stop.id)
        if (!points?.length) return { temp: null, humidity: null }
        // Последнее показание не позже момента: двоичный поиск по возрастающему времени.
        let lo = 0, hi = points.length - 1, best = -1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (points[mid][0] <= ts + HOUR) { best = mid; lo = mid + 1 } else hi = mid - 1
        }
        if (best < 0 || Math.abs(ts - points[best][0]) > CLIMATE_MAX_AGE) return { temp: null, humidity: null }
        const [, temp, humidity] = points[best]
        return { temp: temp === null ? null : Math.round(temp * 10) / 10, humidity: humidity === null ? null : Math.round(humidity) }
    }
}

interface OutageRow {
    id: number
    equipment_type: "camera" | "controller"
    equipment_id: number
    bus_stop_id: number | null
    started_at: string
    ended_at: string | null
}

/** Отключения от 10 минут и открытые сейчас; короткие пропадания связи отсекает сервер. */
async function fetchOutages(from: number): Promise<{ data: OutageRow[] }> {
    const response = await fetch(`/api/stop-equipment-outages?from=${new Date(from).toISOString()}`, { cache: "no-store", signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error("Не удалось загрузить отключения оборудования")
    const body = await response.json() as { outages: OutageRow[] }
    return { data: body.outages }
}

function outageCauses(outages: OutageRow[], devicesByStop: Map<number, number>, now: number): Map<number, VOutageCause> {
    const causes = new Map<number, VOutageCause>()
    const byStop = new Map<number, OutageRow[]>()
    for (const outage of outages) {
        if (outage.bus_stop_id === null) continue
        byStop.set(outage.bus_stop_id, [...(byStop.get(outage.bus_stop_id) ?? []), outage])
    }
    // Начала по времени: соседей «в те же минуты» ищем скользящим окном, а не перебором всех пар.
    const byStart = outages.filter((outage) => outage.bus_stop_id !== null).map((outage) => ({ outage, start: Date.parse(outage.started_at) })).sort((a, b) => a.start - b.start)
    const networkIds = new Set<number>()
    for (let i = 0, j = 0; i < byStart.length; i++) {
        while (byStart[i].start - byStart[j].start > NETWORK_WINDOW) j++
        let k = i
        while (k + 1 < byStart.length && byStart[k + 1].start - byStart[i].start <= NETWORK_WINDOW) k++
        const stops = new Set(byStart.slice(j, k + 1).map((item) => item.outage.bus_stop_id))
        if (stops.size >= NETWORK_MIN_STOPS) networkIds.add(byStart[i].outage.id)
    }
    for (const outage of outages) {
        const start = Date.parse(outage.started_at)
        const end = outage.ended_at ? Date.parse(outage.ended_at) : now
        // Сразу несколько остановок пропали в одни и те же минуты — авария на сети.
        if (networkIds.has(outage.id)) { causes.set(outage.id, "network"); continue }
        // Пропали все устройства остановки — нет связи или питания павильона.
        const siblings = outage.bus_stop_id === null ? [] : byStop.get(outage.bus_stop_id) ?? []
        const overlapping = new Set(siblings
            .filter((other) => Date.parse(other.started_at) < end && (other.ended_at ? Date.parse(other.ended_at) : now) > start)
            .map((other) => `${other.equipment_type}:${other.equipment_id}`))
        const total = outage.bus_stop_id === null ? 0 : devicesByStop.get(outage.bus_stop_id) ?? 0
        causes.set(outage.id, total > 1 && overlapping.size >= total ? "stop" : "device")
    }
    return causes
}

export async function loadLiveVisionDataset(): Promise<VisionDataset> {
    const now = Date.now()
    const historyFrom = cityDayStart(now) - (HISTORY_DAYS - 1) * DAY
    const supabase = createClient()

    const [stopCodes, stopsInfo, cameras, districts, assignments, equipment, outagesResult, safetyAlerts, lyingEpisodes, binAlerts, climateData, load] = await Promise.all([
        readPages<{ id: number; stop_code: string | null }>((a, b) => supabase.from("bus_stops").select("id,stop_code").order("id").range(a, b)),
        fetchCurrentStops(),
        fetchStopCameras(),
        fetchStopDistricts(),
        fetchStopDistrictAssignments(),
        fetchEquipmentState(),
        fetchOutages(historyFrom),
        fetchStopSafetyAlerts({ from: new Date(historyFrom), to: new Date(now), types: ["smoking", "abandoned_object", "dogs_without_people"] }),
        readPages<{ id: string; camera_index: number | null; location_id: string | null; status: string; started_at: string; ended_at: string | null }>((a, b) =>
            supabase.from("lying_person_episodes").select("id,camera_index,location_id,status,started_at,ended_at")
                .gte("started_at", new Date(historyFrom).toISOString()).order("started_at").range(a, b)),
        // Эпизод урны записан на время начала: берём и начавшиеся за месяц до окна, но ещё открытые в нём.
        readPages<{ id: string; alert_type: string; camera_index: number | null; metadata: Record<string, unknown> | null }>((a, b) =>
            supabase.from("alerts").select("id,alert_type,camera_index,metadata").eq("alert_type", "bin_full")
                .gte("timestamp", new Date(historyFrom - 30 * DAY).toISOString()).order("id").range(a, b)),
        fetchClimate(now),
        fetchStopLoadAnalytics({ from: new Date(Math.floor((now - SERIES_DAYS * DAY) / 300_000) * 300_000), to: new Date(Math.floor(now / 300_000) * 300_000) }),
    ])

    // Камера → остановка: и номер из справочника, и номер VMS, которым пишутся события.
    const stopByCamera = new Map<number, number>()
    const camerasByStop = new Map<number, number[]>()
    for (const camera of cameras) {
        if (camera.module !== "stops" || camera.camera_index === null || camera.bus_stop_id === null) continue
        stopByCamera.set(camera.camera_index, camera.bus_stop_id)
        stopByCamera.set(toVmsCameraIndex(camera.camera_index), camera.bus_stop_id)
        camerasByStop.set(camera.bus_stop_id, [...(camerasByStop.get(camera.bus_stop_id) ?? []), camera.camera_index])
    }
    const stopOfCamera = (index: number | null) => index === null ? undefined : stopByCamera.get(index)
    // location_id аналитики — код остановки («104-25» = bus_stops.stop_code), «stop-677» — id остановки,
    // у комплексов — по их камерам. Раньше искали в short_name (там название) и находили только комплексы.
    const stopByCode = new Map(stopCodes.filter((row) => row.stop_code?.trim()).map((row) => [row.stop_code!.trim(), row.id]))
    const stopOfLocation = (locationId: string): number | undefined => {
        const code = locationId.trim()
        const direct = /^stop-(\d+)$/.exec(code)
        return stopByCode.get(code)
            ?? (direct ? Number(direct[1]) : undefined)
            ?? (getStopComplexByLocationId(code) ? resolveLocationStopId(code, stopByCamera) ?? undefined : undefined)
            ?? (/^\d+$/.test(code) ? Number(code) : undefined)
    }

    // Устройства на контроле — оснащённые остановки.
    const devices: VDevice[] = []
    for (const row of equipment.data) {
        if (row.bus_stop_id === null) continue
        devices.push(row.equipment_type === "camera"
            ? { key: `cam-${row.equipment_id}`, stopId: row.bus_stop_id, type: "camera", label: `Камера ${row.equipment_id}` }
            : { key: `ctl-${row.equipment_id}`, stopId: row.bus_stop_id, type: "controller", label: "Контроллер" })
    }
    const deviceStops = new Set(devices.map((device) => device.stopId))
    for (const stopId of camerasByStop.keys()) deviceStops.add(stopId)
    for (const stopId of climateData.climate.keys()) deviceStops.add(stopId)
    // Остановки, где считают людей, тоже в разделах — даже если камеры нет в справочнике оборудования.
    for (const row of load.locationHours) { const stopId = stopOfLocation(row.locationId); if (stopId !== undefined) deviceStops.add(stopId) }

    const districtByStop = new Map(assignments.map((row) => [row.id, row.district_id]))
    const codeOf = new Map(stopCodes.map((row) => [row.id, row.stop_code?.trim() ?? ""]))
    const stops: VStop[] = stopsInfo
        .filter((stop) => deviceStops.has(stop.id))
        .map((stop) => ({
            id: stop.id,
            name: stop.short_name?.trim() || stop.name?.trim() || `Остановка ${stop.id}`,
            code: codeOf.get(stop.id) || String(stop.id),
            direction: stop.description?.trim() || "",
            districtId: districtByStop.get(stop.id) != null ? String(districtByStop.get(stop.id)) : "",
            cameras: camerasByStop.get(stop.id) ?? [],
            capacity: null,
            busy: 1, binProne: 1, safetyProne: 1, coldProne: 1, flaky: 1,
            sensorFault: null,
            glassFault: null,
        }))
    const stopIds = new Set(stops.map((stop) => stop.id))

    const cityStopsByDistrict = new Map<number, number>()
    for (const row of assignments) if (row.district_id !== null) cityStopsByDistrict.set(row.district_id, (cityStopsByDistrict.get(row.district_id) ?? 0) + 1)
    const visionDistricts: VDistrict[] = districts
        .map((district) => ({ id: String(district.id), name: district.name, cityStops: cityStopsByDistrict.get(district.id) ?? 0 }))
        .filter((district) => district.cityStops > 0)

    // Датчик молчит: у остановки есть контроллер, но за последние сутки нет ни одного показания.
    const climateAt = climateLookup(climateData.climate)
    for (const stop of stops) {
        const hasController = devices.some((device) => device.stopId === stop.id && device.type === "controller")
        const recent = (climateData.climate.get(stop.id) ?? []).some(([at, temp, humidity]) => at > now - DAY && (temp !== null || humidity !== null))
        if (hasController && !recent) stop.sensorFault = "silent"
    }

    const safety: VSafetyEvent[] = []
    for (const alert of safetyAlerts) {
        const stopId = stopOfCamera(alert.camera_index) ?? (alert.metadata?.location_id ? stopOfLocation(alert.metadata.location_id) : undefined)
        if (stopId === undefined || !stopIds.has(stopId)) continue
        const confidence = typeof alert.metadata?.confidence === "number" ? alert.metadata.confidence as number : null
        safety.push({ id: alert.id, stopId, type: alert.alert_type as SafetyType, at: Date.parse(alert.timestamp), durationMin: 0, camera: alert.camera_index, confidence, verdict: "confirmed" })
    }
    for (const episode of lyingEpisodes) {
        const stopId = stopOfCamera(episode.camera_index) ?? (episode.location_id ? stopOfLocation(episode.location_id) : undefined)
        if (stopId === undefined || !stopIds.has(stopId)) continue
        const start = Date.parse(episode.started_at)
        const durationMin = episode.ended_at ? Math.max(1, Math.round((Date.parse(episode.ended_at) - start) / 60_000)) : null
        safety.push({ id: `lp-${episode.id}`, stopId, type: "lying_person", at: start, durationMin, camera: episode.camera_index, confidence: null, verdict: "confirmed" })
    }
    for (const [stopId, times] of climateData.glass) {
        if (!stopIds.has(stopId)) continue
        for (const at of times) safety.push({ id: `gl-${stopId}-${at}`, stopId, type: "glass_break", at, durationMin: 0, camera: null, confidence: null, verdict: null })
    }

    const bins: VBinEpisode[] = []
    for (const alert of binAlerts) {
        const episode = getBinEpisode({ alert_type: alert.alert_type, metadata: alert.metadata } as Parameters<typeof getBinEpisode>[0])
        const stopId = stopOfCamera(alert.camera_index)
        if (!episode || stopId === undefined || !stopIds.has(stopId)) continue
        const startAt = Date.parse(episode.started_at)
        const endAt = episode.ended_at ? Date.parse(episode.ended_at) : null
        if (endAt !== null && endAt < historyFrom) continue
        bins.push({ id: `b-${alert.id}`, stopId, startAt, endAt, confirmations: episode.observation_count })
    }

    const devicesByStop = new Map<number, number>()
    for (const device of devices) devicesByStop.set(device.stopId, (devicesByStop.get(device.stopId) ?? 0) + 1)
    const causes = outageCauses(outagesResult.data, devicesByStop, now)
    const outages: VOutage[] = outagesResult.data
        .filter((outage) => outage.bus_stop_id !== null && stopIds.has(outage.bus_stop_id))
        .map((outage) => ({
            id: String(outage.id),
            stopId: outage.bus_stop_id!,
            deviceKey: outage.equipment_type === "camera" ? `cam-${outage.equipment_id}` : `ctl-${outage.equipment_id}`,
            device: outage.equipment_type,
            label: outage.equipment_type === "camera" ? `Камера ${outage.equipment_id}` : "Контроллер",
            startAt: Date.parse(outage.started_at),
            endAt: outage.ended_at ? Date.parse(outage.ended_at) : null,
            cause: causes.get(outage.id) ?? "device",
        }))

    // Загруженность: средняя и наибольшая за час по направлениям остановки.
    const loadByStopHour = new Map<string, { avg: number; peak: number }>()
    for (const row of load.locationHours) {
        const stopId = stopOfLocation(row.locationId)
        if (stopId === undefined || !stopIds.has(stopId)) continue
        const key = `${stopId}:${Math.floor(Date.parse(row.hourKey) / HOUR)}`
        const current = loadByStopHour.get(key)
        loadByStopHour.set(key, { avg: (current?.avg ?? 0) + row.avgPeople, peak: Math.max(current?.peak ?? 0, row.peakPeople) })
    }

    const stopsWithLoad = new Set([...loadByStopHour.keys()].map((key) => Number(key.split(":")[0])))
    const thresholds = climateData.thresholds
    return {
        now,
        historyDays: HISTORY_DAYS,
        districts: visionDistricts,
        cityStopTotal: assignments.length,
        stops,
        safety,
        bins,
        devices,
        outages,
        norms: thresholds ? {
            tempMin: thresholds.tempEnabled ? thresholds.tempMin : -Infinity,
            tempMax: thresholds.tempEnabled ? thresholds.tempMax : Infinity,
            humidityMax: thresholds.humidityEnabled ? thresholds.humidityMax : Infinity,
        } : {},
        climateAt,
        hasLoad: (stop) => stopsWithLoad.has(stop.id),
        loadAt: (stop, ts) => loadByStopHour.get(`${stop.id}:${Math.floor(ts / HOUR)}`)?.avg ?? 0,
        peakAt: (stop, ts) => loadByStopHour.get(`${stop.id}:${Math.floor(ts / HOUR)}`)?.peak ?? 0,
    }
}

let installed: Promise<void> | null = null

/** Загружает живые данные один раз за сессию страницы и ставит их в модуль аналитики. */
export function ensureLiveVisionData() {
    installed ??= loadLiveVisionDataset().then(installVisionDataset).catch((error: unknown) => {
        installed = null
        throw error
    })
    return installed
}
