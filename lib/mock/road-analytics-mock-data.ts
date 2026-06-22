import { districts } from "@/lib/districts"
import { STOP_DISTRICT_COVERAGE_ESTIMATES } from "@/lib/stop-analytics-config"

export type RoadSeason = "summer" | "winter"
export type RoadSeasonFilter = "all" | RoadSeason
export type RoadIncidentType =
    | "slush"
    | "snow_heap"
    | "snow_ridge"
    | "road_flooding"
    | "road_mud"
    | "pothole"
export type RoadContractorId =
    | "sever"
    | "gors"
    | "yugra"
    | "surgut"
    | "magistral"
    | "sibdor"
    | "komfort"
export type PrecipitationCategoryId = "none" | "light" | "moderate" | "heavy"

export interface RoadContractor {
    id: RoadContractorId
    name: string
    shortName: string
    color: string
    managedKm: number
    baseEfficiencyPct: number
}

export interface RoadMonthlyContractorRow {
    monthKey: string
    monthLabel: string
    monthIndex: number
    season: RoadSeason
    contractorId: RoadContractorId
    incidentType: RoadIncidentType
    overdueCount: number
    avgResolutionHours: number
    avgReactionMinutes: number
    slaPct: number
    repeatIncidents: number
    weatherOverdue: number
}

export interface RoadDailyContractorRow {
    date: string
    season: RoadSeason
    contractorId: RoadContractorId
    managedKm: number
    efficiencyPct: number
    onlineCameras: number
    incidents: number
    overdueIncidents: number
    completedOrders: number
    reactionMinutes: number
}

export interface RoadPrecipitationRow {
    season: RoadSeason
    categoryId: PrecipitationCategoryId
    incidents: number
}

export interface RoadCityDistrictRow {
    districtName: string
    servicedKm: number
    intersections: number
    cameras: number
    onlinePct: number
    openIncidents: number
    overdueIncidents: number
    avgReactionMinutes: number
    winterRiskPct: number
}

export interface RoadRepairDailyRow {
    date: string
    contractorId: RoadContractorId
    plannedKm: number
    completedKm: number
    defectsClosed: number
    qualityScore: number
}

export interface RoadRepairProject {
    street: string
    district: string
    contractorId: RoadContractorId
    stage: "Подготовка" | "Фрезеровка" | "Укладка" | "Приемка" | "Гарантийные замечания"
    completionPct: number
    plannedFinish: string
    openDefects: number
    riskLevel: "Низкий" | "Средний" | "Высокий"
    nextAction: string
}

export const ROAD_KPI = {
    connectedCameras: 196,
    servicedIntersections: 40,
    onlinePct: 98,
    offlineNote: "перекресток Свободы - Ленина: камера 1 не работает",
} as const

export const ROAD_SEASONS: Array<{ id: RoadSeasonFilter; label: string }> = [
    { id: "all", label: "Все сезоны" },
    { id: "summer", label: "Летний сезон" },
    { id: "winter", label: "Зимний сезон" },
]

export const ROAD_INCIDENT_TYPES: Array<{ id: RoadIncidentType; label: string; shortLabel: string; season: RoadSeason }> = [
    { id: "slush", label: "Снежная каша", shortLabel: "Каша", season: "winter" },
    { id: "snow_heap", label: "Снежный навал", shortLabel: "Навал", season: "winter" },
    { id: "snow_ridge", label: "Снежный вал", shortLabel: "Вал", season: "winter" },
    { id: "road_flooding", label: "Затопление дороги", shortLabel: "Затопление", season: "summer" },
    { id: "road_mud", label: "Грязь на дороге", shortLabel: "Грязь", season: "summer" },
    { id: "pothole", label: "Ямы", shortLabel: "Ямы", season: "summer" },
]

export const ROAD_PRECIPITATION_CATEGORIES: Array<{
    id: PrecipitationCategoryId
    label: string
    description: string
}> = [
    { id: "none", label: "Без осадков", description: "0 мм за смену" },
    { id: "light", label: "Слабые", description: "до 3 мм" },
    { id: "moderate", label: "Умеренные", description: "3-8 мм" },
    { id: "heavy", label: "Интенсивные", description: "более 8 мм" },
]

export const ROAD_CONTRACTORS: RoadContractor[] = [
    { id: "sever", name: "СеверДорСтрой", shortName: "СеверДор", color: "hsl(210, 89%, 54%)", managedKm: 42, baseEfficiencyPct: 93 },
    { id: "gors", name: "Горсервис", shortName: "Горсервис", color: "hsl(160, 72%, 38%)", managedKm: 38, baseEfficiencyPct: 88 },
    { id: "yugra", name: "ЮграДор", shortName: "ЮграДор", color: "hsl(35, 92%, 52%)", managedKm: 51, baseEfficiencyPct: 84 },
    { id: "surgut", name: "СургутРемДор", shortName: "РемДор", color: "hsl(262, 83%, 58%)", managedKm: 47, baseEfficiencyPct: 91 },
    { id: "magistral", name: "Магистраль-Сервис", shortName: "Магистраль", color: "hsl(190, 91%, 41%)", managedKm: 29, baseEfficiencyPct: 86 },
    { id: "sibdor", name: "СибДорКонтроль", shortName: "СибДор", color: "hsl(345, 82%, 56%)", managedKm: 34, baseEfficiencyPct: 89 },
    { id: "komfort", name: "КомфортГород", shortName: "Комфорт", color: "hsl(120, 44%, 42%)", managedKm: 25, baseEfficiencyPct: 82 },
]

const MONTHS: Array<{ key: string; label: string; index: number; season: RoadSeason }> = [
    { key: "2025-07", label: "Июл", index: 0, season: "summer" },
    { key: "2025-08", label: "Авг", index: 1, season: "summer" },
    { key: "2025-09", label: "Сен", index: 2, season: "summer" },
    { key: "2025-10", label: "Окт", index: 3, season: "summer" },
    { key: "2025-11", label: "Ноя", index: 4, season: "winter" },
    { key: "2025-12", label: "Дек", index: 5, season: "winter" },
    { key: "2026-01", label: "Янв", index: 6, season: "winter" },
    { key: "2026-02", label: "Фев", index: 7, season: "winter" },
    { key: "2026-03", label: "Мар", index: 8, season: "winter" },
    { key: "2026-04", label: "Апр", index: 9, season: "summer" },
    { key: "2026-05", label: "Май", index: 10, season: "summer" },
    { key: "2026-06", label: "Июн", index: 11, season: "summer" },
]

function formatDate(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function getSeasonByMonth(monthIndex: number): RoadSeason {
    return monthIndex >= 10 || monthIndex <= 2 ? "winter" : "summer"
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 1) {
    return Number(value.toFixed(digits))
}

function buildMonthlyRows(): RoadMonthlyContractorRow[] {
    const rows: RoadMonthlyContractorRow[] = []

    for (const month of MONTHS) {
        for (const [contractorIndex, contractor] of ROAD_CONTRACTORS.entries()) {
            const seasonIncidentTypes = ROAD_INCIDENT_TYPES.filter((incidentType) => incidentType.season === month.season)

            for (const [typeIndex, incidentType] of seasonIncidentTypes.entries()) {
                const winterLoad = month.season === "winter" ? 9 : 3
                const contractorLoad = contractorIndex + 1
                const typeLoad = typeIndex * (month.season === "winter" ? 3 : 2)
                const monthWave = (month.index + contractorIndex * 2 + typeIndex) % 5
                const summerLoad = incidentType.id === "pothole" ? 6 : incidentType.id === "road_flooding" ? 5 : 4
                const overdueCount = (month.season === "winter" ? winterLoad : summerLoad) + contractorLoad + typeLoad + monthWave
                const avgReactionMinutes = clamp(22 + contractorIndex * 3 + typeIndex * 5 + monthWave * 2 + (month.season === "winter" ? 10 : 4), 18, 74)
                const avgResolutionHours = clamp(3.5 + contractorIndex * 0.35 + typeIndex * 0.65 + monthWave * 0.4 + (month.season === "winter" ? 2.2 : 1.2), 2.4, 14.5)
                const slaPct = clamp(contractor.baseEfficiencyPct - typeIndex * 3 - monthWave - (month.season === "winter" ? 4 : 2), 68, 98)

                rows.push({
                    monthKey: month.key,
                    monthLabel: month.label,
                    monthIndex: month.index,
                    season: month.season,
                    contractorId: contractor.id,
                    incidentType: incidentType.id,
                    overdueCount,
                    avgResolutionHours: round(avgResolutionHours),
                    avgReactionMinutes: Math.round(avgReactionMinutes),
                    slaPct: Math.round(slaPct),
                    repeatIncidents: 2 + ((month.index + contractorIndex + typeIndex) % 8),
                    weatherOverdue: Math.round(overdueCount * (month.season === "winter" ? 0.62 : 0.28)),
                })
            }
        }
    }

    return rows
}

function buildDailyRows(): RoadDailyContractorRow[] {
    const rows: RoadDailyContractorRow[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let dayOffset = 89; dayOffset >= 0; dayOffset -= 1) {
        const date = new Date(today)
        date.setDate(today.getDate() - dayOffset)
        const season = getSeasonByMonth(date.getMonth())

        for (const [contractorIndex, contractor] of ROAD_CONTRACTORS.entries()) {
            const wave = (dayOffset + contractorIndex * 3) % 9
            const weatherPenalty = season === "winter" ? 5 : 1
            const efficiencyPct = clamp(contractor.baseEfficiencyPct - weatherPenalty - wave * 0.7 + (contractorIndex % 2 === 0 ? 1.8 : 0), 70, 98)
            const incidents = 8 + contractorIndex + wave + (season === "winter" ? 9 : 2)
            const overdueIncidents = Math.max(1, Math.round(incidents * (100 - efficiencyPct) / 100))

            rows.push({
                date: formatDate(date),
                season,
                contractorId: contractor.id,
                managedKm: contractor.managedKm,
                efficiencyPct: round(efficiencyPct),
                onlineCameras: clamp(22 + contractorIndex * 3 - (wave === 0 ? 1 : 0), 18, 42),
                incidents,
                overdueIncidents,
                completedOrders: Math.max(6, incidents - overdueIncidents + 3),
                reactionMinutes: Math.round(24 + contractorIndex * 3 + wave * 1.5 + (season === "winter" ? 8 : 0)),
            })
        }
    }

    return rows
}

function buildPrecipitationRows(): RoadPrecipitationRow[] {
    return [
        { season: "summer", categoryId: "none", incidents: 42 },
        { season: "summer", categoryId: "light", incidents: 63 },
        { season: "summer", categoryId: "moderate", incidents: 91 },
        { season: "summer", categoryId: "heavy", incidents: 128 },
        { season: "winter", categoryId: "none", incidents: 71 },
        { season: "winter", categoryId: "light", incidents: 118 },
        { season: "winter", categoryId: "moderate", incidents: 173 },
        { season: "winter", categoryId: "heavy", incidents: 236 },
    ]
}

function buildCityRows(): RoadCityDistrictRow[] {
    const names = Array.from(new Set([
        ...districts.map((district) => district.name),
        ...STOP_DISTRICT_COVERAGE_ESTIMATES.map((district) => district.districtName),
    ]))

    return names.map((districtName, index) => {
        const stopCoverage = STOP_DISTRICT_COVERAGE_ESTIMATES.find((district) => district.districtName === districtName)
        const cameras = 10 + index * 2 + (stopCoverage?.connectedStops ?? 1)
        const intersections = 2 + (index % 4)
        const openIncidents = 8 + ((index * 5) % 19)
        const onlinePct = clamp(94 + (index % 5), 92, 99)

        return {
            districtName,
            servicedKm: round(8.5 + index * 2.4 + (stopCoverage?.connectedStops ?? 0) * 0.8),
            intersections,
            cameras,
            onlinePct,
            openIncidents,
            overdueIncidents: Math.max(1, Math.round(openIncidents * (index % 3 === 0 ? 0.34 : 0.22))),
            avgReactionMinutes: 26 + index * 3,
            winterRiskPct: clamp(31 + index * 5 + (stopCoverage ? 4 : 0), 28, 82),
        }
    })
}

function buildRepairDailyRows(): RoadRepairDailyRow[] {
    const rows: RoadRepairDailyRow[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let dayOffset = 44; dayOffset >= 0; dayOffset -= 1) {
        const date = new Date(today)
        date.setDate(today.getDate() - dayOffset)

        for (const [contractorIndex, contractor] of ROAD_CONTRACTORS.slice(0, 5).entries()) {
            const wave = (dayOffset + contractorIndex * 2) % 7
            const plannedKm = round(0.7 + contractorIndex * 0.11 + wave * 0.08)
            const completedKm = round(clamp(plannedKm - (wave <= 1 ? 0.16 : -0.08), 0.35, 1.8))

            rows.push({
                date: formatDate(date),
                contractorId: contractor.id,
                plannedKm,
                completedKm,
                defectsClosed: 3 + ((dayOffset + contractorIndex * 2) % 8),
                qualityScore: clamp(82 + contractorIndex * 2 + (wave % 4), 78, 97),
            })
        }
    }

    return rows
}

export const roadMonthlyContractorRows = buildMonthlyRows()
export const roadDailyContractorRows = buildDailyRows()
export const roadPrecipitationRows = buildPrecipitationRows()
export const roadCityDistrictRows = buildCityRows()
export const roadRepairDailyRows = buildRepairDailyRows()

export const roadRepairProjects: RoadRepairProject[] = [
    {
        street: "пр. Ленина",
        district: "Центральный",
        contractorId: "sever",
        stage: "Укладка",
        completionPct: 82,
        plannedFinish: "28.06",
        openDefects: 3,
        riskLevel: "Средний",
        nextAction: "Ночной слой покрытия и контрольная приемка",
    },
    {
        street: "ул. 30 лет Победы",
        district: "Северный",
        contractorId: "gors",
        stage: "Фрезеровка",
        completionPct: 58,
        plannedFinish: "04.07",
        openDefects: 5,
        riskLevel: "Высокий",
        nextAction: "Усилить вторую смену и закрыть основание",
    },
    {
        street: "ул. Мелик-Карамова",
        district: "Восточный",
        contractorId: "yugra",
        stage: "Подготовка",
        completionPct: 41,
        plannedFinish: "09.07",
        openDefects: 6,
        riskLevel: "Высокий",
        nextAction: "Ограждение контура и вывод дополнительной техники",
    },
    {
        street: "Нефтеюганское шоссе",
        district: "Промышленный",
        contractorId: "surgut",
        stage: "Приемка",
        completionPct: 93,
        plannedFinish: "24.06",
        openDefects: 2,
        riskLevel: "Низкий",
        nextAction: "Закрыть замечания по разметке",
    },
    {
        street: "ул. Университетская",
        district: "Северный",
        contractorId: "sever",
        stage: "Гарантийные замечания",
        completionPct: 74,
        plannedFinish: "30.06",
        openDefects: 4,
        riskLevel: "Средний",
        nextAction: "Закрытие карт ямочного ремонта",
    },
    {
        street: "ул. Профсоюзов",
        district: "10 микрорайон",
        contractorId: "magistral",
        stage: "Укладка",
        completionPct: 69,
        plannedFinish: "02.07",
        openDefects: 3,
        riskLevel: "Средний",
        nextAction: "Проверка температурного режима покрытия",
    },
]

export function getRoadContractor(id: RoadContractorId) {
    return ROAD_CONTRACTORS.find((contractor) => contractor.id === id)
}

export function getRoadContractorName(id: RoadContractorId) {
    return getRoadContractor(id)?.name ?? id
}

export function filterRoadRowsBySeason<T extends { season: RoadSeason }>(
    rows: T[],
    season: RoadSeasonFilter
) {
    return season === "all" ? rows : rows.filter((row) => row.season === season)
}

export function getRoadSeasonLabel(season: RoadSeasonFilter) {
    return ROAD_SEASONS.find((item) => item.id === season)?.label ?? "Все сезоны"
}

export function getRoadIncidentTypesForSeason(season: RoadSeasonFilter) {
    return season === "all"
        ? ROAD_INCIDENT_TYPES
        : ROAD_INCIDENT_TYPES.filter((incidentType) => incidentType.season === season)
}
