import { NextRequest, NextResponse } from "next/server"

import {
    SENSOR_HISTORY_PERIODS,
    type GlassEvent,
    type SensorHistoryHours,
    type SensorHistoryStop,
    type StopSensorHistoryResponse,
    type StopSensorHistoryRow,
    type StopSensorOption,
    type StopSensorSeriesPoint,
} from "@/lib/api/stop-sensor-history"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Newest rows pulled for the temperature/humidity charts. Charts show a cross-stop
// average and min–max band per time bucket, so a recent sample is enough and the
// response stays tiny and fast regardless of how much history has piled up.
const CHART_SOURCE_ROWS = 12_000
const CHART_PAGE = 1000
// Elements charted as time series. Temperature and humidity both live on element 13.
const CHART_ELEMENTS = [13]
const RECENT_TABLE_ROWS = 40
const GLASS_EVENTS = 50

interface DatabaseHistoryRow {
    bus_stop_id: number
    element: number
    address: number | null
    category: string | null
    name: string | null
    value: number | null
    alarm: string | null
    recorded_at: string
}

interface BusStopRow {
    id: number
    name: string | null
    short_name: string | null
    description: string | null
    address: string | null
}

interface AlertRow {
    id: number | string
    bus_stop_id: number | null
    category: string | null
    alarm: string | null
    prev_alarm: string | null
    message: string | null
    created_at: string
}

interface BucketAccumulator {
    bucket: string
    category: string
    sum: number
    samples: number
    minimum: number
    maximum: number
}

function parseHours(value: string | null): SensorHistoryHours {
    const parsed = Number(value)
    return SENSOR_HISTORY_PERIODS.includes(parsed as SensorHistoryHours)
        ? (parsed as SensorHistoryHours)
        : 24
}

function parseBusStopId(value: string | null) {
    if (!value) return null
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getBucketMinutes(hours: SensorHistoryHours) {
    if (hours <= 1) return 1
    if (hours <= 6) return 5
    if (hours <= 24) return 15
    return 60
}

function floorToBucket(iso: string, bucketMinutes: number) {
    const date = new Date(iso)
    const minutes = Math.floor(date.getUTCMinutes() / bucketMinutes) * bucketMinutes
    date.setUTCMinutes(minutes, 0, 0)
    return date.toISOString()
}

/** Collapse all stops' readings into one average + min–max band per (category, bucket). */
function aggregateAcrossStops(rows: DatabaseHistoryRow[], bucketMinutes: number): StopSensorSeriesPoint[] {
    const buckets = new Map<string, BucketAccumulator>()
    for (const row of rows) {
        if (row.value === null || !Number.isFinite(row.value)) continue
        const category = row.category || "sensor"
        const bucket = floorToBucket(row.recorded_at, bucketMinutes)
        const key = `${category}:${bucket}`
        const current = buckets.get(key)
        if (current) {
            current.sum += row.value
            current.samples += 1
            current.minimum = Math.min(current.minimum, row.value)
            current.maximum = Math.max(current.maximum, row.value)
        } else {
            buckets.set(key, {
                bucket,
                category,
                sum: row.value,
                samples: 1,
                minimum: row.value,
                maximum: row.value,
            })
        }
    }

    return Array.from(buckets.values())
        .map<StopSensorSeriesPoint>((acc) => ({
            bucket: acc.bucket,
            busStopId: 0,
            element: 13,
            address: 0,
            category: acc.category,
            name: acc.category,
            average: acc.sum / acc.samples,
            minimum: acc.minimum,
            maximum: acc.maximum,
            alarm: "normal",
            samples: acc.samples,
        }))
        .sort((left, right) => left.bucket.localeCompare(right.bucket))
}

export async function GET(request: NextRequest) {
    // Живые показания датчиков по остановкам — только для вошедших пользователей.
    const user = await getAuthenticatedUser()
    if (!user) return jsonError("Требуется авторизация", 401)

    const hours = parseHours(request.nextUrl.searchParams.get("hours"))
    const busStopId = parseBusStopId(request.nextUrl.searchParams.get("busStopId"))
    const to = new Date()
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
    const fromIso = from.toISOString()
    const toIso = to.toISOString()

    try {
        const supabase = await createClient()

        // ── Chart data: newest temperature/humidity rows, paged in parallel. ──
        const chartBase = () => {
            let q = supabase
                .from("stop_sensor_history")
                .select("bus_stop_id,element,address,category,name,value,alarm,recorded_at")
                .in("element", CHART_ELEMENTS)
                .gte("recorded_at", fromIso)
                .lte("recorded_at", toIso)
                .order("recorded_at", { ascending: false })
            if (busStopId !== null) q = q.eq("bus_stop_id", busStopId)
            return q
        }

        const pageCount = Math.ceil(CHART_SOURCE_ROWS / CHART_PAGE)
        const chartPages = await Promise.all(
            Array.from({ length: pageCount }, (_, index) => {
                const start = index * CHART_PAGE
                return chartBase().range(start, start + CHART_PAGE - 1)
            }),
        )
        const chartRows: DatabaseHistoryRow[] = []
        for (const page of chartPages) {
            if (page.error) throw new Error(page.error.message)
            chartRows.push(...((page.data ?? []) as DatabaseHistoryRow[]))
        }

        // ── Table: newest readings (all charted sensors). ──
        const recentRows: StopSensorHistoryRow[] = chartRows
            .slice(0, RECENT_TABLE_ROWS)
            .map((row, index) => ({
                id: index,
                busStopId: Number(row.bus_stop_id),
                element: Number(row.element),
                address: Number(row.address ?? 0),
                category: row.category || "sensor",
                name: row.name || `Датчик ${row.element}`,
                value: row.value === null ? null : Number(row.value),
                alarm: row.alarm || "normal",
                recordedAt: row.recorded_at,
            }))

        // ── Glass-break events from controller_alerts. ──
        let alertQuery = supabase
            .from("controller_alerts")
            .select("id,bus_stop_id,category,alarm,prev_alarm,message,created_at")
            .or("category.eq.glass_break,element.eq.1")
            .gte("created_at", fromIso)
            .order("created_at", { ascending: false })
            .limit(GLASS_EVENTS)
        if (busStopId !== null) alertQuery = alertQuery.eq("bus_stop_id", busStopId)
        const { data: alertData } = await alertQuery
        const alertRows = (alertData ?? []) as AlertRow[]

        // ── Stop labels for the dropdown (controller stops) + referenced stops. ──
        const { data: controllerStops } = await supabase
            .from("bus_stops")
            .select("id,name,short_name,description,address")
            .not("ip_address", "is", null)
        const stopList: SensorHistoryStop[] = ((controllerStops ?? []) as BusStopRow[])
            .map((stop) => ({
                id: stop.id,
                label: stop.short_name?.trim() || stop.name?.trim() || `Остановка ${stop.id}`,
                detail: stop.description?.trim() || stop.address?.trim() || null,
            }))
            .sort((left, right) => left.label.localeCompare(right.label, "ru"))
        const stopLabelById = new Map(stopList.map((stop) => [stop.id, stop]))

        const events: GlassEvent[] = alertRows.map((row) => ({
            id: String(row.id),
            busStopId: row.bus_stop_id,
            busStopLabel: row.bus_stop_id
                ? stopLabelById.get(row.bus_stop_id)?.label ?? `Остановка ${row.bus_stop_id}`
                : "Остановка не указана",
            message: row.message || "Срабатывание датчика разбития стекла",
            alarm: row.alarm || "alarm",
            recordedAt: row.created_at,
        }))

        const bucketMinutes = getBucketMinutes(hours)
        const series = aggregateAcrossStops(chartRows, bucketMinutes)

        const sensors: StopSensorOption[] = [
            { key: "temperature", busStopId: 0, element: 13, address: 0, category: "temperature", name: "Температура" },
            { key: "humidity", busStopId: 0, element: 13, address: 0, category: "humidity", name: "Влажность" },
        ]

        const payload: StopSensorHistoryResponse = {
            range: { from: fromIso, to: toIso },
            bucketMinutes,
            totalRows: chartRows.length,
            sourceRows: chartRows.length,
            truncated: chartRows.length >= CHART_SOURCE_ROWS,
            lastRecordedAt: chartRows[0]?.recorded_at ?? null,
            stops: stopList,
            sensors,
            series,
            recent: recentRows,
            events,
        }

        return NextResponse.json(payload, {
            headers: { "Cache-Control": "private, max-age=3, stale-while-revalidate=10" },
        })
    } catch (error) {
        console.error("Stop sensor history API error", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Не удалось прочитать историю датчиков" },
            { status: 500 },
        )
    }
}
