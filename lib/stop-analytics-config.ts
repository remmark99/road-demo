export const STOP_CITY_TOTAL = 436
export const STOP_EQUIPMENT_PLAN_TARGET = 100
export const STOP_EQUIPPED_COUNT = 10
export const STOP_OPERATIONAL_COUNT = 10
export const STOP_LIVE_CAMERA_COUNT = 30

export interface StopDistrictCoverageEstimate {
    districtName: string
    connectedStops: number
    connectedStopNames: string[]
    estimatedTotalMin: number
    estimatedTotalMax: number
    estimatedTotalLabel: string
    coverageMinPct: number
    coverageMaxPct: number
    coverageMidPct: number
    coverageLabel: string
}

export interface StopMonitoredComplex {
    cameraFrom: number
    cameraTo: number
    locationId: string
    stopName: string
    districtName: string
}

export const STOP_MONITORED_COMPLEXES: StopMonitoredComplex[] = [
    {
        cameraFrom: 130,
        cameraTo: 132,
        locationId: "73-24",
        stopName: "20А микрорайон",
        districtName: "20А микрорайон",
    },
    {
        cameraFrom: 133,
        cameraTo: 135,
        locationId: "68-24",
        stopName: "ул. Гагарина",
        districtName: "10 микрорайон",
    },
    {
        cameraFrom: 136,
        cameraTo: 138,
        locationId: "67-24",
        stopName: "Дом Купца Клепикова",
        districtName: "10 микрорайон",
    },
    {
        cameraFrom: 139,
        cameraTo: 141,
        locationId: "55-24",
        stopName: "ДК Строитель",
        districtName: "10 микрорайон",
    },
    {
        cameraFrom: 142,
        cameraTo: 144,
        locationId: "30-23",
        stopName: "Парк За Саймой",
        districtName: "24 микрорайон",
    },
    {
        cameraFrom: 145,
        cameraTo: 147,
        locationId: "66-24",
        stopName: "10 Микрорайон",
        districtName: "10 микрорайон",
    },
    {
        cameraFrom: 148,
        cameraTo: 150,
        locationId: "69-24",
        stopName: "Старый Сургут",
        districtName: "Старый Сургут",
    },
    {
        cameraFrom: 151,
        cameraTo: 153,
        locationId: "36-23",
        stopName: "Никольский",
        districtName: "31 микрорайон",
    },
    {
        cameraFrom: 154,
        cameraTo: 156,
        locationId: "47-23",
        stopName: "Бахилова",
        districtName: "24 микрорайон",
    },
    {
        cameraFrom: 157,
        cameraTo: 159,
        locationId: "50-23",
        stopName: "24 микрорайон",
        districtName: "24 микрорайон",
    },
]

function buildCoverageEstimate(params: {
    districtName: string
    connectedStops: number
    connectedStopNames: string[]
    estimatedTotalMin: number
    estimatedTotalMax: number
}): StopDistrictCoverageEstimate {
    const coverageMinPct = Math.floor((params.connectedStops / params.estimatedTotalMax) * 100)
    const coverageMaxPct = Math.round((params.connectedStops / params.estimatedTotalMin) * 100)
    const coverageMidPct = Math.round((coverageMinPct + coverageMaxPct) / 2)
    const estimatedTotalLabel = params.estimatedTotalMin === params.estimatedTotalMax
        ? `${params.estimatedTotalMin}`
        : `${params.estimatedTotalMin}-${params.estimatedTotalMax}`

    return {
        ...params,
        estimatedTotalLabel,
        coverageMinPct,
        coverageMaxPct,
        coverageMidPct,
        coverageLabel: `${coverageMinPct}-${coverageMaxPct}%`,
    }
}

export const STOP_DISTRICT_COVERAGE_ESTIMATES: StopDistrictCoverageEstimate[] = [
    buildCoverageEstimate({
        districtName: "20А микрорайон",
        connectedStops: 1,
        connectedStopNames: ["20А микрорайон"],
        estimatedTotalMin: 4,
        estimatedTotalMax: 6,
    }),
    buildCoverageEstimate({
        districtName: "24 микрорайон",
        connectedStops: 2,
        connectedStopNames: ["24 микрорайон", "Парк За Саймой"],
        estimatedTotalMin: 8,
        estimatedTotalMax: 12,
    }),
    buildCoverageEstimate({
        districtName: "10 микрорайон",
        connectedStops: 4,
        connectedStopNames: ["Гагарина", "Купца Клепикова", "ДК Строитель", "10 мкр"],
        estimatedTotalMin: 10,
        estimatedTotalMax: 15,
    }),
    buildCoverageEstimate({
        districtName: "31 микрорайон",
        connectedStops: 1,
        connectedStopNames: ["Никольский"],
        estimatedTotalMin: 5,
        estimatedTotalMax: 8,
    }),
    buildCoverageEstimate({
        districtName: "Старый Сургут",
        connectedStops: 1,
        connectedStopNames: ["Старый Сургут"],
        estimatedTotalMin: 2,
        estimatedTotalMax: 4,
    }),
]

export function getStopDistrictCoverageEstimate(districtName: string) {
    return STOP_DISTRICT_COVERAGE_ESTIMATES.find((estimate) => estimate.districtName === districtName) ?? null
}

export function getStopComplexByLocationId(locationId: string | null | undefined) {
    if (!locationId) return null

    return STOP_MONITORED_COMPLEXES.find((complex) => complex.locationId === locationId) ?? null
}

export function getStopComplexByCameraIndex(cameraIndex: number | null | undefined) {
    if (cameraIndex === null || cameraIndex === undefined) return null

    return STOP_MONITORED_COMPLEXES.find((complex) => (
        cameraIndex >= complex.cameraFrom && cameraIndex <= complex.cameraTo
    )) ?? null
}

export const STOP_SAFETY_ALERT_TYPES = [
    "lying_person",
    "smoking",
    "dogs_without_people",
] as const

export type StopSafetyAlertType = (typeof STOP_SAFETY_ALERT_TYPES)[number]

export const STOP_SAFETY_ALERT_LABELS: Record<StopSafetyAlertType, string> = {
    lying_person: "Лежачий человек",
    smoking: "Курение",
    dogs_without_people: "Бездомные собаки",
}
