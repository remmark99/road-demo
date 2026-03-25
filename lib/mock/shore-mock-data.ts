export type TimeRange = "today" | "yesterday" | "week" | "month"

export const SHORE_LOCATIONS = [
    { id: "embankment", name: "Набережная Оби" },
    { id: "saima", name: "Парк за Саймой" },
    { id: "river_station", name: "Речной вокзал" },
]

export const TIME_RANGES = [
    { label: "Сегодня", value: "today" },
    { label: "Вчера", value: "yesterday" },
    { label: "За неделю", value: "week" },
    { label: "За месяц", value: "month" },
]

function localDateStr(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

// Mock data generator helper
const generateMockData = (days: number) => {
    const securityData = []
    const safetyData = []
    const emergencyData = []

    const now = new Date()

    for (let i = 0; i < days; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const dayStr = localDateStr(d)

        for (const loc of SHORE_LOCATIONS) {
            securityData.push({
                id: `sec-${loc.id}-${i}`,
                date: dayStr,
                locationId: loc.id,
                line_cross: Math.floor(Math.random() * 50) + 10,
                person_detect: Math.floor(Math.random() * 200) + 50,
                vehicle_detect: Math.floor(Math.random() * 20) + 2,
                audio_alarm: Math.floor(Math.random() * 15) + 1,
                light_alarm: Math.floor(Math.random() * 10) + 1,
            })

            safetyData.push({
                id: `saf-${loc.id}-${i}`,
                date: dayStr,
                locationId: loc.id,
                restricted_zone: Math.floor(Math.random() * 15),
                unaccompanied_child: Math.floor(Math.random() * 8),
            })

            // Emergencies are rare
            if (Math.random() > 0.7) {
                emergencyData.push({
                    id: `emg-${loc.id}-${i}`,
                    date: dayStr,
                    locationId: loc.id,
                    type: Math.random() > 0.5 ? "water_fall" : "fire_detect",
                    responseMinutes: Math.floor(Math.random() * 10) + 3,
                    servicesNotified: true,
                    resolved: Math.random() > 0.1,
                })
            }
        }
    }

    return { securityData, safetyData, emergencyData }
}

export const { securityData, safetyData, emergencyData } = generateMockData(30)

// Helper to filter by time range
export function filterByTimeRange<T extends { date: string }>(data: T[], range: TimeRange): T[] {
    const now = new Date()
    const todayStr = localDateStr(now)

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayStr = localDateStr(yesterday)

    switch (range) {
        case "today":
            return data.filter(d => d.date === todayStr)
        case "yesterday":
            return data.filter(d => d.date === yesterdayStr)
        case "week": {
            const weekAgo = new Date(now)
            weekAgo.setDate(now.getDate() - 7)
            return data.filter(d => new Date(d.date) >= weekAgo)
        }
        case "month":
            return data
    }
}

export function filterByLocations<T extends { locationId: string }>(data: T[], locations: string[]): T[] {
    return data.filter(d => locations.includes(d.locationId))
}
