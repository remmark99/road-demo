// Mock data for Stop Condition analytics dashboard
// Trash/overflowing bins + glass fogging/icing — per 5 bus stops × 24h × 7 days

import { BUS_STOPS, type BusStopId } from "./passenger-mock-data"
export { BUS_STOPS, TIME_RANGES, type BusStopId, type TimeRange } from "./passenger-mock-data"
export { filterByStops, filterByDay } from "./passenger-mock-data"

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

// --- Event types ---
export type ConditionType = "trash" | "fogging"
export type ConditionSeverity = "healthy" | "attention" | "critical"

export const CONDITION_LABELS: Record<ConditionType, string> = {
    trash: "Мусор / Переполнение урн",
    fogging: "Запотевание / Обмерзание стёкол",
}

export const CONDITION_SHORT_LABELS: Record<ConditionType, string> = {
    trash: "Урны",
    fogging: "Стекло",
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

export interface StopConditionPriority extends StopConditionAvg {
    healthScore: number
    riskScore: number
    status: ConditionSeverity
    warningAlerts: number
    criticalAlerts: number
    trashAlerts: number
    foggingAlerts: number
    dominantIssue: ConditionType
    dominantIssueLabel: string
    peakHour: string | null
}

export interface HourlyConditionHealth {
    hour: string
    avgTrash: number
    avgFogging: number
    healthScore: number
    riskScore: number
    alertCount: number
    criticalCount: number
    trashAlertCount: number
    foggingAlertCount: number
}

export interface ConditionIssueMixItem {
    type: ConditionType
    label: string
    shortLabel: string
    total: number
    warningCount: number
    criticalCount: number
    share: number
}

export interface ConditionNetworkOverview {
    networkHealth: number
    monitoredStops: number
    healthyStops: number
    attentionStops: number
    criticalStops: number
    atRiskStops: number
    warningAlerts: number
    criticalAlerts: number
    dominantIssue: ConditionType | null
    dominantIssueLabel: string
    worstHour: string | null
    lowestHealthScore: number | null
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function roundOrZero(sum: number, count: number) {
    return count > 0 ? Math.round(sum / count) : 0
}

function calculateConditionHealth(params: {
    avgTrash: number
    avgFogging: number
    maxTrash: number
    maxFogging: number
    warningAlerts: number
    criticalAlerts: number
    sampleCount: number
}) {
    const sampleCount = Math.max(params.sampleCount, 1)
    const warningRate = params.warningAlerts / sampleCount
    const criticalRate = params.criticalAlerts / sampleCount

    const basePressure = params.avgTrash * 0.32 + params.avgFogging * 0.28
    const peakPressure =
        Math.max(0, params.maxTrash - TRASH_WARNING) * 0.18 +
        Math.max(0, params.maxFogging - FOGGING_WARNING) * 0.2
    const alertPressure = warningRate * 18 + criticalRate * 40

    const riskScore = clamp(
        Math.round(basePressure + peakPressure + alertPressure),
        0,
        100
    )

    return {
        riskScore,
        healthScore: 100 - riskScore,
        criticalRate,
    }
}

function resolveConditionSeverity(healthScore: number, criticalRate: number): ConditionSeverity {
    if (healthScore >= 72 && criticalRate < 0.03) return "healthy"
    if (healthScore >= 52 && criticalRate < 0.08) return "attention"
    return "critical"
}

function getDominantIssue(params: {
    avgTrash: number
    avgFogging: number
    maxTrash: number
    maxFogging: number
    trashAlerts: number
    trashCriticals: number
    foggingAlerts: number
    foggingCriticals: number
    sampleCount: number
}): ConditionType {
    const sampleCount = Math.max(params.sampleCount, 1)
    const trashPressure =
        params.avgTrash +
        Math.max(0, params.maxTrash - TRASH_WARNING) * 0.9 +
        (params.trashAlerts / sampleCount) * 20 +
        (params.trashCriticals / sampleCount) * 45
    const foggingPressure =
        params.avgFogging +
        Math.max(0, params.maxFogging - FOGGING_WARNING) * 0.9 +
        (params.foggingAlerts / sampleCount) * 20 +
        (params.foggingCriticals / sampleCount) * 45

    return trashPressure >= foggingPressure ? "trash" : "fogging"
}

export function getConditionHourlyHealth(
    readings: ConditionReading[],
    alerts: ConditionAlert[]
): HourlyConditionHealth[] {
    const hourlyReadings = new Map<
        string,
        { trashSum: number; fogSum: number; maxTrash: number; maxFog: number; count: number }
    >()
    const hourlyAlerts = new Map<
        string,
        { total: number; critical: number; trash: number; fogging: number }
    >()

    for (let hour = 0; hour < 24; hour++) {
        hourlyReadings.set(`${String(hour).padStart(2, "0")}:00`, {
            trashSum: 0,
            fogSum: 0,
            maxTrash: 0,
            maxFog: 0,
            count: 0,
        })
    }

    for (const reading of readings) {
        const row = hourlyReadings.get(reading.hour)!
        row.trashSum += reading.trashLevel
        row.fogSum += reading.foggingLevel
        row.maxTrash = Math.max(row.maxTrash, reading.trashLevel)
        row.maxFog = Math.max(row.maxFog, reading.foggingLevel)
        row.count++
    }

    for (const alert of alerts) {
        const row = hourlyAlerts.get(alert.hour) ?? { total: 0, critical: 0, trash: 0, fogging: 0 }
        row.total++
        if (alert.severity === "critical") row.critical++
        if (alert.type === "trash") row.trash++
        if (alert.type === "fogging") row.fogging++
        hourlyAlerts.set(alert.hour, row)
    }

    return Array.from(hourlyReadings.entries())
        .map(([hour, readingRow]) => {
            const alertRow = hourlyAlerts.get(hour) ?? { total: 0, critical: 0, trash: 0, fogging: 0 }
            const avgTrash = roundOrZero(readingRow.trashSum, readingRow.count)
            const avgFogging = roundOrZero(readingRow.fogSum, readingRow.count)
            const { healthScore, riskScore } = calculateConditionHealth({
                avgTrash,
                avgFogging,
                maxTrash: readingRow.maxTrash,
                maxFogging: readingRow.maxFog,
                warningAlerts: Math.max(0, alertRow.total - alertRow.critical),
                criticalAlerts: alertRow.critical,
                sampleCount: readingRow.count,
            })

            return {
                hour,
                avgTrash,
                avgFogging,
                healthScore,
                riskScore,
                alertCount: alertRow.total,
                criticalCount: alertRow.critical,
                trashAlertCount: alertRow.trash,
                foggingAlertCount: alertRow.fogging,
            }
        })
        .sort((a, b) => a.hour.localeCompare(b.hour))
}

export function getConditionIssueMix(alerts: ConditionAlert[]): ConditionIssueMixItem[] {
    const totalAlerts = alerts.length

    return (Object.keys(CONDITION_LABELS) as ConditionType[])
        .map((type) => {
            const typeAlerts = alerts.filter((alert) => alert.type === type)
            const criticalCount = typeAlerts.filter((alert) => alert.severity === "critical").length
            const warningCount = typeAlerts.length - criticalCount

            return {
                type,
                label: CONDITION_LABELS[type],
                shortLabel: CONDITION_SHORT_LABELS[type],
                total: typeAlerts.length,
                warningCount,
                criticalCount,
                share: totalAlerts > 0 ? Math.round((typeAlerts.length / totalAlerts) * 100) : 0,
            }
        })
        .sort((a, b) => b.total - a.total)
}

export function getConditionPriorityStops(
    readings: ConditionReading[],
    alerts: ConditionAlert[]
): StopConditionPriority[] {
    const activeStopIds = new Set<BusStopId>()

    for (const reading of readings) activeStopIds.add(reading.stopId)
    for (const alert of alerts) activeStopIds.add(alert.stopId)

    if (activeStopIds.size === 0) return []

    return BUS_STOPS.filter((stop) => activeStopIds.has(stop.id))
        .map((stop) => {
            const stopReadings = readings.filter((reading) => reading.stopId === stop.id)
            const stopAlerts = alerts.filter((alert) => alert.stopId === stop.id)
            const sampleCount = Math.max(stopReadings.length, 1)

            const avgTrash = roundOrZero(
                stopReadings.reduce((sum, reading) => sum + reading.trashLevel, 0),
                stopReadings.length
            )
            const avgFogging = roundOrZero(
                stopReadings.reduce((sum, reading) => sum + reading.foggingLevel, 0),
                stopReadings.length
            )
            const maxTrash = stopReadings.reduce(
                (maxValue, reading) => Math.max(maxValue, reading.trashLevel),
                0
            )
            const maxFogging = stopReadings.reduce(
                (maxValue, reading) => Math.max(maxValue, reading.foggingLevel),
                0
            )

            const criticalAlerts = stopAlerts.filter((alert) => alert.severity === "critical").length
            const warningAlerts = stopAlerts.length - criticalAlerts
            const trashAlerts = stopAlerts.filter((alert) => alert.type === "trash").length
            const foggingAlerts = stopAlerts.filter((alert) => alert.type === "fogging").length
            const trashCriticals = stopAlerts.filter(
                (alert) => alert.type === "trash" && alert.severity === "critical"
            ).length
            const foggingCriticals = stopAlerts.filter(
                (alert) => alert.type === "fogging" && alert.severity === "critical"
            ).length

            const { healthScore, riskScore, criticalRate } = calculateConditionHealth({
                avgTrash,
                avgFogging,
                maxTrash,
                maxFogging,
                warningAlerts,
                criticalAlerts,
                sampleCount,
            })

            const dominantIssue = getDominantIssue({
                avgTrash,
                avgFogging,
                maxTrash,
                maxFogging,
                trashAlerts,
                trashCriticals,
                foggingAlerts,
                foggingCriticals,
                sampleCount,
            })

            const peakHour =
                getConditionHourlyHealth(stopReadings, stopAlerts)
                    .sort(
                        (a, b) =>
                            a.healthScore - b.healthScore ||
                            b.criticalCount - a.criticalCount ||
                            b.alertCount - a.alertCount
                    )[0]?.hour ?? null

            return {
                stopId: stop.id,
                stopName: stop.name.split("/")[0].trim(),
                avgTrash,
                avgFogging,
                maxTrash,
                maxFogging,
                healthScore,
                riskScore,
                status: resolveConditionSeverity(healthScore, criticalRate),
                warningAlerts,
                criticalAlerts,
                trashAlerts,
                foggingAlerts,
                dominantIssue,
                dominantIssueLabel: CONDITION_LABELS[dominantIssue],
                peakHour,
            }
        })
        .sort(
            (a, b) =>
                a.healthScore - b.healthScore ||
                b.criticalAlerts - a.criticalAlerts ||
                b.warningAlerts - a.warningAlerts
        )
}

export function getConditionOverview(
    readings: ConditionReading[],
    alerts: ConditionAlert[]
): ConditionNetworkOverview {
    const priorityStops = getConditionPriorityStops(readings, alerts)
    const hourlyHealth = getConditionHourlyHealth(readings, alerts)
    const issueMix = getConditionIssueMix(alerts)

    if (priorityStops.length === 0) {
        return {
            networkHealth: 0,
            monitoredStops: 0,
            healthyStops: 0,
            attentionStops: 0,
            criticalStops: 0,
            atRiskStops: 0,
            warningAlerts: 0,
            criticalAlerts: 0,
            dominantIssue: null,
            dominantIssueLabel: "Нет данных",
            worstHour: null,
            lowestHealthScore: null,
        }
    }

    const healthyStops = priorityStops.filter((stop) => stop.status === "healthy").length
    const attentionStops = priorityStops.filter((stop) => stop.status === "attention").length
    const criticalStops = priorityStops.filter((stop) => stop.status === "critical").length
    const warningAlerts = alerts.filter((alert) => alert.severity === "warning").length
    const criticalAlerts = alerts.length - warningAlerts
    const worstHourEntry =
        hourlyHealth.sort(
            (a, b) =>
                a.healthScore - b.healthScore ||
                b.criticalCount - a.criticalCount ||
                b.alertCount - a.alertCount
        )[0] ?? null

    const dominantIssue = issueMix[0]?.total ? issueMix[0].type : null

    return {
        networkHealth: Math.round(
            priorityStops.reduce((sum, stop) => sum + stop.healthScore, 0) / priorityStops.length
        ),
        monitoredStops: priorityStops.length,
        healthyStops,
        attentionStops,
        criticalStops,
        atRiskStops: attentionStops + criticalStops,
        warningAlerts,
        criticalAlerts,
        dominantIssue,
        dominantIssueLabel: dominantIssue ? CONDITION_LABELS[dominantIssue] : "Стабильная картина",
        worstHour: worstHourEntry?.hour ?? null,
        lowestHealthScore: worstHourEntry?.healthScore ?? null,
    }
}

export { TRASH_WARNING, TRASH_CRITICAL, FOGGING_WARNING, FOGGING_CRITICAL }
