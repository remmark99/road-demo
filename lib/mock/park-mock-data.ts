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
    "park-1": ["Центральная аллея", "Детская площадка", "Входная группа", "Павильон №2"],
    "park-2": ["Озёрная дорожка", "Спортивная зона", "Сцена", "Северный вход"],
}

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
}

function getDateString(daysAgo: number) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - daysAgo)
    return date.toISOString().split("T")[0]
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
    const limitDate = new Date()

    switch (range) {
        case "today":
            limitDate.setDate(now.getDate() - 1)
            break
        case "yesterday":
            limitDate.setDate(now.getDate() - 2)
            {
                const yesterdayEnd = new Date(now)
                yesterdayEnd.setDate(now.getDate() - 1)
                return data.filter((item) => {
                    const date = new Date(item.date)
                    return date > limitDate && date <= yesterdayEnd
                })
            }
        case "week":
            limitDate.setDate(now.getDate() - 7)
            break
        case "month":
            limitDate.setDate(now.getDate() - 30)
            break
    }

    return data.filter((item) => new Date(item.date) >= limitDate)
}

export function filterByLocations<T extends { locationId: ParkId }>(
    data: T[],
    locations: ParkId[]
): T[] {
    return data.filter((item) => locations.includes(item.locationId))
}
