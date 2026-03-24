// Mock data for Security Events dashboard
// Abandoned objects, fallen/lying person, fights — per 5 bus stops × 24h × 7 days

import { BUS_STOPS, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { BUS_STOPS, TIME_RANGES, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { filterByStops, filterByDay } from "./passenger-mock-data"

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

// --- Event types ---
export type SecurityEventType = "abandoned" | "fallen" | "fight"

export const EVENT_TYPE_LABELS: Record<SecurityEventType, string> = {
    abandoned: "Оставленные предметы",
    fallen: "Лежачий человек",
    fight: "Драка / Агрессия",
}

export const EVENT_SUBTYPES: Record<SecurityEventType, string[]> = {
    abandoned: ["Оставленный предмет"],
    fallen: ["Лежащий человек"],
    fight: ["Драка"],
}

// --- 1. Events by hour (all types) ---
export interface SecurityEventEntry {
    hour: string
    type: SecurityEventType
    subtype: string
    count: number
    stopId: BusStopId
    day: number
}

function generateSecurityEvents(): SecurityEventEntry[] {
    const data: SecurityEventEntry[] = []
    const types: SecurityEventType[] = ["abandoned", "fallen", "fight"]

    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 5000
        for (let day = 0; day < 30; day++) {
            for (let h = 0; h < 24; h++) {
                for (const type of types) {
                    const subtypes = EVENT_SUBTYPES[type]
                    const seed = stopSeed + day * 100 + h + types.indexOf(type) * 10000
                    // Probability of generating 1 event this hour at this stop
                    // Tuned for weekly totals: ~35 abandoned, ~10 fallen, ~8 fights
                    let prob = 0
                    if (type === "abandoned") prob = (h >= 7 && h <= 19) ? 0.06 : 0.01
                    if (type === "fallen") prob = (h >= 6 && h <= 22) ? 0.015 : 0.01
                    if (type === "fight") prob = (h >= 20 || h <= 4) ? 0.03 : 0.002

                    const count = seededRandom(seed) < prob ? 1 : 0
                    if (count > 0) {
                        const subtype = subtypes[Math.floor(seededRandom(seed + 7) * subtypes.length)]
                        data.push({ hour: `${String(h).padStart(2, "0")}:00`, type, subtype, count, stopId: stop.id, day })
                    }
                }
            }
        }
    }
    return data
}

// --- 2. Severity / response time per event ---
export interface IncidentDetail {
    id: string
    type: SecurityEventType
    subtype: string
    stopId: BusStopId
    stopName: string
    day: number
    hour: string
    responseMinutes: number
    resolved: boolean
}

function generateIncidentDetails(): IncidentDetail[] {
    const data: IncidentDetail[] = []
    let counter = 0
    const events = securityEventsData // use pre-generated

    for (const evt of events) {
        for (let i = 0; i < evt.count; i++) {
            counter++
            const seed = counter * 1337
            const stop = BUS_STOPS.find(s => s.id === evt.stopId)!
            data.push({
                id: `SEC-${String(counter).padStart(4, "0")}`,
                type: evt.type,
                subtype: evt.subtype,
                stopId: evt.stopId,
                stopName: stop.name,
                day: evt.day,
                hour: evt.hour,
                responseMinutes: Math.round(seededRandom(seed) * 45 + 2),
                resolved: seededRandom(seed + 1) > 0.15,
            })
        }
    }
    return data
}

// --- Exported cached datasets ---
export const securityEventsData = generateSecurityEvents()
export const incidentDetailsData = generateIncidentDetails()

// --- Derived: daily totals per type ---
export interface DailyTypeSummary {
    day: number
    dayLabel: string
    abandoned: number
    fallen: number
    fight: number
}

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export function getDailyTypeSummary(
    events: SecurityEventEntry[],
): DailyTypeSummary[] {
    const map = new Map<number, { abandoned: number; fallen: number; fight: number }>()
    const maxDay = events.length > 0 ? Math.max(...events.map(e => e.day)) : 6
    for (let d = 0; d <= maxDay; d++) map.set(d, { abandoned: 0, fallen: 0, fight: 0 })

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

// --- Derived: subtype breakdown ---
export interface SubtypeBreakdown {
    subtype: string
    count: number
    type: SecurityEventType
}

export function getSubtypeBreakdown(events: SecurityEventEntry[]): SubtypeBreakdown[] {
    const map = new Map<string, { count: number; type: SecurityEventType }>()
    for (const evt of events) {
        const key = `${evt.type}-${evt.subtype}`
        const existing = map.get(key)
        if (existing) {
            existing.count += evt.count
        } else {
            map.set(key, { count: evt.count, type: evt.type })
        }
    }
    return Array.from(map.entries())
        .map(([key, v]) => ({
            subtype: key.split("-").slice(1).join("-"),
            count: v.count,
            type: v.type,
        }))
        .sort((a, b) => b.count - a.count)
}
