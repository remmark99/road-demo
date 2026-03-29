import {
    RATING_ATTENTION,
    RATING_CURVE_DIVISOR,
    RATING_MAX,
    RATING_TARGET,
    formatRating,
    getRating,
    getRatingBandLabel,
    getRatingTone,
    roundRating,
    type RatingTone,
} from "@/lib/analytics/rating"

export type TimeRange = "today" | "yesterday" | "week" | "month"

export const TIME_RANGES: { value: TimeRange; label: string }[] = [
    { value: "today", label: "Сегодня" },
    { value: "yesterday", label: "Вчера" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
]

export const PARKS = [
    { id: "park-1", name: "Парк 1" },
    { id: "park-2", name: "Парк 2" },
] as const

export type ParkId = (typeof PARKS)[number]["id"]

const PARK_ZONES: Record<ParkId, string[]> = {
    "park-1": ["Центральная аллея", "Детская площадка", "Главный вход", "Зона отдыха"],
    "park-2": ["Озерная дорожка", "Спортивная зона", "Центральная площадь", "Северный вход"],
}

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

function localDateStr(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function getDateString(daysAgo: number) {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    return localDateStr(date)
}

export type ParkSecurityType = "left_item" | "person_down" | "fight" | "fire"

export const PARK_SECURITY_LABELS: Record<ParkSecurityType, string> = {
    left_item: "Оставленный предмет",
    person_down: "Лежачий человек",
    fight: "Драка",
    fire: "Возгорание",
}

export interface ParkSecurityDailyEntry {
    id: string
    date: string
    locationId: ParkId
    left_item: number
    person_down: number
    fight: number
    fire: number
}

export interface ParkSecurityIncident {
    id: string
    date: string
    locationId: ParkId
    zone: string
    type: ParkSecurityType
    responseMinutes: number
    resolved: boolean
    severity: "medium" | "high" | "critical"
}

function generateParkSecurityDailyData(): ParkSecurityDailyEntry[] {
    const data: ParkSecurityDailyEntry[] = []

    for (let i = 0; i < 30; i++) {
        const date = getDateString(i)
        const dayOfWeek = new Date(date).getDay()
        const weekendBoost = dayOfWeek === 0 || dayOfWeek === 6 ? 1.25 : 1

        for (const park of PARKS) {
            const parkSeed = parseInt(park.id.replace("park-", "")) * 1000
            const seed = parkSeed + i * 100
            const leftItemBase = Math.round(seededRandom(seed + 1) * 2)
            const fightBase = seededRandom(seed + 2) > (weekendBoost > 1 ? 0.72 : 0.86) ? 1 : 0
            const fireBase = seededRandom(seed + 3) > 0.93 ? 1 : 0
            const personDownBase = seededRandom(seed + 4) > 0.8 ? 1 : 0

            data.push({
                id: `park-sec-${park.id}-${date}`,
                date,
                locationId: park.id,
                left_item: Math.min(4, Math.round(leftItemBase * weekendBoost)),
                person_down: personDownBase,
                fight: fightBase,
                fire: fireBase,
            })
        }
    }

    return data
}

function buildSeverity(type: ParkSecurityType): ParkSecurityIncident["severity"] {
    if (type === "fire") return "critical"
    if (type === "fight" || type === "person_down") return "high"
    return "medium"
}

function generateParkSecurityIncidents(
    daily: ParkSecurityDailyEntry[]
): ParkSecurityIncident[] {
    const incidents: ParkSecurityIncident[] = []
    let counter = 0

    for (const day of daily) {
        const entries: Array<[ParkSecurityType, number]> = [
            ["left_item", day.left_item],
            ["person_down", day.person_down],
            ["fight", day.fight],
            ["fire", day.fire],
        ]

        for (const [type, count] of entries) {
            for (let i = 0; i < count; i++) {
                counter++
                const seed = counter * 177 + i
                const zones = PARK_ZONES[day.locationId]
                incidents.push({
                    id: `park-incident-${counter}`,
                    date: day.date,
                    locationId: day.locationId,
                    zone: zones[Math.floor(seededRandom(seed) * zones.length)],
                    type,
                    responseMinutes:
                        type === "fire"
                            ? Math.round(seededRandom(seed + 1) * 5 + 3)
                            : Math.round(seededRandom(seed + 1) * 18 + 4),
                    resolved: seededRandom(seed + 2) > 0.18,
                    severity: buildSeverity(type),
                })
            }
        }
    }

    return incidents.sort((a, b) => b.date.localeCompare(a.date))
}

export type ParkOperationsType =
    | "trash_overflow"
    | "camera_obstruction"
    | "light_off"
    | "vehicle_detect"

export const PARK_OPERATIONS_LABELS: Record<ParkOperationsType, string> = {
    trash_overflow: "Переполненная урна",
    camera_obstruction: "Камера перекрыта",
    light_off: "Неработающее освещение",
    vehicle_detect: "Проезд автомобиля",
}

export interface ParkOperationsDailyEntry {
    id: string
    date: string
    locationId: ParkId
    trash_overflow: number
    camera_obstruction: number
    light_off: number
    vehicle_detect: number
}

export interface ParkOperationsIncident {
    id: string
    date: string
    locationId: ParkId
    zone: string
    type: ParkOperationsType
    resolved: boolean
    severity: "medium" | "high"
}

function generateParkOperationsDailyData(): ParkOperationsDailyEntry[] {
    const data: ParkOperationsDailyEntry[] = []

    for (let i = 0; i < 30; i++) {
        const date = getDateString(i)
        const dayOfWeek = new Date(date).getDay()
        const weekendBoost = dayOfWeek === 0 || dayOfWeek === 6 ? 1.3 : 1

        for (const park of PARKS) {
            const parkSeed = parseInt(park.id.replace("park-", "")) * 2000
            const seed = parkSeed + i * 100
            const trashOverflow = Math.min(
                5,
                Math.round((seededRandom(seed + 5) * 3 + 1) * weekendBoost)
            )

            data.push({
                id: `park-ops-${park.id}-${date}`,
                date,
                locationId: park.id,
                trash_overflow: trashOverflow,
                camera_obstruction: seededRandom(seed + 6) > 0.64 ? 1 : 0,
                light_off: seededRandom(seed + 7) > 0.68 ? 1 : 0,
                vehicle_detect: seededRandom(seed + 8) > 0.55 ? 1 : 0,
            })
        }
    }

    return data
}

function generateParkOperationsIncidents(
    daily: ParkOperationsDailyEntry[]
): ParkOperationsIncident[] {
    const incidents: ParkOperationsIncident[] = []
    let counter = 0

    for (const day of daily) {
        const entries: Array<[ParkOperationsType, number]> = [
            ["trash_overflow", day.trash_overflow],
            ["camera_obstruction", day.camera_obstruction],
            ["light_off", day.light_off],
            ["vehicle_detect", day.vehicle_detect],
        ]

        for (const [type, count] of entries) {
            for (let i = 0; i < count; i++) {
                counter++
                const seed = counter * 223 + i
                const zones = PARK_ZONES[day.locationId]
                incidents.push({
                    id: `park-ops-incident-${counter}`,
                    date: day.date,
                    locationId: day.locationId,
                    zone: zones[Math.floor(seededRandom(seed) * zones.length)],
                    type,
                    resolved: seededRandom(seed + 1) > 0.22,
                    severity:
                        type === "trash_overflow" || type === "vehicle_detect"
                            ? "medium"
                            : "high",
                })
            }
        }
    }

    return incidents.sort((a, b) => b.date.localeCompare(a.date))
}

export const parkSecurityDailyData = generateParkSecurityDailyData()
export const parkSecurityIncidentsData = generateParkSecurityIncidents(
    parkSecurityDailyData
)
export const parkOperationsDailyData = generateParkOperationsDailyData()
export const parkOperationsIncidentsData = generateParkOperationsIncidents(
    parkOperationsDailyData
)

export function filterByTimeRange<T extends { date: string }>(
    data: T[],
    range: TimeRange
): T[] {
    const now = new Date()
    const todayStr = localDateStr(now)

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayStr = localDateStr(yesterday)

    switch (range) {
        case "today":
            return data.filter(item => item.date === todayStr)
        case "yesterday":
            return data.filter(item => item.date === yesterdayStr)
        case "week": {
            const weekAgo = new Date(now)
            weekAgo.setDate(now.getDate() - 7)
            return data.filter(item => new Date(item.date) >= weekAgo)
        }
        case "month":
            return data
        default:
            return data
    }
}

export function filterByLocations<T extends { locationId: ParkId }>(
    data: T[],
    locations: ParkId[]
): T[] {
    return data.filter((item) => locations.includes(item.locationId))
}

export type ParkOperationalTone = RatingTone

export interface ParkSecurityDailyRiskPoint {
    date: string
    dateLabel: string
    incidentCount: number
    unresolvedCount: number
    criticalCount: number
    avgResponse: number
    riskScore: number
}

export interface ParkSecurityIssueMixItem {
    type: ParkSecurityType
    label: string
    totalCount: number
    unresolvedCount: number
    criticalCount: number
}

export interface ParkSecurityParkPriority {
    parkId: ParkId
    parkName: string
    safetyScore: number
    tone: ParkOperationalTone
    incidentCount: number
    unresolvedCount: number
    criticalOpenCount: number
    avgResponse: number
    dominantType: ParkSecurityType | null
    dominantTypeLabel: string
    hotspotZone: string | null
    hotspotCount: number
}

export interface ParkSecurityZoneHotspot {
    id: string
    parkId: ParkId
    parkName: string
    zone: string
    riskScore: number
    tone: ParkOperationalTone
    incidentCount: number
    unresolvedCount: number
    criticalCount: number
    avgResponse: number
    dominantType: ParkSecurityType | null
    dominantTypeLabel: string
}

export interface ParkSecurityOverview {
    monitoredParks: number
    safetyScore: number
    healthyParks: number
    attentionParks: number
    criticalParks: number
    atRiskParks: number
    unresolvedIncidents: number
    criticalOpenIncidents: number
    avgResponse: number
    dominantType: ParkSecurityType | null
    dominantTypeLabel: string
    worstParkName: string | null
    worstZoneLabel: string
    worstZoneParkName: string | null
    worstDateLabel: string | null
    lowestDailyScore: number | null
}

export interface ParkOperationsDailyReadinessPoint {
    date: string
    dateLabel: string
    issueCount: number
    unresolvedCount: number
    highCount: number
    readinessScore: number
}

export interface ParkOperationsIssueMixItem {
    type: ParkOperationsType
    label: string
    totalCount: number
    unresolvedCount: number
    highCount: number
}

export interface ParkOperationsParkPriority {
    parkId: ParkId
    parkName: string
    readinessScore: number
    tone: ParkOperationalTone
    issueCount: number
    unresolvedCount: number
    unresolvedHighCount: number
    serviceDebt: number
    dominantType: ParkOperationsType | null
    dominantTypeLabel: string
    hotspotZone: string | null
    hotspotCount: number
}

export interface ParkOperationsZoneHotspot {
    id: string
    parkId: ParkId
    parkName: string
    zone: string
    readinessScore: number
    tone: ParkOperationalTone
    issueCount: number
    unresolvedCount: number
    highCount: number
    dominantType: ParkOperationsType | null
    dominantTypeLabel: string
}

export interface ParkOperationsOverview {
    monitoredParks: number
    readinessScore: number
    healthyParks: number
    attentionParks: number
    criticalParks: number
    atRiskParks: number
    backlogIssues: number
    unresolvedHighPriority: number
    serviceDebt: number
    dominantType: ParkOperationsType | null
    dominantTypeLabel: string
    worstParkName: string | null
    worstZoneLabel: string
    worstZoneParkName: string | null
    worstDateLabel: string | null
    lowestDailyScore: number | null
}

const SECURITY_IMPACT: Record<ParkSecurityType, number> = {
    left_item: 1,
    person_down: 3,
    fight: 4,
    fire: 6,
}

const OPERATIONS_IMPACT: Record<ParkOperationsType, number> = {
    trash_overflow: 2,
    camera_obstruction: 4,
    light_off: 4,
    vehicle_detect: 3,
}

export const PARK_RATING_MAX = RATING_MAX
export const PARK_RATING_TARGET = RATING_TARGET
export const PARK_RATING_ATTENTION = RATING_ATTENTION
export const PARK_RATING_CURVE_DIVISOR = RATING_CURVE_DIVISOR
export const formatParkRating = formatRating
export const getParkRating = getRating
export const getParkRatingBandLabel = getRatingBandLabel
export const getParkTone = getRatingTone

function roundInt(value: number) {
    return Math.round(value)
}

function ensureArray<T>(value: T[] | null | undefined): T[] {
    return Array.isArray(value) ? value : []
}

function average(values: number[]) {
    if (values.length === 0) return 0
    return roundInt(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function getDateLabel(date: string) {
    return new Date(date).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "short",
    })
}

function getActiveParkIds(...sources: Array<Array<{ locationId: ParkId }>>) {
    const ids = new Set<ParkId>()

    for (const source of sources) {
        for (const item of ensureArray(source)) {
            ids.add(item.locationId)
        }
    }

    return Array.from(ids)
}

function getPeriodDays(...sources: Array<Array<{ date: string }>>) {
    const days = new Set<string>()

    for (const source of sources) {
        for (const item of ensureArray(source)) {
            days.add(item.date)
        }
    }

    return days.size || 1
}

function getTopKey<K extends string>(
    counters: Partial<Record<K, number>>
): K | null {
    let topKey: K | null = null
    let topValue = -Infinity

    for (const [key, value] of Object.entries(counters) as Array<[K, number | undefined]>) {
        const safeValue = value ?? 0

        if (safeValue > topValue) {
            topKey = key
            topValue = safeValue
        }
    }

    return topValue > 0 ? topKey : null
}

function getTopZone<T extends { zone: string }>(items: T[]) {
    const counters: Record<string, number> = {}

    for (const item of items) {
        counters[item.zone] = (counters[item.zone] ?? 0) + 1
    }

    const topZone = getTopKey(counters)

    return {
        zone: topZone,
        count: topZone ? counters[topZone] : 0,
    }
}

function getDominantSecurityType(
    incidents: ParkSecurityIncident[]
): ParkSecurityType | null {
    const counters: Partial<Record<ParkSecurityType, number>> = {}

    for (const incident of incidents) {
        const weight =
            SECURITY_IMPACT[incident.type] +
            (incident.resolved ? 0 : 2) +
            (incident.severity === "critical" ? 3 : incident.severity === "high" ? 1 : 0)

        counters[incident.type] = (counters[incident.type] ?? 0) + weight
    }

    return getTopKey(counters)
}

function getDominantOperationsType(
    incidents: ParkOperationsIncident[]
): ParkOperationsType | null {
    const counters: Partial<Record<ParkOperationsType, number>> = {}

    for (const incident of incidents) {
        const weight =
            OPERATIONS_IMPACT[incident.type] +
            (incident.resolved ? 0 : 2) +
            (incident.severity === "high" ? 2 : 0)

        counters[incident.type] = (counters[incident.type] ?? 0) + weight
    }

    return getTopKey(counters)
}

function getSecurityParkScore(
    incidents: ParkSecurityIncident[],
    periodDays: number
) {
    const incidentCount = incidents.length
    const unresolvedCount = incidents.filter((incident) => !incident.resolved).length
    const criticalCount = incidents.filter((incident) => incident.severity === "critical").length
    const criticalOpenCount = incidents.filter(
        (incident) => incident.severity === "critical" && !incident.resolved
    ).length
    const avgResponse = average(incidents.map((incident) => incident.responseMinutes))

    const incidentPressure = (incidentCount / periodDays) * 1.15
    const unresolvedPressure = (unresolvedCount / periodDays) * 2.3
    const criticalPressure = (criticalCount / periodDays) * 3.1
    const openCriticalPressure = criticalOpenCount * 0.8
    const responsePressure = Math.max(avgResponse - 6, 0) * 0.12

    return getParkRating(
        incidentPressure +
        unresolvedPressure +
        criticalPressure +
        openCriticalPressure +
        responsePressure
    )
}

function getSecurityDailyScore(incidents: ParkSecurityIncident[]) {
    const incidentCount = incidents.length
    const unresolvedCount = incidents.filter((incident) => !incident.resolved).length
    const criticalCount = incidents.filter((incident) => incident.severity === "critical").length
    const avgResponse = average(incidents.map((incident) => incident.responseMinutes))

    return getParkRating(
        incidentCount * 0.85 +
        unresolvedCount * 1.5 +
        criticalCount * 2.2 +
        Math.max(avgResponse - 7, 0) * 0.14
    )
}

function getSecurityZoneScore(incidents: ParkSecurityIncident[]) {
    const incidentCount = incidents.length
    const unresolvedCount = incidents.filter((incident) => !incident.resolved).length
    const criticalCount = incidents.filter((incident) => incident.severity === "critical").length
    const avgResponse = average(incidents.map((incident) => incident.responseMinutes))

    return getParkRating(
        incidentCount * 0.75 +
        unresolvedCount * 1.45 +
        criticalCount * 2.1 +
        Math.max(avgResponse - 8, 0) * 0.13
    )
}

function getOperationsParkScore(
    incidents: ParkOperationsIncident[],
    periodDays: number
) {
    const issueCount = incidents.length
    const unresolvedCount = incidents.filter((incident) => !incident.resolved).length
    const highCount = incidents.filter((incident) => incident.severity === "high").length
    const unresolvedHighCount = incidents.filter(
        (incident) => incident.severity === "high" && !incident.resolved
    ).length

    return getParkRating(
        (issueCount / periodDays) * 0.95 +
        (unresolvedCount / periodDays) * 1.9 +
        (highCount / periodDays) * 1.6 +
        unresolvedHighCount * 0.75
    )
}

function getOperationsDailyScore(incidents: ParkOperationsIncident[]) {
    const issueCount = incidents.length
    const unresolvedCount = incidents.filter((incident) => !incident.resolved).length
    const highCount = incidents.filter((incident) => incident.severity === "high").length

    return getParkRating(
        issueCount * 0.75 +
        unresolvedCount * 1.45 +
        highCount * 1.7
    )
}

function getOperationsZoneScore(incidents: ParkOperationsIncident[]) {
    const issueCount = incidents.length
    const unresolvedCount = incidents.filter((incident) => !incident.resolved).length
    const highCount = incidents.filter((incident) => incident.severity === "high").length

    return getParkRating(
        issueCount * 0.7 +
        unresolvedCount * 1.5 +
        highCount * 1.8
    )
}

export function getParkNameById(parkId: ParkId) {
    return PARKS.find((park) => park.id === parkId)?.name ?? parkId
}

export function getParkSecurityDailyRisk(
    daily: ParkSecurityDailyEntry[],
    incidents: ParkSecurityIncident[]
): ParkSecurityDailyRiskPoint[] {
    const safeDaily = ensureArray(daily)
    const safeIncidents = ensureArray(incidents)
    const dates = new Set<string>()

    for (const row of safeDaily) dates.add(row.date)
    for (const incident of safeIncidents) dates.add(incident.date)

    return Array.from(dates)
        .sort((left, right) => left.localeCompare(right))
        .map((date) => {
            const dayIncidents = safeIncidents.filter((incident) => incident.date === date)

            return {
                date,
                dateLabel: getDateLabel(date),
                incidentCount: dayIncidents.length,
                unresolvedCount: dayIncidents.filter((incident) => !incident.resolved).length,
                criticalCount: dayIncidents.filter((incident) => incident.severity === "critical").length,
                avgResponse: average(dayIncidents.map((incident) => incident.responseMinutes)),
                riskScore: getSecurityDailyScore(dayIncidents),
            }
        })
}

export function getParkSecurityIssueMix(
    incidents: ParkSecurityIncident[]
): ParkSecurityIssueMixItem[] {
    const safeIncidents = ensureArray(incidents)

    return (Object.keys(PARK_SECURITY_LABELS) as ParkSecurityType[])
        .map((type) => {
            const typeIncidents = safeIncidents.filter((incident) => incident.type === type)

            return {
                type,
                label: PARK_SECURITY_LABELS[type],
                totalCount: typeIncidents.length,
                unresolvedCount: typeIncidents.filter((incident) => !incident.resolved).length,
                criticalCount: typeIncidents.filter((incident) => incident.severity === "critical").length,
            }
        })
        .sort((left, right) => {
            const rightWeight = right.totalCount + right.unresolvedCount * 2 + right.criticalCount * 3
            const leftWeight = left.totalCount + left.unresolvedCount * 2 + left.criticalCount * 3
            return rightWeight - leftWeight
        })
}

export function getParkSecurityPriorityParks(
    daily: ParkSecurityDailyEntry[],
    incidents: ParkSecurityIncident[]
): ParkSecurityParkPriority[] {
    const safeDaily = ensureArray(daily)
    const safeIncidents = ensureArray(incidents)
    const periodDays = getPeriodDays(safeDaily, safeIncidents)
    const activeParkIds = getActiveParkIds(safeDaily, safeIncidents)

    return activeParkIds
        .map((parkId) => {
            const parkIncidents = safeIncidents.filter((incident) => incident.locationId === parkId)
            const dominantType = getDominantSecurityType(parkIncidents)
            const hotspot = getTopZone(parkIncidents)
            const safetyScore = getSecurityParkScore(parkIncidents, periodDays)

            return {
                parkId,
                parkName: getParkNameById(parkId),
                safetyScore,
                tone: getParkTone(safetyScore),
                incidentCount: parkIncidents.length,
                unresolvedCount: parkIncidents.filter((incident) => !incident.resolved).length,
                criticalOpenCount: parkIncidents.filter(
                    (incident) => incident.severity === "critical" && !incident.resolved
                ).length,
                avgResponse: average(parkIncidents.map((incident) => incident.responseMinutes)),
                dominantType,
                dominantTypeLabel: dominantType
                    ? PARK_SECURITY_LABELS[dominantType]
                    : "Ситуация стабильна",
                hotspotZone: hotspot.zone,
                hotspotCount: hotspot.count,
            }
        })
        .sort((left, right) =>
            left.safetyScore - right.safetyScore ||
            right.criticalOpenCount - left.criticalOpenCount ||
            right.unresolvedCount - left.unresolvedCount ||
            right.incidentCount - left.incidentCount
        )
}

export function getParkSecurityZoneHotspots(
    incidents: ParkSecurityIncident[]
): ParkSecurityZoneHotspot[] {
    const safeIncidents = ensureArray(incidents)
    const grouped = new Map<string, ParkSecurityIncident[]>()

    for (const incident of safeIncidents) {
        const key = `${incident.locationId}:${incident.zone}`
        const existing = grouped.get(key)

        if (existing) {
            existing.push(incident)
        } else {
            grouped.set(key, [incident])
        }
    }

    return Array.from(grouped.entries())
        .map(([key, zoneIncidents]) => {
            const [parkId, zone] = key.split(":") as [ParkId, string]
            const dominantType = getDominantSecurityType(zoneIncidents)
            const riskScore = getSecurityZoneScore(zoneIncidents)

            return {
                id: key,
                parkId,
                parkName: getParkNameById(parkId),
                zone,
                riskScore,
                tone: getParkTone(riskScore),
                incidentCount: zoneIncidents.length,
                unresolvedCount: zoneIncidents.filter((incident) => !incident.resolved).length,
                criticalCount: zoneIncidents.filter((incident) => incident.severity === "critical").length,
                avgResponse: average(zoneIncidents.map((incident) => incident.responseMinutes)),
                dominantType,
                dominantTypeLabel: dominantType
                    ? PARK_SECURITY_LABELS[dominantType]
                    : "Стабильная обстановка",
            }
        })
        .sort((left, right) =>
            left.riskScore - right.riskScore ||
            right.criticalCount - left.criticalCount ||
            right.unresolvedCount - left.unresolvedCount ||
            right.incidentCount - left.incidentCount
        )
}

export function getParkSecurityOverview(
    daily: ParkSecurityDailyEntry[],
    incidents: ParkSecurityIncident[]
): ParkSecurityOverview {
    const safeIncidents = ensureArray(incidents)
    const priorityParks = getParkSecurityPriorityParks(daily, safeIncidents)
    const zoneHotspots = getParkSecurityZoneHotspots(safeIncidents)
    const dailyRisk = getParkSecurityDailyRisk(daily, safeIncidents)
    const issueMix = getParkSecurityIssueMix(safeIncidents)
    const safetyScore = priorityParks.length
        ? roundRating(priorityParks.reduce((sum, park) => sum + park.safetyScore, 0) / priorityParks.length)
        : PARK_RATING_MAX
    const worstDay = dailyRisk
        .slice()
        .sort((left, right) => left.riskScore - right.riskScore)[0] ?? null
    const topIssue = issueMix.find((item) => item.totalCount > 0) ?? null

    return {
        monitoredParks: priorityParks.length,
        safetyScore,
        healthyParks: priorityParks.filter((park) => park.tone === "healthy").length,
        attentionParks: priorityParks.filter((park) => park.tone === "attention").length,
        criticalParks: priorityParks.filter((park) => park.tone === "critical").length,
        atRiskParks: priorityParks.filter((park) => park.tone !== "healthy").length,
        unresolvedIncidents: safeIncidents.filter((incident) => !incident.resolved).length,
        criticalOpenIncidents: safeIncidents.filter(
            (incident) => incident.severity === "critical" && !incident.resolved
        ).length,
        avgResponse: average(safeIncidents.map((incident) => incident.responseMinutes)),
        dominantType: topIssue?.type ?? null,
        dominantTypeLabel: topIssue?.label ?? "Ситуация стабильна",
        worstParkName: priorityParks[0]?.parkName ?? null,
        worstZoneLabel: zoneHotspots[0]?.zone ?? "Нет выраженной зоны риска",
        worstZoneParkName: zoneHotspots[0]?.parkName ?? null,
        worstDateLabel: worstDay?.dateLabel ?? null,
        lowestDailyScore: worstDay?.riskScore ?? null,
    }
}

export function getParkOperationsDailyReadiness(
    daily: ParkOperationsDailyEntry[],
    incidents: ParkOperationsIncident[]
): ParkOperationsDailyReadinessPoint[] {
    const safeDaily = ensureArray(daily)
    const safeIncidents = ensureArray(incidents)
    const dates = new Set<string>()

    for (const row of safeDaily) dates.add(row.date)
    for (const incident of safeIncidents) dates.add(incident.date)

    return Array.from(dates)
        .sort((left, right) => left.localeCompare(right))
        .map((date) => {
            const dayIncidents = safeIncidents.filter((incident) => incident.date === date)

            return {
                date,
                dateLabel: getDateLabel(date),
                issueCount: dayIncidents.length,
                unresolvedCount: dayIncidents.filter((incident) => !incident.resolved).length,
                highCount: dayIncidents.filter((incident) => incident.severity === "high").length,
                readinessScore: getOperationsDailyScore(dayIncidents),
            }
        })
}

export function getParkOperationsIssueMix(
    incidents: ParkOperationsIncident[]
): ParkOperationsIssueMixItem[] {
    const safeIncidents = ensureArray(incidents)

    return (Object.keys(PARK_OPERATIONS_LABELS) as ParkOperationsType[])
        .map((type) => {
            const typeIncidents = safeIncidents.filter((incident) => incident.type === type)

            return {
                type,
                label: PARK_OPERATIONS_LABELS[type],
                totalCount: typeIncidents.length,
                unresolvedCount: typeIncidents.filter((incident) => !incident.resolved).length,
                highCount: typeIncidents.filter((incident) => incident.severity === "high").length,
            }
        })
        .sort((left, right) => {
            const rightWeight = right.totalCount + right.unresolvedCount * 2 + right.highCount * 2
            const leftWeight = left.totalCount + left.unresolvedCount * 2 + left.highCount * 2
            return rightWeight - leftWeight
        })
}

export function getParkOperationsPriorityParks(
    daily: ParkOperationsDailyEntry[],
    incidents: ParkOperationsIncident[]
): ParkOperationsParkPriority[] {
    const safeDaily = ensureArray(daily)
    const safeIncidents = ensureArray(incidents)
    const periodDays = getPeriodDays(safeDaily, safeIncidents)
    const activeParkIds = getActiveParkIds(safeDaily, safeIncidents)

    return activeParkIds
        .map((parkId) => {
            const parkIncidents = safeIncidents.filter((incident) => incident.locationId === parkId)
            const dominantType = getDominantOperationsType(parkIncidents)
            const hotspot = getTopZone(parkIncidents)
            const readinessScore = getOperationsParkScore(parkIncidents, periodDays)
            const unresolvedCount = parkIncidents.filter((incident) => !incident.resolved).length
            const unresolvedHighCount = parkIncidents.filter(
                (incident) => incident.severity === "high" && !incident.resolved
            ).length

            return {
                parkId,
                parkName: getParkNameById(parkId),
                readinessScore,
                tone: getParkTone(readinessScore),
                issueCount: parkIncidents.length,
                unresolvedCount,
                unresolvedHighCount,
                serviceDebt: unresolvedCount + unresolvedHighCount,
                dominantType,
                dominantTypeLabel: dominantType
                    ? PARK_OPERATIONS_LABELS[dominantType]
                    : "Территория стабильна",
                hotspotZone: hotspot.zone,
                hotspotCount: hotspot.count,
            }
        })
        .sort((left, right) =>
            left.readinessScore - right.readinessScore ||
            right.serviceDebt - left.serviceDebt ||
            right.issueCount - left.issueCount
        )
}

export function getParkOperationsZoneHotspots(
    incidents: ParkOperationsIncident[]
): ParkOperationsZoneHotspot[] {
    const safeIncidents = ensureArray(incidents)
    const grouped = new Map<string, ParkOperationsIncident[]>()

    for (const incident of safeIncidents) {
        const key = `${incident.locationId}:${incident.zone}`
        const existing = grouped.get(key)

        if (existing) {
            existing.push(incident)
        } else {
            grouped.set(key, [incident])
        }
    }

    return Array.from(grouped.entries())
        .map(([key, zoneIncidents]) => {
            const [parkId, zone] = key.split(":") as [ParkId, string]
            const dominantType = getDominantOperationsType(zoneIncidents)
            const readinessScore = getOperationsZoneScore(zoneIncidents)

            return {
                id: key,
                parkId,
                parkName: getParkNameById(parkId),
                zone,
                readinessScore,
                tone: getParkTone(readinessScore),
                issueCount: zoneIncidents.length,
                unresolvedCount: zoneIncidents.filter((incident) => !incident.resolved).length,
                highCount: zoneIncidents.filter((incident) => incident.severity === "high").length,
                dominantType,
                dominantTypeLabel: dominantType
                    ? PARK_OPERATIONS_LABELS[dominantType]
                    : "Профилактический режим",
            }
        })
        .sort((left, right) =>
            left.readinessScore - right.readinessScore ||
            right.unresolvedCount - left.unresolvedCount ||
            right.highCount - left.highCount ||
            right.issueCount - left.issueCount
        )
}

export function getParkOperationsOverview(
    daily: ParkOperationsDailyEntry[],
    incidents: ParkOperationsIncident[]
): ParkOperationsOverview {
    const safeIncidents = ensureArray(incidents)
    const priorityParks = getParkOperationsPriorityParks(daily, safeIncidents)
    const zoneHotspots = getParkOperationsZoneHotspots(safeIncidents)
    const readinessTrend = getParkOperationsDailyReadiness(daily, safeIncidents)
    const issueMix = getParkOperationsIssueMix(safeIncidents)
    const readinessScore = priorityParks.length
        ? roundRating(priorityParks.reduce((sum, park) => sum + park.readinessScore, 0) / priorityParks.length)
        : PARK_RATING_MAX
    const worstDay = readinessTrend
        .slice()
        .sort((left, right) => left.readinessScore - right.readinessScore)[0] ?? null
    const backlogIssues = safeIncidents.filter((incident) => !incident.resolved).length
    const unresolvedHighPriority = safeIncidents.filter(
        (incident) => incident.severity === "high" && !incident.resolved
    ).length
    const topIssue = issueMix.find((item) => item.totalCount > 0) ?? null

    return {
        monitoredParks: priorityParks.length,
        readinessScore,
        healthyParks: priorityParks.filter((park) => park.tone === "healthy").length,
        attentionParks: priorityParks.filter((park) => park.tone === "attention").length,
        criticalParks: priorityParks.filter((park) => park.tone === "critical").length,
        atRiskParks: priorityParks.filter((park) => park.tone !== "healthy").length,
        backlogIssues,
        unresolvedHighPriority,
        serviceDebt: backlogIssues + unresolvedHighPriority,
        dominantType: topIssue?.type ?? null,
        dominantTypeLabel: topIssue?.label ?? "Сервисный фон стабилен",
        worstParkName: priorityParks[0]?.parkName ?? null,
        worstZoneLabel: zoneHotspots[0]?.zone ?? "Нет выраженной проблемной зоны",
        worstZoneParkName: zoneHotspots[0]?.parkName ?? null,
        worstDateLabel: worstDay?.dateLabel ?? null,
        lowestDailyScore: worstDay?.readinessScore ?? null,
    }
}
