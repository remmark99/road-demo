// Mock data for Warm Stop Operation analytics
// Door open/closed, door open too long, animals — per 5 bus stops × 24h × 7 days

import { BUS_STOPS, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { BUS_STOPS, TIME_RANGES, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { filterByStops, filterByDay } from "./passenger-mock-data"

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

// --- Event types ---
export type WarmStopEventType = "door_open" | "door_long" | "animal"

export const WARM_STOP_LABELS: Record<WarmStopEventType, string> = {
    door_open: "Открытие двери",
    door_long: "Дверь открыта слишком долго",
    animal: "Животное на остановке",
}

// --- Hourly door status (% time open) ---
export interface DoorStatusReading {
    hour: string
    openPct: number     // % time door was open this hour
    openCount: number   // number of openings
    longOpenCount: number // openings > 2 min
    stopId: BusStopId
    day: number
}

function generateDoorStatus(): DoorStatusReading[] {
    const data: DoorStatusReading[] = []

    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 8000
        for (let day = 0; day < 7; day++) {
            for (let h = 0; h < 24; h++) {
                const seed = stopSeed + day * 100 + h
                // More openings during passenger hours
                const isRush = (h >= 7 && h <= 9) || (h >= 17 && h <= 19)
                const isDay = h >= 6 && h <= 22
                const baseOpenings = isRush ? 12 + Math.round(seededRandom(seed) * 10)
                    : isDay ? 4 + Math.round(seededRandom(seed) * 8)
                        : Math.round(seededRandom(seed) * 3)
                const openPct = Math.min(100, Math.round(baseOpenings * (2 + seededRandom(seed + 1) * 3)))
                const longOpen = Math.round(seededRandom(seed + 2) * baseOpenings * 0.15)

                data.push({
                    hour: `${String(h).padStart(2, "0")}:00`,
                    openPct,
                    openCount: baseOpenings,
                    longOpenCount: longOpen,
                    stopId: stop.id,
                    day,
                })
            }
        }
    }
    return data
}

// --- Animal sighting events ---
export interface AnimalEvent {
    hour: string
    count: number
    stopId: BusStopId
    day: number
    animalType: string
}

function generateAnimalEvents(): AnimalEvent[] {
    const data: AnimalEvent[] = []
    const animalTypes = ["Собака", "Кошка"]

    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 9000
        for (let day = 0; day < 7; day++) {
            for (let h = 0; h < 24; h++) {
                const seed = stopSeed + day * 100 + h
                // Animals more common at night and early morning
                const prob = (h >= 22 || h <= 6) ? 0.04 : (h >= 7 && h <= 20) ? 0.015 : 0.02
                if (seededRandom(seed) < prob) {
                    const animalType = animalTypes[Math.floor(seededRandom(seed + 5) * animalTypes.length)]
                    data.push({
                        hour: `${String(h).padStart(2, "0")}:00`,
                        count: 1,
                        stopId: stop.id,
                        day,
                        animalType,
                    })
                }
            }
        }
    }
    return data
}

// --- Combined incident log ---
export interface WarmStopIncident {
    id: string
    type: WarmStopEventType
    stopId: BusStopId
    stopName: string
    day: number
    hour: string
    detail: string
    durationMin?: number
}

function generateIncidents(): WarmStopIncident[] {
    const data: WarmStopIncident[] = []
    let counter = 0

    // Long door events
    for (const reading of doorStatusData) {
        if (reading.longOpenCount > 0) {
            for (let i = 0; i < reading.longOpenCount; i++) {
                counter++
                const seed = counter * 3337
                const stop = BUS_STOPS.find((s) => s.id === reading.stopId)!
                data.push({
                    id: `WRM-${String(counter).padStart(4, "0")}`,
                    type: "door_long",
                    stopId: reading.stopId,
                    stopName: stop.name,
                    day: reading.day,
                    hour: reading.hour,
                    detail: "Дверь открыта дольше 2 мин",
                    durationMin: 2 + Math.round(seededRandom(seed) * 8),
                })
            }
        }
    }

    // Animal events
    for (const evt of animalEventsData) {
        counter++
        const stop = BUS_STOPS.find((s) => s.id === evt.stopId)!
        data.push({
            id: `WRM-${String(counter).padStart(4, "0")}`,
            type: "animal",
            stopId: evt.stopId,
            stopName: stop.name,
            day: evt.day,
            hour: evt.hour,
            detail: evt.animalType,
        })
    }

    return data
}

// --- Exported datasets ---
export const doorStatusData = generateDoorStatus()
export const animalEventsData = generateAnimalEvents()
export const warmStopIncidentsData = generateIncidents()

// --- Derived: per-stop summary ---
export interface StopDoorSummary {
    stopId: BusStopId
    stopName: string
    avgOpenPct: number
    totalOpenings: number
    totalLongOpen: number
    totalAnimals: number
}

export function getPerStopDoorSummary(
    readings: DoorStatusReading[],
    animals: AnimalEvent[]
): StopDoorSummary[] {
    const map = new Map<BusStopId, { openPctSum: number; openings: number; longOpen: number; count: number }>()
    for (const stop of BUS_STOPS) {
        map.set(stop.id, { openPctSum: 0, openings: 0, longOpen: 0, count: 0 })
    }
    for (const r of readings) {
        const row = map.get(r.stopId)!
        row.openPctSum += r.openPct
        row.openings += r.openCount
        row.longOpen += r.longOpenCount
        row.count++
    }

    const animalMap = new Map<BusStopId, number>()
    for (const a of animals) {
        animalMap.set(a.stopId, (animalMap.get(a.stopId) || 0) + a.count)
    }

    return BUS_STOPS.map((stop) => {
        const row = map.get(stop.id)!
        return {
            stopId: stop.id,
            stopName: stop.name.split("/")[0].trim(),
            avgOpenPct: row.count > 0 ? Math.round(row.openPctSum / row.count) : 0,
            totalOpenings: row.openings,
            totalLongOpen: row.longOpen,
            totalAnimals: animalMap.get(stop.id) || 0,
        }
    })
}

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export interface DailyDoorSummary {
    day: number
    dayLabel: string
    openings: number
    longOpen: number
    animals: number
}

export function getDailyDoorSummary(
    readings: DoorStatusReading[],
    animals: AnimalEvent[]
): DailyDoorSummary[] {
    const map = new Map<number, { openings: number; longOpen: number; animals: number }>()
    for (let d = 0; d < 7; d++) map.set(d, { openings: 0, longOpen: 0, animals: 0 })

    for (const r of readings) {
        const row = map.get(r.day)!
        row.openings += r.openCount
        row.longOpen += r.longOpenCount
    }
    for (const a of animals) {
        const row = map.get(a.day)!
        row.animals += a.count
    }

    return Array.from(map.entries()).map(([day, counts]) => ({
        day,
        dayLabel: DAY_LABELS[day],
        ...counts,
    }))
}
