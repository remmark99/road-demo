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
    avgReactionHours: number
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
    reactionHours: number
}

export interface RoadPrecipitationRow {
    season: RoadSeason
    categoryId: PrecipitationCategoryId
    incidents: number
}

export interface RoadPrecipitationContractorRow {
    season: RoadSeason
    categoryId: PrecipitationCategoryId
    contractorId: RoadContractorId
    resiliencePct: number
    weatherOverdue: number
}

export interface RoadCityDistrictRow {
    districtName: string
    servicedKm: number
    intersections: number
    cameras: number
    onlinePct: number
    avgReactionHours: number
}

export interface RoadCityIncidentRow {
    date: string
    districtName: string
    incidentType: RoadIncidentType
    openIncidents: number
    overdueIncidents: number
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
    { id: "sever", name: "СеверДорСтрой", shortName: "СеверДор", color: "hsl(210, 89%, 54%)", managedKm: 54, baseEfficiencyPct: 95 },
    { id: "gors", name: "Горсервис", shortName: "Горсервис", color: "hsl(160, 72%, 38%)", managedKm: 37, baseEfficiencyPct: 82 },
    { id: "yugra", name: "ЮграДор", shortName: "ЮграДор", color: "hsl(35, 92%, 52%)", managedKm: 58, baseEfficiencyPct: 73 },
    { id: "surgut", name: "СургутРемДор", shortName: "РемДор", color: "hsl(262, 83%, 58%)", managedKm: 48, baseEfficiencyPct: 89 },
    { id: "magistral", name: "Магистраль-Сервис", shortName: "Магистраль", color: "hsl(190, 91%, 41%)", managedKm: 24, baseEfficiencyPct: 92 },
    { id: "sibdor", name: "СибДорКонтроль", shortName: "СибДор", color: "hsl(345, 82%, 56%)", managedKm: 32, baseEfficiencyPct: 78 },
    { id: "komfort", name: "КомфортГород", shortName: "Комфорт", color: "hsl(120, 44%, 42%)", managedKm: 22, baseEfficiencyPct: 87 },
]

const CONTRACTOR_REACTION_BASE_HOURS: Record<RoadContractorId, number> = {
    sever: 8.5,
    gors: 12.4,
    yugra: 16.2,
    surgut: 10.6,
    magistral: 7.8,
    sibdor: 14.1,
    komfort: 11.8,
}

const CONTRACTOR_OPERATING_PROFILES: Record<RoadContractorId, {
    overdueBase: number
    resolutionBase: number
    winterSensitivity: number
    summerSensitivity: number
    slaPenalty: number
}> = {
    sever: { overdueBase: 4, resolutionBase: 4.8, winterSensitivity: 0.7, summerSensitivity: 0.3, slaPenalty: 0.8 },
    gors: { overdueBase: 8, resolutionBase: 6.6, winterSensitivity: 1.4, summerSensitivity: 0.8, slaPenalty: 1.2 },
    yugra: { overdueBase: 13, resolutionBase: 8.4, winterSensitivity: 2.4, summerSensitivity: 1.1, slaPenalty: 1.8 },
    surgut: { overdueBase: 6, resolutionBase: 5.8, winterSensitivity: 0.9, summerSensitivity: 0.5, slaPenalty: 0.9 },
    magistral: { overdueBase: 3, resolutionBase: 4.4, winterSensitivity: 0.6, summerSensitivity: 0.4, slaPenalty: 0.6 },
    sibdor: { overdueBase: 10, resolutionBase: 7.5, winterSensitivity: 1.9, summerSensitivity: 1.3, slaPenalty: 1.5 },
    komfort: { overdueBase: 7, resolutionBase: 6.1, winterSensitivity: 1.1, summerSensitivity: 1.7, slaPenalty: 1.1 },
}

const CONTRACTOR_MONTH_VARIATION: Record<RoadContractorId, number[]> = {
    sever: [1, 0, 1, 0, 2, 3, 1, 1, 0, 1, 0, 1],
    gors: [2, 3, 2, 4, 6, 8, 9, 7, 5, 4, 3, 2],
    yugra: [6, 7, 8, 7, 10, 13, 15, 14, 11, 9, 8, 7],
    surgut: [2, 1, 2, 2, 4, 5, 4, 3, 3, 2, 1, 2],
    magistral: [0, 1, 1, 0, 1, 2, 2, 1, 1, 0, 1, 0],
    sibdor: [4, 5, 6, 7, 9, 11, 12, 10, 8, 7, 6, 5],
    komfort: [2, 4, 6, 7, 5, 6, 7, 5, 4, 6, 7, 5],
}

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
            const profile = CONTRACTOR_OPERATING_PROFILES[contractor.id]
            const contractorVariation = CONTRACTOR_MONTH_VARIATION[contractor.id][month.index]
            const seasonIncidentTypes = ROAD_INCIDENT_TYPES.filter((incidentType) => incidentType.season === month.season)

            for (const [typeIndex, incidentType] of seasonIncidentTypes.entries()) {
                const seasonSensitivity = month.season === "winter"
                    ? profile.winterSensitivity
                    : profile.summerSensitivity
                const typeLoad =
                    incidentType.id === "snow_ridge" ? 4 :
                        incidentType.id === "snow_heap" ? 3 :
                            incidentType.id === "road_flooding" ? 5 :
                                incidentType.id === "road_mud" ? 3 :
                                    incidentType.id === "pothole" ? 6 : 2
                const monthWave = (month.index * (contractorIndex + 2) + typeIndex * 3) % 7
                const summerLoad = incidentType.id === "pothole" ? 6 : incidentType.id === "road_flooding" ? 5 : 4
                const overdueCount = Math.round(
                    profile.overdueBase +
                    contractorVariation +
                    typeLoad +
                    monthWave * seasonSensitivity +
                    (month.season === "winter" ? 4 * profile.winterSensitivity : summerLoad * profile.summerSensitivity)
                )
                const avgReactionHours = clamp(
                    CONTRACTOR_REACTION_BASE_HOURS[contractor.id] +
                    contractorVariation * 0.18 +
                    typeIndex * 0.65 +
                    monthWave * 0.22 +
                    (month.season === "winter" ? profile.winterSensitivity * 1.4 : profile.summerSensitivity * 0.9),
                    6,
                    22
                )
                const avgResolutionHours = clamp(
                    profile.resolutionBase +
                    contractorVariation * 0.32 +
                    typeIndex * 0.75 +
                    monthWave * 0.38 +
                    (month.season === "winter" ? profile.winterSensitivity * 1.5 : profile.summerSensitivity * 1.1),
                    2.4,
                    18
                )
                const slaPct = clamp(
                    contractor.baseEfficiencyPct -
                    profile.slaPenalty * contractorVariation -
                    typeIndex * 3.5 -
                    monthWave * 1.1 -
                    (month.season === "winter" ? profile.winterSensitivity * 4 : profile.summerSensitivity * 3),
                    35,
                    99
                )

                rows.push({
                    monthKey: month.key,
                    monthLabel: month.label,
                    monthIndex: month.index,
                    season: month.season,
                    contractorId: contractor.id,
                    incidentType: incidentType.id,
                    overdueCount,
                    avgResolutionHours: round(avgResolutionHours),
                    avgReactionHours: round(avgReactionHours, 1),
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
            const weatherPenalty = season === "winter" ? 4.5 : 1.5
            const efficiencyPct = clamp(contractor.baseEfficiencyPct - weatherPenalty - wave * 0.45 + (contractorIndex % 2 === 0 ? 1.2 : 0), 45, 99)
            const incidents = 8 + contractorIndex + wave + (season === "winter" ? 9 : 2)
            const overdueIncidents = Math.max(1, Math.round(incidents * (100 - efficiencyPct) / 100))
            const reactionHours = clamp(
                CONTRACTOR_REACTION_BASE_HOURS[contractor.id] + wave * 0.28 + (season === "winter" ? 1.2 : 0.4),
                6,
                22
            )

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
                reactionHours: round(reactionHours, 1),
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

function buildPrecipitationContractorRows(): RoadPrecipitationContractorRow[] {
    const severityByCategory: Record<PrecipitationCategoryId, number> = {
        none: 0,
        light: 1,
        moderate: 2,
        heavy: 3,
    }
    const profiles: Record<RoadContractorId, {
        base: number
        penalties: Record<PrecipitationCategoryId, number>
        winterExtra: number
        summerExtra: number
        overdueMultiplier: number
    }> = {
        sever: {
            base: 97,
            penalties: { none: 0, light: 3, moderate: 8, heavy: 15 },
            winterExtra: 2,
            summerExtra: 0,
            overdueMultiplier: 0.8,
        },
        gors: {
            base: 88,
            penalties: { none: 1, light: 6, moderate: 18, heavy: 32 },
            winterExtra: 4,
            summerExtra: 1,
            overdueMultiplier: 1.5,
        },
        yugra: {
            base: 82,
            penalties: { none: 4, light: 13, moderate: 31, heavy: 45 },
            winterExtra: 6,
            summerExtra: 2,
            overdueMultiplier: 2.2,
        },
        surgut: {
            base: 93,
            penalties: { none: 0, light: 4, moderate: 10, heavy: 24 },
            winterExtra: 3,
            summerExtra: 1,
            overdueMultiplier: 1,
        },
        magistral: {
            base: 95,
            penalties: { none: 1, light: 5, moderate: 14, heavy: 22 },
            winterExtra: 2,
            summerExtra: 0,
            overdueMultiplier: 0.9,
        },
        sibdor: {
            base: 84,
            penalties: { none: 3, light: 10, moderate: 25, heavy: 38 },
            winterExtra: 5,
            summerExtra: 2,
            overdueMultiplier: 1.8,
        },
        komfort: {
            base: 89,
            penalties: { none: 2, light: 8, moderate: 17, heavy: 36 },
            winterExtra: 3,
            summerExtra: 4,
            overdueMultiplier: 1.6,
        },
    }
    const rows: RoadPrecipitationContractorRow[] = []

    for (const season of ["summer", "winter"] satisfies RoadSeason[]) {
        for (const contractor of ROAD_CONTRACTORS) {
            const profile = profiles[contractor.id]

            for (const category of ROAD_PRECIPITATION_CATEGORIES) {
                const severity = severityByCategory[category.id]
                const seasonPenalty = season === "winter" ? profile.winterExtra : profile.summerExtra
                const reactionPenalty = Math.max(0, CONTRACTOR_REACTION_BASE_HOURS[contractor.id] - 11) * (0.7 + severity * 0.25)
                const resiliencePct = clamp(
                    profile.base - profile.penalties[category.id] - seasonPenalty - reactionPenalty,
                    20,
                    98
                )
                const weatherOverdue = Math.max(
                    0,
                    Math.round(
                        (severity + 1) * profile.overdueMultiplier +
                        (100 - resiliencePct) / (severity === 0 ? 18 : 7) +
                        (season === "winter" ? severity * 2.4 + 3 : severity * 1.2 + 1)
                    )
                )

                rows.push({
                    season,
                    categoryId: category.id,
                    contractorId: contractor.id,
                    resiliencePct: Math.round(resiliencePct),
                    weatherOverdue,
                })
            }
        }
    }

    return rows
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
        const onlinePct = clamp(94 + (index % 5), 92, 99)

        return {
            districtName,
            servicedKm: round(8.5 + index * 2.4 + (stopCoverage?.connectedStops ?? 0) * 0.8),
            intersections,
            cameras,
            onlinePct,
            avgReactionHours: round(8.5 + index * 0.7),
        }
    })
}

function buildCityIncidentRows(): RoadCityIncidentRow[] {
    const rows: RoadCityIncidentRow[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cityRows = buildCityRows()

    for (let dayOffset = 89; dayOffset >= 0; dayOffset -= 1) {
        const date = new Date(today)
        date.setDate(today.getDate() - dayOffset)
        const season = getSeasonByMonth(date.getMonth())
        const incidentTypes = ROAD_INCIDENT_TYPES.filter((incidentType) => incidentType.season === season)

        for (const [districtIndex, district] of cityRows.entries()) {
            for (const [typeIndex, incidentType] of incidentTypes.entries()) {
                const districtPressure = 1 + (districtIndex % 6)
                const dayWave = (dayOffset + districtIndex * 3 + typeIndex * 5) % 8
                const typePressure =
                    incidentType.id === "pothole" ? 5 :
                        incidentType.id === "road_flooding" ? 4 :
                            incidentType.id === "road_mud" ? 3 :
                                incidentType.id === "snow_ridge" ? 4 :
                                    incidentType.id === "snow_heap" ? 3 : 2
                const seasonalPressure = season === "winter" ? 2 : 1
                const openIncidents = Math.max(0, Math.round((districtPressure + typePressure + dayWave + seasonalPressure) / 4))
                const overdueRate = 0.16 + (districtIndex % 4) * 0.035 + typeIndex * 0.025 + (season === "winter" ? 0.05 : 0)

                rows.push({
                    date: formatDate(date),
                    districtName: district.districtName,
                    incidentType: incidentType.id,
                    openIncidents,
                    overdueIncidents: Math.max(0, Math.round(openIncidents * overdueRate)),
                })
            }
        }
    }

    return rows
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
export const roadPrecipitationContractorRows = buildPrecipitationContractorRows()
export const roadCityDistrictRows = buildCityRows()
export const roadCityIncidentRows = buildCityIncidentRows()
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
