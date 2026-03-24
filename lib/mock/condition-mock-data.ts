// Mock data for Stop Condition analytics dashboard
// Trash/overflowing bins + glass fogging/icing — per 5 bus stops × 24h × 7 days

import { BUS_STOPS, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { BUS_STOPS, TIME_RANGES, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { filterByStops, filterByDay } from "./passenger-mock-data"

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

// --- Event types ---
export type ConditionType = "trash" | "fogging"

export const CONDITION_LABELS: Record<ConditionType, string> = {
    trash: "Мусор / Переполнение урн",
    fogging: "Запотевание / Обмерзание стёкол",
}

// --- Hourly condition readings (continuous sensor-like data) ---
export interface ConditionReading {
    hour: string
    trashLevel: number    // 0-100 (% fill)
    foggingLevel: number  // 0-100 (% coverage)
    stopId: BusStopId
    day: number
}

function generateConditionReadings(): ConditionReading[] {
    const data: ConditionReading[] = []

    for (const stop of BUS_STOPS) {
        const stopSeed = parseInt(stop.id.replace("stop-", "")) * 7000
        for (let day = 0; day < 30; day++) {
            let trashAccum = 5 + Math.round(seededRandom(stopSeed + day) * 15)
            for (let h = 0; h < 24; h++) {
                const seed = stopSeed + day * 100 + h
                // Trash accumulates during day, resets overnight (cleaning at 5-6am)
                if (h === 5 || h === 6) {
                    trashAccum = Math.max(5, Math.round(seededRandom(seed) * 15))
                } else if (h >= 7 && h <= 22) {
                    trashAccum = Math.min(100, trashAccum + Math.round(seededRandom(seed) * 12))
                }

                // Fogging: worse in cold morning hours and evening, low during day
                let foggingBase = 0
                if (h >= 0 && h <= 6) foggingBase = 40 + Math.round(seededRandom(seed + 2) * 40)
                else if (h >= 7 && h <= 9) foggingBase = 25 + Math.round(seededRandom(seed + 2) * 30)
                else if (h >= 10 && h <= 16) foggingBase = Math.round(seededRandom(seed + 2) * 20)
                else if (h >= 17 && h <= 20) foggingBase = 15 + Math.round(seededRandom(seed + 2) * 25)
                else foggingBase = 30 + Math.round(seededRandom(seed + 2) * 35)

                data.push({
                    hour: `${String(h).padStart(2, "0")}:00`,
                    trashLevel: trashAccum,
                    foggingLevel: foggingBase,
                    stopId: stop.id,
                    day,
                })
            }
        }
    }
    return data
}

// --- Alert events (threshold crossings) ---
export interface ConditionAlert {
    id: string
    type: ConditionType
    stopId: BusStopId
    stopName: string
    day: number
    hour: string
    level: number
    severity: "warning" | "critical"
}

const TRASH_WARNING = 70
const TRASH_CRITICAL = 90
const FOGGING_WARNING = 50
const FOGGING_CRITICAL = 75

function generateAlerts(): ConditionAlert[] {
    const data: ConditionAlert[] = []
    let counter = 0

    for (const reading of conditionReadingsData) {
        const stop = BUS_STOPS.find((s) => s.id === reading.stopId)!

        if (reading.trashLevel >= TRASH_WARNING) {
            counter++
            data.push({
                id: `CND-${String(counter).padStart(4, "0")}`,
                type: "trash",
                stopId: reading.stopId,
                stopName: stop.name,
                day: reading.day,
                hour: reading.hour,
                level: reading.trashLevel,
                severity: reading.trashLevel >= TRASH_CRITICAL ? "critical" : "warning",
            })
        }

        if (reading.foggingLevel >= FOGGING_WARNING) {
            counter++
            data.push({
                id: `CND-${String(counter).padStart(4, "0")}`,
                type: "fogging",
                stopId: reading.stopId,
                stopName: stop.name,
                day: reading.day,
                hour: reading.hour,
                level: reading.foggingLevel,
                severity: reading.foggingLevel >= FOGGING_CRITICAL ? "critical" : "warning",
            })
        }
    }
    return data
}

// --- Exported datasets ---
export const conditionReadingsData = generateConditionReadings()
export const conditionAlertsData = generateAlerts()

// --- Derived: per-stop average levels ---
export interface StopConditionAvg {
    stopId: BusStopId
    stopName: string
    avgTrash: number
    avgFogging: number
    maxTrash: number
    maxFogging: number
}

export function getPerStopAverage(readings: ConditionReading[]): StopConditionAvg[] {
    const map = new Map<BusStopId, { trashSum: number; fogSum: number; maxT: number; maxF: number; count: number }>()

    for (const stop of BUS_STOPS) {
        map.set(stop.id, { trashSum: 0, fogSum: 0, maxT: 0, maxF: 0, count: 0 })
    }

    for (const r of readings) {
        const row = map.get(r.stopId)!
        row.trashSum += r.trashLevel
        row.fogSum += r.foggingLevel
        row.maxT = Math.max(row.maxT, r.trashLevel)
        row.maxF = Math.max(row.maxF, r.foggingLevel)
        row.count++
    }

    return BUS_STOPS.map((stop) => {
        const row = map.get(stop.id)!
        return {
            stopId: stop.id,
            stopName: stop.name.split("/")[0].trim(),
            avgTrash: Math.round(row.trashSum / row.count),
            avgFogging: Math.round(row.fogSum / row.count),
            maxTrash: row.maxT,
            maxFogging: row.maxF,
        }
    })
}

export { TRASH_WARNING, TRASH_CRITICAL, FOGGING_WARNING, FOGGING_CRITICAL }
