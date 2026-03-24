export type TimeRange = "today" | "yesterday" | "week" | "month"

export const TIME_RANGES: { value: TimeRange; label: string }[] = [
    { value: "today", label: "Сегодня" },
    { value: "yesterday", label: "Вчера" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
]

export const TRANSPORT_ROUTES = [
    { id: "route-8", name: "Маршрут №8" },
    { id: "route-12", name: "Маршрут №12" },
    { id: "route-24", name: "Маршрут №24" },
    { id: "route-45", name: "Маршрут №45" },
] as const

export type TransportRouteId = (typeof TRANSPORT_ROUTES)[number]["id"]

const ROUTE_STOPS: Record<TransportRouteId, string[]> = {
    "route-8": ["Университетская", "СурГУ", "Парк 1"],
    "route-12": ["Центральный рынок", "Администрация", "Парк 2"],
    "route-24": ["ЖД вокзал", "ТЦ Сити Молл", "Университетская"],
    "route-45": ["Нефтяников", "Автовокзал", "Поликлиника"],
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

export type TransportIncidentType =
    | "route_deviation"
    | "wait_overrun"
    | "doors_not_opened"

export const TRANSPORT_INCIDENT_LABELS: Record<TransportIncidentType, string> = {
    route_deviation: "Отклонение от маршрута",
    wait_overrun: "Превышение ожидания",
    doors_not_opened: "Неоткрытые двери",
}

export interface TransportRouteDailyEntry {
    id: string
    date: string
    routeId: TransportRouteId
    route_deviation: number
    wait_overrun: number
    doors_not_opened: number
    completedTrips: number
    delayedTrips: number
    avgWaitMinutes: number
    ontimePct: number
}

export interface TransportIncidentEntry {
    id: string
    date: string
    routeId: TransportRouteId
    stopName: string
    type: TransportIncidentType
    delayMinutes: number
    resolved: boolean
}

function generateTransportDailyData(): TransportRouteDailyEntry[] {
    const data: TransportRouteDailyEntry[] = []

    for (let i = 0; i < 30; i++) {
        const date = getDateString(i)
        const dayOfWeek = new Date(date).getDay()
        const peakBoost = dayOfWeek === 1 || dayOfWeek === 5 ? 1.2 : 1

        for (const route of TRANSPORT_ROUTES) {
            const routeSeed = parseInt(route.id.replace("route-", "")) * 1000
            const seed = routeSeed + i * 100
            const completedTrips = Math.round(32 + seededRandom(seed + 1) * 18)
            const routeDeviation = seededRandom(seed + 2) > 0.7 ? 1 : 0
            const waitOverrun = Math.min(
                6,
                Math.round((seededRandom(seed + 3) * 3 + 1) * peakBoost)
            )
            const doorsNotOpened = seededRandom(seed + 4) > 0.66 ? 1 : 0
            const delayedTrips = Math.min(
                completedTrips,
                Math.round(completedTrips * (0.08 + seededRandom(seed + 5) * 0.2))
            )
            const ontimePct = Math.max(
                72,
                Math.min(98, Math.round(((completedTrips - delayedTrips) / completedTrips) * 100))
            )

            data.push({
                id: `transport-day-${route.id}-${date}`,
                date,
                routeId: route.id,
                route_deviation: routeDeviation,
                wait_overrun: waitOverrun,
                doors_not_opened: doorsNotOpened,
                completedTrips,
                delayedTrips,
                avgWaitMinutes: Math.round(4 + seededRandom(seed + 6) * 10),
                ontimePct,
            })
        }
    }

    return data
}

function generateTransportIncidents(
    daily: TransportRouteDailyEntry[]
): TransportIncidentEntry[] {
    const incidents: TransportIncidentEntry[] = []
    let counter = 0

    for (const day of daily) {
        const entries: Array<[TransportIncidentType, number]> = [
            ["route_deviation", day.route_deviation],
            ["wait_overrun", day.wait_overrun],
            ["doors_not_opened", day.doors_not_opened],
        ]

        for (const [type, count] of entries) {
            for (let i = 0; i < count; i++) {
                counter++
                const seed = counter * 311 + i
                const stops = ROUTE_STOPS[day.routeId]
                incidents.push({
                    id: `transport-incident-${counter}`,
                    date: day.date,
                    routeId: day.routeId,
                    stopName: stops[Math.floor(seededRandom(seed) * stops.length)],
                    type,
                    delayMinutes:
                        type === "wait_overrun"
                            ? Math.round(seededRandom(seed + 1) * 12 + 5)
                            : Math.round(seededRandom(seed + 1) * 8 + 2),
                    resolved: seededRandom(seed + 2) > 0.16,
                })
            }
        }
    }

    return incidents.sort((a, b) => b.date.localeCompare(a.date))
}

export const transportDailyData = generateTransportDailyData()
export const transportIncidentsData = generateTransportIncidents(
    transportDailyData
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

export function filterByRoutes<T extends { routeId: TransportRouteId }>(
    data: T[],
    routes: TransportRouteId[]
): T[] {
    return data.filter((item) => routes.includes(item.routeId))
}
