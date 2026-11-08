import { NextRequest, NextResponse } from "next/server"

import {
    type GlassEvent,
    type GlassSensorIssue,
    type SensorHistoryStop,
    type StopSensorHistoryResponse,
    type StopSensorHistoryRow,
    type StopSensorOption,
    type StopSensorSeriesPoint,
} from "@/lib/api/stop-sensor-history"
import { getAuthenticatedUser, jsonError } from "@/lib/notifications/http"
import {
    floorToSensorBucket,
    sensorBucketMinutes,
    sensorCalendarBounds,
    sensorCityDay,
    sensorSampleWindows,
} from "@/lib/sensor-history-period"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Charts show a cross-stop average and min–max band per time bucket. All stops write
// about 140 rows a minute, so reading a period row by row would only ever reach its
// newest hour: each bucket contributes its newest rows instead, which covers the whole
// period at any length and keeps the response small.
const SAMPLE_ROWS_PER_WINDOW = 300
const WINDOW_QUERY_CONCURRENCY = 8
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

interface GlassIssueRow {
    bus_stop_id: number
    alarm: string | null
    value: number | null
    updated_at: string | null
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

/** null — все остановки, пустой список — ни одной. */
function parseBusStopIds(value: string | null) {
    if (value === null) return null
    if (value === "") return []
    const ids = value.split(",").map(Number)
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error("Некорректный список остановок")
    return ids
}

/** Collapse all stops' readings into one average + min–max band per (category, bucket). */
function aggregateAcrossStops(rows: DatabaseHistoryRow[], bucketMinutes: number): StopSensorSeriesPoint[] {
    const buckets = new Map<string, BucketAccumulator>()
    for (const row of rows) {
        if (row.value === null || !Number.isFinite(row.value)) continue
        const category = row.category || "sensor"
        const bucket = new Date(floorToSensorBucket(Date.parse(row.recorded_at), bucketMinutes)).toISOString()
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

    const params = request.nextUrl.searchParams
    const now = new Date()
    let from: Date
    let to: Date
    let busStopIds: number[] | null
    try {
        const today = sensorCityDay(now)
        const bounds = sensorCalendarBounds(params.get("from") ?? today, params.get("to") ?? today)!
        from = bounds.from
        to = bounds.to > now ? now : bounds.to
        busStopIds = parseBusStopIds(params.get("busStopIds"))
    } catch (error) {
        return jsonError(error instanceof Error ? error.message : "Некорректный запрос", 400)
    }
    const fromIso = from.toISOString()
    const toIso = to.toISOString()

    try {
        const supabase = await createClient()

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

        // ── Chart data: newest temperature/humidity rows of every time bucket. ──
        // Always filtered by stop: the customer database only has the (bus_stop_id,
        // recorded_at) index, and without the stop filter each window is a full table scan.
        const chartStopIds = busStopIds ?? stopList.map((stop) => stop.id)
        const bucketMinutes = sensorBucketMinutes(to.getTime() - from.getTime())
        const windows = sensorSampleWindows(from, to, bucketMinutes)
        const chartRows: DatabaseHistoryRow[] = []
        let truncated = false
        for (let index = 0; index < windows.length; index += WINDOW_QUERY_CONCURRENCY) {
            const pages = await Promise.all(windows.slice(index, index + WINDOW_QUERY_CONCURRENCY).map((window) => {
                return supabase
                    .from("stop_sensor_history")
                    .select("bus_stop_id,element,address,category,name,value,alarm,recorded_at")
                    .in("bus_stop_id", chartStopIds)
                    .in("element", CHART_ELEMENTS)
                    .gte("recorded_at", window.from)
                    .lt("recorded_at", window.to)
                    .order("recorded_at", { ascending: false })
                    .limit(SAMPLE_ROWS_PER_WINDOW)
            }))
            for (const page of pages) {
                if (page.error) throw new Error(page.error.message)
                const rows = (page.data ?? []) as DatabaseHistoryRow[]
                if (rows.length >= SAMPLE_ROWS_PER_WINDOW) truncated = true
                chartRows.push(...rows)
            }
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
            .in("category", ["glass_break", "incident"])
            .gte("created_at", fromIso)
            .lt("created_at", toIso)
            .order("created_at", { ascending: false })
            .limit(GLASS_EVENTS + 1)
        if (busStopIds !== null) alertQuery = alertQuery.in("bus_stop_id", busStopIds)

        // ── Датчики стекла, которые поллер пометил «шумными» или залипшими. ──
        let issueQuery = supabase
            .from("stop_sensor_states")
            .select("bus_stop_id,alarm,value,updated_at")
            .eq("category", "glass_status")
            .in("alarm", ["noisy", "stuck"])
        if (busStopIds !== null) issueQuery = issueQuery.in("bus_stop_id", busStopIds)

        const [{ data: alertData }, { data: issueData }] = await Promise.all([alertQuery, issueQuery])
        const alertRows = (alertData ?? []) as AlertRow[]
        const issueRows = (issueData ?? []) as GlassIssueRow[]

        const events: GlassEvent[] = alertRows.slice(0, GLASS_EVENTS).map((row) => ({
            id: String(row.id),
            busStopId: row.bus_stop_id,
            busStopLabel: row.bus_stop_id
                ? stopLabelById.get(row.bus_stop_id)?.label ?? `Остановка ${row.bus_stop_id}`
                : "Остановка не указана",
            message: row.message || "Срабатывание датчика разбития стекла",
            alarm: row.alarm || "alarm",
            recordedAt: row.created_at,
        }))

        const glassIssues: GlassSensorIssue[] = issueRows
            .map((row) => ({
                busStopId: row.bus_stop_id,
                busStopLabel: stopLabelById.get(row.bus_stop_id)?.label ?? `Остановка ${row.bus_stop_id}`,
                status: row.alarm === "stuck" ? "stuck" as const : "noisy" as const,
                pulses24h: row.value === null ? null : Number(row.value),
                updatedAt: row.updated_at,
            }))
            .sort((left, right) => left.status.localeCompare(right.status) || left.busStopLabel.localeCompare(right.busStopLabel, "ru"))

        const series = aggregateAcrossStops(chartRows, bucketMinutes)

        const sensors: StopSensorOption[] = [
            { key: "temperature", busStopId: 0, element: 13, address: 0, category: "temperature", name: "Температура" },
            { key: "humidity", busStopId: 0, element: 13, address: 0, category: "humidity", name: "Влажность" },
        ]

        const payload: StopSensorHistoryResponse = {
            range: { from: fromIso, to: toIso },
            generatedAt: now.toISOString(),
            bucketMinutes,
            totalRows: chartRows.length,
            sourceRows: chartRows.length,
            truncated,
            lastRecordedAt: chartRows[0]?.recorded_at ?? null,
            stops: stopList,
            sensors,
            series,
            recent: recentRows,
            events,
            eventsTruncated: alertRows.length > GLASS_EVENTS,
            glassIssues,
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
