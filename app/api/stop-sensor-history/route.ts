import { NextRequest, NextResponse } from "next/server"

import {
    SENSOR_HISTORY_PERIODS,
    type SensorHistoryHours,
    type SensorHistoryStop,
    type StopSensorHistoryResponse,
    type StopSensorHistoryRow,
    type StopSensorOption,
    type StopSensorSeriesPoint,
} from "@/lib/api/stop-sensor-history"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

const PAGE_SIZE = 1000
const MAX_SOURCE_ROWS = 60_000
const HISTORY_COLUMNS = "id,bus_stop_id,element,address,category,name,value,alarm,recorded_at"
const VERIFIED_SENSOR_ELEMENTS = [1, 13, 14]

interface DatabaseHistoryRow {
    id: number
    bus_stop_id: number
    element: number
    address: number
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

interface SeriesAccumulator {
    bucket: string
    busStopId: number
    element: number
    address: number
    category: string
    name: string
    sum: number
    samples: number
    minimum: number | null
    maximum: number | null
    alarm: string
}

function parseHours(value: string | null): SensorHistoryHours {
    const parsed = Number(value)
    return SENSOR_HISTORY_PERIODS.includes(parsed as SensorHistoryHours)
        ? parsed as SensorHistoryHours
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

function alarmRank(alarm: string) {
    switch (alarm.toLowerCase()) {
        case "critical": return 4
        case "alarm": return 3
        case "warning": return 2
        default: return 1
    }
}

function normalizeRow(row: DatabaseHistoryRow): StopSensorHistoryRow {
    return {
        id: Number(row.id),
        busStopId: Number(row.bus_stop_id),
        element: Number(row.element),
        address: Number(row.address ?? 0),
        category: row.category || "sensor",
        name: row.name || `Датчик ${row.element}`,
        value: row.value === null ? null : Number(row.value),
        alarm: row.alarm || "normal",
        recordedAt: row.recorded_at,
    }
}

function aggregateRows(rows: StopSensorHistoryRow[], bucketMinutes: number) {
    const buckets = new Map<string, SeriesAccumulator>()

    for (const row of rows) {
        const bucket = floorToBucket(row.recordedAt, bucketMinutes)
        const key = [row.busStopId, row.element, row.address, row.category, bucket].join(":")
        const current = buckets.get(key) ?? {
            bucket,
            busStopId: row.busStopId,
            element: row.element,
            address: row.address,
            category: row.category,
            name: row.name,
            sum: 0,
            samples: 0,
            minimum: null,
            maximum: null,
            alarm: "normal",
        }

        if (row.value !== null && Number.isFinite(row.value)) {
            current.sum += row.value
            current.samples += 1
            current.minimum = current.minimum === null ? row.value : Math.min(current.minimum, row.value)
            current.maximum = current.maximum === null ? row.value : Math.max(current.maximum, row.value)
        }

        if (alarmRank(row.alarm) > alarmRank(current.alarm)) current.alarm = row.alarm
        buckets.set(key, current)
    }

    return Array.from(buckets.values())
        .map<StopSensorSeriesPoint>((value) => ({
            bucket: value.bucket,
            busStopId: value.busStopId,
            element: value.element,
            address: value.address,
            category: value.category,
            name: value.name,
            average: value.samples ? value.sum / value.samples : null,
            minimum: value.minimum,
            maximum: value.maximum,
            alarm: value.alarm,
            samples: value.samples,
        }))
        .sort((left, right) => left.bucket.localeCompare(right.bucket))
}

function buildSensorOptions(rows: StopSensorHistoryRow[]) {
    const options = new Map<string, StopSensorOption>()

    for (const row of rows) {
        const key = `${row.busStopId}:${row.element}:${row.address}:${row.category}`
        options.set(key, {
            key,
            busStopId: row.busStopId,
            element: row.element,
            address: row.address,
            category: row.category,
            name: row.name,
        })
    }

    return Array.from(options.values()).sort((left, right) =>
        left.busStopId - right.busStopId
        || left.category.localeCompare(right.category, "ru")
        || left.element - right.element
        || left.address - right.address
    )
}

async function loadStops(ids: number[]): Promise<SensorHistoryStop[]> {
    if (ids.length === 0) return []

    const supabase = await createClient()
    const { data, error } = await supabase
        .from("bus_stops")
        .select("id,name,short_name,description,address")
        .in("id", ids)
    if (error) {
        return ids.map((id) => ({ id, label: `Остановка ${id}`, detail: null }))
    }

    const lookup = new Map<number, SensorHistoryStop>()

    for (const stop of (data ?? []) as BusStopRow[]) {
        lookup.set(stop.id, {
            id: stop.id,
            label: stop.short_name?.trim() || stop.name?.trim() || `Остановка ${stop.id}`,
            detail: stop.description?.trim() || stop.address?.trim() || null,
        })
    }

    return ids.map((id) => lookup.get(id) ?? { id, label: `Остановка ${id}`, detail: null })
}

export async function GET(request: NextRequest) {
    const hours = parseHours(request.nextUrl.searchParams.get("hours"))
    const busStopId = parseBusStopId(request.nextUrl.searchParams.get("busStopId"))
    const category = request.nextUrl.searchParams.get("category")?.trim() || null
    const to = new Date()
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000)

    try {
        const supabase = await createClient()
        let firstPageQuery = supabase
            .from("stop_sensor_history")
            .select(HISTORY_COLUMNS, { count: "exact" })
            .in("element", VERIFIED_SENSOR_ELEMENTS)
            .gte("recorded_at", from.toISOString())
            .lte("recorded_at", to.toISOString())
            .order("recorded_at", { ascending: false })
            .range(0, PAGE_SIZE - 1)

        if (busStopId !== null) firstPageQuery = firstPageQuery.eq("bus_stop_id", busStopId)
        if (category) firstPageQuery = firstPageQuery.eq("category", category)

        const { data: firstPage, count, error: firstPageError } = await firstPageQuery
        if (firstPageError) throw new Error(firstPageError.message)

        const totalRows = count ?? 0
        const sourceRows = Math.min(totalRows, MAX_SOURCE_ROWS)
        const pages = Array.from({ length: Math.max(0, Math.ceil(sourceRows / PAGE_SIZE) - 1) }, (_, index) => {
            const pageIndex = index + 1
            const start = pageIndex * PAGE_SIZE
            return { start, end: Math.min(sourceRows - 1, start + PAGE_SIZE - 1) }
        })

        const pageResults = await Promise.all(pages.map(async ({ start, end }) => {
            let query = supabase
                .from("stop_sensor_history")
                .select(HISTORY_COLUMNS)
                .in("element", VERIFIED_SENSOR_ELEMENTS)
                .gte("recorded_at", from.toISOString())
                .lte("recorded_at", to.toISOString())
                .order("recorded_at", { ascending: false })
                .range(start, end)

            if (busStopId !== null) query = query.eq("bus_stop_id", busStopId)
            if (category) query = query.eq("category", category)

            const { data, error } = await query
            if (error) throw new Error(error.message)
            return (data ?? []) as DatabaseHistoryRow[]
        }))

        const rows = [
            ...((firstPage ?? []) as DatabaseHistoryRow[]),
            ...pageResults.flat(),
        ].slice(0, sourceRows).map(normalizeRow)
        const stopIds = Array.from(new Set(rows.map((row) => row.busStopId))).sort((a, b) => a - b)
        const bucketMinutes = getBucketMinutes(hours)
        const payload: StopSensorHistoryResponse = {
            range: { from: from.toISOString(), to: to.toISOString() },
            bucketMinutes,
            totalRows,
            sourceRows: rows.length,
            truncated: totalRows > MAX_SOURCE_ROWS,
            lastRecordedAt: rows[0]?.recordedAt ?? null,
            stops: await loadStops(stopIds),
            sensors: buildSensorOptions(rows),
            series: aggregateRows(rows, bucketMinutes),
            recent: rows.slice(0, 1000),
        }

        return NextResponse.json(payload, {
            headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
        })
    } catch (error) {
        console.error("Stop sensor history API error", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Не удалось прочитать историю датчиков" },
            { status: 500 },
        )
    }
}
