// Mock data for Vandalism analytics dashboard
// Glass breaking, structural hits, graffiti, illegal postings — per 5 bus stops × 24h × 7 days

import { BUS_STOPS, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { BUS_STOPS, TIME_RANGES, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { filterByStops, filterByDay } from "./passenger-mock-data"

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

// --- Event types ---
export type VandalismType = "glass" | "structural" | "graffiti" | "postings"

export const VANDALISM_LABELS: Record<VandalismType, string> = {
    glass: "Разбитие стекла",
    structural: "Удары по конструкции",
    graffiti: "Граффити",
    postings: "Расклейка объявлений",
}

// --- Events by hour ---
export interface VandalismEventEntry {
    hour: string
    type: VandalismType
    count: number
    stopId: BusStopId
    day: number
}

function generateVandalismEvents(): VandalismEventEntry[] {
    const data: VandalismEventEntry[] = []
    const types: VandalismType[] = ["glass", "structural", "graffiti", "postings"]

    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 6000
        for (let day = 0; day < 30; day++) {
            for (let h = 0; h < 24; h++) {
                for (const type of types) {
                    const seed = stopSeed + day * 100 + h + types.indexOf(type) * 10000
                    // Glass/structural: more at night, graffiti: evening, postings: early morning
                    let prob = 0
                    if (type === "glass") prob = (h >= 22 || h <= 5) ? 0.02 : 0.003
                    if (type === "structural") prob = (h >= 20 || h <= 4) ? 0.015 : 0.002
                    if (type === "graffiti") prob = (h >= 18 && h <= 23) ? 0.025 : 0.005
                    if (type === "postings") prob = (h >= 5 && h <= 8) ? 0.04 : 0.008

                    const count = seededRandom(seed) < prob ? 1 : 0
                    if (count > 0) {
                        data.push({
                            hour: `${String(h).padStart(2, "0")}:00`,
                            type,
                            count,
                            stopId: stop.id,
                            day,
                        })
                    }
                }
            }
        }
    }
    return data
}

// --- Incident details ---
export interface VandalismIncident {
    id: string
    type: VandalismType
    stopId: BusStopId
    stopName: string
    day: number
    hour: string
    damageLevel: "minor" | "moderate" | "severe"
    resolved: boolean
}

function generateIncidents(): VandalismIncident[] {
    const data: VandalismIncident[] = []
    let counter = 0

    for (const evt of vandalismEventsData) {
        counter++
        const seed = counter * 2137
        const stop = BUS_STOPS.find((s) => s.id === evt.stopId)!
        const roll = seededRandom(seed)
        data.push({
            id: `VND-${String(counter).padStart(4, "0")}`,
            type: evt.type,
            stopId: evt.stopId,
            stopName: stop.name,
            day: evt.day,
            hour: evt.hour,
            damageLevel: roll < 0.5 ? "minor" : roll < 0.85 ? "moderate" : "severe",
            resolved: seededRandom(seed + 1) > 0.3,
        })
    }
    return data
}

// --- Exported datasets ---
export const vandalismEventsData = generateVandalismEvents()
export const vandalismIncidentsData = generateIncidents()

// --- Derived: daily totals per type ---
const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export interface DailyVandalismSummary {
    day: number
    dayLabel: string
    glass: number
    structural: number
    graffiti: number
    postings: number
}

export function getDailyVandalismSummary(events: VandalismEventEntry[]): DailyVandalismSummary[] {
    const map = new Map<number, { glass: number; structural: number; graffiti: number; postings: number }>()
    const maxDay = events.length > 0 ? Math.max(...events.map(e => e.day)) : 6
    for (let d = 0; d <= maxDay; d++) map.set(d, { glass: 0, structural: 0, graffiti: 0, postings: 0 })

    for (const evt of events) {
        const row = map.get(evt.day)!
        row[evt.type] += evt.count
    }

    return Array.from(map.entries()).map(([day, counts]) => ({
        day,
        dayLabel: maxDay > 6 ? `${day + 1}` : DAY_LABELS[day % 7],
        ...counts,
    }))
}

// --- Derived: per-stop totals ---
export interface StopVandalismTotal {
    stopId: BusStopId
    stopName: string
    total: number
    glass: number
    structural: number
    graffiti: number
    postings: number
}

export function getPerStopTotals(events: VandalismEventEntry[]): StopVandalismTotal[] {
    const map = new Map<BusStopId, StopVandalismTotal>()
    for (const stop of BUS_STOPS) {
        map.set(stop.id, {
            stopId: stop.id,
            stopName: stop.name.split("/")[0].trim(),
            total: 0,
            glass: 0,
            structural: 0,
            graffiti: 0,
            postings: 0,
        })
    }

    for (const evt of events) {
        const row = map.get(evt.stopId)
        if (row) {
            row[evt.type] += evt.count
            row.total += evt.count
        }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total)
}
