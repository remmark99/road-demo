// Mock data for Passenger Analytics dashboard
// 5 bus stops × 24 hours × 7 days of deterministic data

export const BUS_STOPS = [
    { id: "stop-1", name: "ул. Ленина / ТЦ Сити Молл" },
    { id: "stop-2", name: "пр. Мира / Администрация" },
    { id: "stop-3", name: "ул. Университетская / СурГУ" },
    { id: "stop-4", name: "ул. Энергетиков / Поликлиника" },
    { id: "stop-5", name: "мкр. 5А / Школа №18" },
] as const

export type BusStopId = (typeof BUS_STOPS)[number]["id"]

export type TimeRange = "today" | "yesterday" | "week" | "month"

export const TIME_RANGES: { value: TimeRange; label: string }[] = [
    { value: "today", label: "Сегодня" },
    { value: "yesterday", label: "Вчера" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
]

// Seeded pseudo-random
function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

// --- 1. Hourly passenger flow (arrivals, departures, net) ---
export interface HourlyFlowEntry {
    hour: string
    arrivals: number
    departures: number
    net: number
    stopId: BusStopId
    day: number // 0-6
}

function generateHourlyFlow(): HourlyFlowEntry[] {
    const data: HourlyFlowEntry[] = []
    // Rush hour pattern multipliers per hour
    const hourMultiplier = [
        0.05, 0.03, 0.02, 0.02, 0.04, 0.1,  // 0-5
        0.35, 0.7, 0.95, 0.6, 0.4, 0.45, // 6-11
        0.55, 0.5, 0.4, 0.5, 0.65, 0.9,  // 12-17
        0.75, 0.5, 0.3, 0.2, 0.12, 0.07, // 18-23
    ]

    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 1000
        for (let day = 0; day < 30; day++) {
            for (let h = 0; h < 24; h++) {
                const seed = stopSeed + day * 100 + h
                const mult = hourMultiplier[h]
                const baseArrivals = Math.round(50 + seededRandom(seed) * 120 * mult)
                const baseDepartures = Math.round(40 + seededRandom(seed + 1) * 110 * mult)
                data.push({
                    hour: `${String(h).padStart(2, "0")}:00`,
                    arrivals: baseArrivals,
                    departures: baseDepartures,
                    net: baseArrivals - baseDepartures,
                    stopId: stop.id,
                    day,
                })
            }
        }
    }
    return data
}

// --- 2. Current occupancy snapshot ---
export interface OccupancySnapshot {
    stopId: BusStopId
    stopName: string
    inside: number
    nearby: number
    total: number
    capacity: number
    pct: number
}

function generateOccupancy(): OccupancySnapshot[] {
    return BUS_STOPS.map((stop, i) => {
        const seed = (i + 1) * 7777
        const capacity = 20 + Math.round(seededRandom(seed) * 15)
        const inside = Math.round(seededRandom(seed + 1) * capacity)
        const nearby = Math.round(seededRandom(seed + 2) * 10)
        const total = inside + nearby
        return {
            stopId: stop.id,
            stopName: stop.name,
            inside,
            nearby,
            total,
            capacity,
            pct: Math.min(100, Math.round((total / capacity) * 100)),
        }
    })
}

// --- 3. Queue density by hour ---
export interface QueueDensityEntry {
    hour: string
    density: number // 0-100
    overcrowded: boolean
    stopId: BusStopId
    day: number
}

function generateQueueDensity(): QueueDensityEntry[] {
    const data: QueueDensityEntry[] = []
    const THRESHOLD = 70

    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 2000
        for (let day = 0; day < 30; day++) {
            for (let h = 0; h < 24; h++) {
                const seed = stopSeed + day * 100 + h
                // Higher density during rush hours
                const rushBoost = (h >= 7 && h <= 9) || (h >= 17 && h <= 19) ? 30 : 0
                const density = Math.min(100, Math.round(seededRandom(seed) * 60 + rushBoost + seededRandom(seed + 3) * 15))
                data.push({
                    hour: `${String(h).padStart(2, "0")}:00`,
                    density,
                    overcrowded: density >= THRESHOLD,
                    stopId: stop.id,
                    day,
                })
            }
        }
    }
    return data
}

// --- 4. Boarding counts per stop (hourly) ---
export interface BoardingEntry {
    hour: string
    count: number
    stopId: BusStopId
    day: number
}

function generateBoarding(): BoardingEntry[] {
    const data: BoardingEntry[] = []
    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 3000
        for (let day = 0; day < 30; day++) {
            for (let h = 0; h < 24; h++) {
                const seed = stopSeed + day * 100 + h
                const rush = (h >= 7 && h <= 9) || (h >= 17 && h <= 19) ? 2 : 1
                data.push({
                    hour: `${String(h).padStart(2, "0")}:00`,
                    count: Math.round(seededRandom(seed) * 25 * rush + 3),
                    stopId: stop.id,
                    day,
                })
            }
        }
    }
    return data
}

// --- 5. Alighting (exit) counts per stop, daily totals ---
export interface AlightingEntry {
    stopId: BusStopId
    stopName: string
    total: number
    day: number
}

function generateAlighting(): AlightingEntry[] {
    const data: AlightingEntry[] = []
    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 4000
        for (let day = 0; day < 30; day++) {
            const seed = stopSeed + day * 100
            data.push({
                stopId: stop.id,
                stopName: stop.name,
                total: Math.round(seededRandom(seed) * 300 + 80),
                day,
            })
        }
    }
    return data
}

// --- Exported cached datasets ---
export const hourlyFlowData = generateHourlyFlow()
export const occupancyData = generateOccupancy()
export const queueDensityData = generateQueueDensity()
export const boardingData = generateBoarding()
export const alightingData = generateAlighting()

// --- Filter helpers ---
export function filterByStops<T extends { stopId: BusStopId }>(
    data: T[],
    selectedStops: BusStopId[]
): T[] {
    if (selectedStops.length === 0 || selectedStops.length === BUS_STOPS.length)
        return data
    return data.filter((d) => selectedStops.includes(d.stopId))
}

export function filterByDay<T extends { day: number }>(
    data: T[],
    timeRange: TimeRange
): T[] {
    switch (timeRange) {
        case "today":
            return data.filter((d) => d.day === 0)
        case "yesterday":
            return data.filter((d) => d.day === 1)
        case "week":
            return data.filter((d) => d.day < 7)
        case "month":
            return data
    }
}

// For aggregating hourly data across multiple days
export function aggregateHourly<T extends { hour: string }>(
    data: T[],
    valueKey: keyof T,
    groupKeys?: (keyof T)[]
): Record<string, number>[] {
    const map = new Map<string, { sum: number; count: number; extra: Record<string, unknown> }>()
    for (const d of data) {
        const key = groupKeys ? `${d.hour}-${groupKeys.map((k) => d[k]).join("-")}` : d.hour
        const existing = map.get(key)
        if (existing) {
            existing.sum += Number(d[valueKey])
            existing.count++
        } else {
            const extra: Record<string, unknown> = { hour: d.hour }
            if (groupKeys) {
                for (const gk of groupKeys) {
                    extra[gk as string] = d[gk]
                }
            }
            map.set(key, { sum: Number(d[valueKey]), count: 1, extra })
        }
    }
    return Array.from(map.values()).map((v) => ({
        ...v.extra,
        [valueKey as string]: Math.round(v.sum / v.count),
    })) as Record<string, number>[]
}
