// Демо-набор для прототипа новой аналитики остановок.
// Набор детерминированный: при каждом запуске получаются одни и те же цифры,
// поэтому серверная и клиентская отрисовка совпадают. Реальных данных здесь нет.

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
/** Asia/Yekaterinburg: UTC+5, без перехода на летнее время. */
export const CITY_OFFSET = 5 * HOUR

/** «Сейчас» демо-набора: 13.11.2026, 14:20 по Сургуту. */
export let V_NOW = Date.UTC(2026, 10, 13, 9, 20)
export let V_HISTORY_DAYS = 62

export function cityDayStart(ts: number) {
    return Math.floor((ts + CITY_OFFSET) / DAY) * DAY - CITY_OFFSET
}
export function cityHour(ts: number) {
    return Math.floor((((ts + CITY_OFFSET) % DAY) + DAY) % DAY / HOUR)
}
/** 0 — понедельник, 6 — воскресенье. */
export function cityDow(ts: number) {
    return (new Date(ts + CITY_OFFSET).getUTCDay() + 6) % 7
}

export let V_START = cityDayStart(V_NOW) - (V_HISTORY_DAYS - 1) * DAY

/** Нормативы. В прототипе условные: настоящие значения задаёт администрация. */
export const V_NORMS = {
    binHours: 4,
    tempMin: 12,
    tempMax: 28,
    humidityMax: 80,
    offlineHours: 24,
}

function mulberry32(seed: number) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function hash2(a: number, b: number) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------- справочники

export interface VDistrict {
    id: string
    name: string
    /** Сколько остановок в микрорайоне всего, включая неоснащённые. */
    cityStops: number
}

export let V_DISTRICTS: VDistrict[] = [
    { id: "c", name: "Центральный", cityStops: 21 },
    { id: "10", name: "10 микрорайон", cityStops: 14 },
    { id: "20a", name: "20А микрорайон", cityStops: 9 },
    { id: "24", name: "24 микрорайон", cityStops: 12 },
    { id: "31", name: "31 микрорайон", cityStops: 11 },
    { id: "32", name: "32 микрорайон", cityStops: 10 },
    { id: "42", name: "42 микрорайон", cityStops: 13 },
    { id: "old", name: "Старый Сургут", cityStops: 6 },
]

export let V_CITY_STOP_TOTAL = 436

export interface VStop {
    id: number
    name: string
    code: string
    direction: string
    districtId: string
    cameras: number[]
    /** Вместимость павильона; null — норматив администрация ещё не задала. */
    capacity: number | null
    busy: number
    binProne: number
    safetyProne: number
    coldProne: number
    flaky: number
    sensorFault: null | "silent" | "empty"
    glassFault: null | "stuck" | "noisy"
}

type Traits = Partial<Pick<VStop, "busy" | "binProne" | "safetyProne" | "coldProne" | "flaky" | "sensorFault" | "glassFault">>

const STOP_SEEDS: [string, string, Traits?][] = [
    ["Центральный рынок", "c", { busy: 2.2, binProne: 2.2, safetyProne: 2.4, sensorFault: "empty" }],
    ["ул. Мира", "c", { busy: 1.6, safetyProne: 1.3 }],
    ["пр. Ленина", "c", { busy: 1.8, binProne: 1.4 }],
    ["ул. Энгельса", "c", { busy: 1.1 }],
    ["Университетская", "c", { busy: 1.5, safetyProne: 1.2, glassFault: "noisy" }],
    ["ТЦ Богатырь", "c", { busy: 1.9, binProne: 1.5 }],
    ["Дом Советов", "c", { busy: 1.2 }],
    ["ул. Майская", "c", { busy: 0.8 }],
    ["ул. Гагарина", "10", { busy: 2.0, binProne: 2.6, safetyProne: 1.8 }],
    ["Дом купца Клепикова", "10", { busy: 1.0 }],
    ["ДК Строитель", "10", { busy: 1.3, binProne: 1.7 }],
    ["10 микрорайон", "10", { busy: 1.1 }],
    ["ул. Дзержинского", "10", { busy: 0.9, glassFault: "stuck" }],
    ["ул. Декабристов", "10", { busy: 0.7 }],
    ["20А микрорайон", "20a", { busy: 1.2 }],
    ["ул. Толстого", "20a", { busy: 0.8, flaky: 1.6 }],
    ["ул. Юности", "20a", { busy: 0.9, flaky: 1.8 }],
    ["пр. Комсомольский", "20a", { busy: 1.4, safetyProne: 1.3 }],
    ["24 микрорайон", "24", { busy: 1.1 }],
    ["Парк За Саймой", "24", { busy: 1.4, binProne: 1.8, safetyProne: 1.9 }],
    ["ул. Бахилова", "24", { busy: 1.0 }],
    ["ул. И. Захарова", "24", { busy: 0.9, flaky: 1.5 }],
    ["ул. Геологическая", "24", { busy: 0.4 }],
    ["Никольский", "31", { busy: 1.0, coldProne: 1.8 }],
    ["31Б микрорайон", "31", { busy: 0.9 }],
    ["Квартал Новин", "31", { busy: 0.8, sensorFault: "empty" }],
    ["ул. Школьная", "31", { busy: 0.7, sensorFault: "silent" }],
    ["ул. Каролинского", "31", { busy: 1.1, glassFault: "noisy" }],
    ["32 микрорайон", "32", { busy: 1.0 }],
    ["ТЦ Славянский", "32", { busy: 1.5, binProne: 1.4 }],
    ["ул. 30 лет Победы", "32", { busy: 1.3 }],
    ["ул. Фармана Салманова", "32", { busy: 0.8 }],
    ["Медицинский колледж", "32", { busy: 1.2, coldProne: 2.4 }],
    ["42 микрорайон", "42", { busy: 0.9, coldProne: 2.2 }],
    ["ДОСААФ", "42", { busy: 0.6, flaky: 2.5 }],
    ["Таёжный", "42", { busy: 0.5, flaky: 3.0, coldProne: 2.5 }],
    ["ул. Крылова", "42", { busy: 0.3, glassFault: "stuck" }],
    ["ул. Привокзальная", "42", { busy: 1.3, safetyProne: 1.5 }],
    ["Старый Сургут", "old", { busy: 1.2, safetyProne: 2.0 }],
    ["ул. Энергетиков", "old", { busy: 0.9 }],
    ["Речной вокзал", "old", { busy: 0.7, glassFault: "noisy" }],
    ["ул. Просвещения", "old", { busy: 0.35 }],
]

export let V_STOPS: VStop[] = STOP_SEEDS.map(([name, districtId, traits], index) => {
    const busy = traits?.busy ?? 1
    return {
        id: 601 + index * 7,
        name,
        code: `${30 + index}-24`,
        direction: index % 2 === 0 ? "в сторону центра" : "из центра",
        districtId,
        cameras: [130 + index * 3, 131 + index * 3, 132 + index * 3],
        capacity: busy >= 1.5 ? 20 : 14,
        busy,
        binProne: traits?.binProne ?? 1,
        safetyProne: traits?.safetyProne ?? 1,
        coldProne: traits?.coldProne ?? 1,
        flaky: traits?.flaky ?? 1,
        sensorFault: traits?.sensorFault ?? null,
        glassFault: traits?.glassFault ?? null,
    }
})

let STOP_BY_NAME = new Map(V_STOPS.map((stop) => [stop.name, stop]))
let STOP_BY_ID = new Map(V_STOPS.map((stop) => [stop.id, stop]))
let DISTRICT_BY_ID = new Map(V_DISTRICTS.map((district) => [district.id, district]))

export function stopById(id: number) {
    return STOP_BY_ID.get(id)
}
export function districtName(id: string) {
    return DISTRICT_BY_ID.get(id)?.name ?? "Вне микрорайонов"
}
function named(name: string) {
    const stop = STOP_BY_NAME.get(name)
    if (!stop) throw new Error(`Нет остановки ${name}`)
    return stop
}

// ---------------------------------------------------------------- события безопасности

export type SafetyType = "lying_person" | "smoking" | "abandoned_object" | "dogs_without_people" | "glass_break" | "vandalism"

/** Порядок и цвета закреплены за видом события и не меняются при фильтрации. */
export const SAFETY_TYPES: { id: SafetyType; label: string; color: string }[] = [
    { id: "lying_person", label: "Лежачий человек", color: "#2563eb" },
    { id: "smoking", label: "Курение", color: "#ea580c" },
    { id: "abandoned_object", label: "Оставленные предметы", color: "#0d9488" },
    { id: "dogs_without_people", label: "Собаки без людей", color: "#8b5cf6" },
    { id: "glass_break", label: "Разбитое стекло", color: "#db2777" },
    // Изменение поверхности по камере: наклейки, надписи (alerts.alert_type = "vandalism").
    { id: "vandalism", label: "Вандализм", color: "#a16207" },
]

export interface VSafetyEvent {
    id: string
    stopId: number
    type: SafetyType
    at: number
    /** null — эпизод ещё не закрыт. */
    durationMin: number | null
    camera: number | null
    /** null — уверенность модели не записана. */
    confidence: number | null
    verdict: "confirmed" | "rejected" | "pending" | null
}

const SAFETY_RATES: Record<SafetyType, number> = {
    lying_person: 1.3,
    smoking: 3.2,
    abandoned_object: 0.7,
    dogs_without_people: 0.25,
    glass_break: 0.22,
    vandalism: 0.18,
}

const SAFETY_HOURS: Record<SafetyType, number[]> = {
    lying_person: [3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 6, 5, 4],
    smoking: [0.3, 0.2, 0.1, 0.1, 0.2, 0.5, 2, 5, 6, 4, 3, 3, 4, 4, 3, 3, 4, 6, 6, 4, 3, 2, 1, 0.5],
    abandoned_object: [0.2, 0.1, 0.1, 0.1, 0.1, 0.3, 1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 1, 1, 0.5, 0.3],
    dogs_without_people: [2, 2, 2, 3, 4, 5, 4, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
    glass_break: [4, 5, 5, 4, 3, 1, 0.5, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.5, 0.5, 1, 1, 2, 3, 4, 4],
    vandalism: [4, 4, 4, 3, 2, 1, 0.5, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.5, 0.5, 1, 1, 2, 3, 4, 5, 5],
}

function pickWeighted(weights: number[], roll: number) {
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    let cursor = roll * total
    for (let index = 0; index < weights.length; index += 1) {
        cursor -= weights[index]
        if (cursor <= 0) return index
    }
    return weights.length - 1
}

function poisson(rate: number, rnd: () => number) {
    const limit = Math.exp(-rate)
    let count = 0
    let product = rnd()
    while (product > limit) {
        count += 1
        product *= rnd()
    }
    return count
}

function buildSafetyEvents(): VSafetyEvent[] {
    const rnd = mulberry32(20261113)
    const events: VSafetyEvent[] = []
    for (let day = 0; day < V_HISTORY_DAYS; day += 1) {
        const dayStart = V_START + day * DAY
        const weeksAgo = Math.floor((V_NOW - dayStart) / (7 * DAY))
        const dow = cityDow(dayStart)
        SAFETY_TYPES.forEach(({ id: type }, typeIndex) => {
            let rate = SAFETY_RATES[type]
            if (type === "smoking") rate *= 1 + 0.09 * weeksAgo
            if (type === "lying_person") rate *= 1 - 0.05 * Math.min(weeksAgo, 4)
            if ((type === "lying_person" || type === "glass_break") && (dow === 4 || dow === 5)) rate *= 1.6
            const count = poisson(rate, rnd)
            const weights = V_STOPS.map((stop) => stop.safetyProne * (0.5 + hash2(stop.id, typeIndex + 11)))
            for (let n = 0; n < count; n += 1) {
                const stop = V_STOPS[pickWeighted(weights, rnd())]
                const at = dayStart + pickWeighted(SAFETY_HOURS[type], rnd()) * HOUR + Math.floor(rnd() * 60) * 60_000
                if (at > V_NOW - 40 * 60_000) continue
                const durationMin = type === "lying_person"
                    ? Math.round(3 + Math.pow(rnd(), 2.2) * 95)
                    : type === "abandoned_object"
                        ? Math.round(8 + rnd() * 110)
                        : Math.round(1 + rnd() * 5)
                events.push({
                    id: `s${events.length + 1}`,
                    stopId: stop.id,
                    type,
                    at,
                    durationMin,
                    camera: stop.cameras[Math.floor(rnd() * stop.cameras.length)],
                    confidence: Math.round((0.62 + rnd() * 0.35) * 100) / 100,
                    verdict: type === "glass_break" ? (rnd() < 0.6 ? "confirmed" : "rejected") : null,
                })
            }
        })
    }

    // Сюжеты «прямо сейчас», чтобы блоки с текущим состоянием не были пустыми.
    const park = named("Парк За Саймой")
    events.push({ id: "s-now-1", stopId: park.id, type: "lying_person", at: V_NOW - 26 * 60_000, durationMin: null, camera: park.cameras[1], confidence: 0.91, verdict: null })
    const old = named("Старый Сургут")
    events.push({ id: "s-now-2", stopId: old.id, type: "glass_break", at: V_NOW - 3.2 * HOUR, durationMin: 2, camera: old.cameras[0], confidence: 0.88, verdict: "confirmed" })
    const market = named("Центральный рынок")
    events.push({ id: "s-now-3", stopId: market.id, type: "glass_break", at: V_NOW - 48 * 60_000, durationMin: 1, camera: market.cameras[2], confidence: 0.71, verdict: "pending" })

    return events.sort((a, b) => b.at - a.at)
}

export let V_SAFETY = buildSafetyEvents()

// ---------------------------------------------------------------- урны

export interface VBinEpisode {
    id: string
    stopId: number
    startAt: number
    endAt: number | null
    confirmations: number
    /** Уведомление и камера в журнале; в демо-данных их нет. */
    alertId?: string
    camera?: number | null
    /** Кадры «до» (переполнена) и «после» (убрано). */
    startImage?: string | null
    endImage?: string | null
}

const BIN_HOURS = [0.2, 0.1, 0.1, 0.1, 0.1, 0.2, 0.5, 1, 1.5, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 5.5, 5, 4, 2.5, 1, 0.5]
const BIN_OPEN_NOW: [string, number][] = [
    ["Центральный рынок", 9.1],
    ["ул. Гагарина", 5.6],
    ["ДК Строитель", 2.7],
    ["Парк За Саймой", 0.6],
]

function buildBinEpisodes(): VBinEpisode[] {
    const rnd = mulberry32(4401)
    const episodes: VBinEpisode[] = []
    const openStops = new Map(BIN_OPEN_NOW.map(([name, hoursAgo]) => [named(name).id, V_NOW - hoursAgo * HOUR]))

    for (const stop of V_STOPS) {
        let busyUntil = 0
        for (let day = 0; day < V_HISTORY_DAYS; day += 1) {
            const dayStart = V_START + day * DAY
            const dow = cityDow(dayStart)
            const chance = 0.055 * stop.binProne * (dow >= 4 ? 1.5 : 1)
            if (rnd() >= chance) continue
            const startAt = dayStart + pickWeighted(BIN_HOURS, rnd()) * HOUR + Math.floor(rnd() * 60) * 60_000
            const weeksAgo = Math.floor((V_NOW - dayStart) / (7 * DAY))
            const hours = Math.min(22, (1.1 - Math.log(1 - rnd()) * 2.3 * Math.sqrt(stop.binProne)) * (1 + 0.07 * weeksAgo))
            const endAt = startAt + hours * HOUR
            const openFrom = openStops.get(stop.id)
            if (startAt < busyUntil || endAt > V_NOW - 30 * 60_000) continue
            if (openFrom !== undefined && endAt > openFrom - HOUR) continue
            busyUntil = endAt + 2 * HOUR
            episodes.push({ id: `b${episodes.length + 1}`, stopId: stop.id, startAt, endAt, confirmations: 1 + Math.floor(hours * (1.2 + rnd())) })
        }
    }
    for (const [stopId, startAt] of openStops) {
        episodes.push({ id: `b-open-${stopId}`, stopId, startAt, endAt: null, confirmations: 1 + Math.floor(((V_NOW - startAt) / HOUR) * 1.6) })
    }
    return episodes.sort((a, b) => b.startAt - a.startAt)
}

export let V_BINS = buildBinEpisodes()

// ---------------------------------------------------------------- оборудование

export type VDeviceType = "camera" | "controller"
export type VOutageCause = "stop" | "device" | "network"

export const OUTAGE_CAUSES: { id: VOutageCause; label: string; hint: string; phrase: string; color: string }[] = [
    { id: "stop", label: "Вся остановка", hint: "связь или питание павильона", phrase: "недоступна вся остановка", color: "#2563eb" },
    { id: "device", label: "Одно устройство", hint: "неисправно само устройство", phrase: "отказывает одно устройство", color: "#ea580c" },
    { id: "network", label: "Несколько остановок", hint: "авария на сети", phrase: "пропадают сразу несколько остановок", color: "#0d9488" },
]

export interface VDevice {
    key: string
    stopId: number
    type: VDeviceType
    label: string
}

export interface VOutage {
    id: string
    stopId: number
    deviceKey: string
    device: VDeviceType
    label: string
    startAt: number
    endAt: number | null
    cause: VOutageCause
}

export let V_DEVICES: VDevice[] = V_STOPS.flatMap((stop) => [
    ...stop.cameras.map((camera) => ({ key: `cam-${camera}`, stopId: stop.id, type: "camera" as const, label: `Камера ${camera}` })),
    { key: `ctl-${stop.id}`, stopId: stop.id, type: "controller" as const, label: "Контроллер" },
])

const NETWORK_EVENTS: { daysAgo: number; hours: number; districts: string[] }[] = [
    { daysAgo: 9.4, hours: 2.6, districts: ["31", "32"] },
    { daysAgo: 23.2, hours: 1.1, districts: ["c", "10", "old"] },
    { daysAgo: 40.5, hours: 3.4, districts: ["42", "24"] },
]

const STOPS_OFFLINE_NOW: [string, number][] = [
    ["Таёжный", 9.2 * 24],
    ["ДОСААФ", 31],
    ["ул. Юности", 3.1],
]

const DEVICES_OFFLINE_NOW: [string, number, number][] = [
    // остановка, номер устройства в списке (0–2 камеры, 3 контроллер), часов назад
    ["ул. Мира", 1, 6.3 * 24],
    ["Никольский", 0, 2.4 * 24],
    ["ТЦ Славянский", 2, 27],
    ["ул. Бахилова", 1, 5],
    ["10 микрорайон", 0, 0.7],
    ["ул. Каролинского", 3, 1.6 * 24],
]

function buildOutages(): VOutage[] {
    const rnd = mulberry32(90817)
    const raw: Omit<VOutage, "id">[] = []
    const devicesByStop = new Map<number, VDevice[]>()
    for (const device of V_DEVICES) {
        devicesByStop.set(device.stopId, [...(devicesByStop.get(device.stopId) ?? []), device])
    }
    const push = (device: VDevice, startAt: number, endAt: number | null, cause: VOutageCause) => {
        raw.push({ stopId: device.stopId, deviceKey: device.key, device: device.type, label: device.label, startAt, endAt, cause })
    }

    for (const event of NETWORK_EVENTS) {
        const startAt = V_NOW - event.daysAgo * DAY
        for (const stop of V_STOPS.filter((item) => event.districts.includes(item.districtId))) {
            for (const device of devicesByStop.get(stop.id) ?? []) push(device, startAt + Math.floor(rnd() * 4) * 60_000, startAt + event.hours * HOUR, "network")
        }
    }

    for (const stop of V_STOPS) {
        const devices = devicesByStop.get(stop.id) ?? []
        for (let day = 0; day < V_HISTORY_DAYS; day += 1) {
            const dayStart = V_START + day * DAY
            if (rnd() < 0.012 * stop.flaky) {
                const startAt = dayStart + rnd() * DAY
                const hours = Math.min(60, 0.5 - Math.log(1 - rnd()) * 6 * Math.sqrt(stop.flaky))
                for (const device of devices) push(device, startAt, startAt + hours * HOUR, "stop")
            }
            for (const device of devices) {
                if (rnd() < 0.012) {
                    const startAt = dayStart + rnd() * DAY
                    push(device, startAt, startAt + (0.3 - Math.log(1 - rnd()) * 2.5) * HOUR, "device")
                }
                if (rnd() < 0.035) {
                    const startAt = dayStart + rnd() * DAY
                    push(device, startAt, startAt + (2 + rnd() * 7) * 60_000, "device")
                }
            }
        }
    }

    // Открытые сейчас отключения.
    const openFrom = new Map<string, number>()
    for (const [name, hoursAgo] of STOPS_OFFLINE_NOW) {
        for (const device of devicesByStop.get(named(name).id) ?? []) {
            openFrom.set(device.key, V_NOW - hoursAgo * HOUR)
            push(device, V_NOW - hoursAgo * HOUR, null, "stop")
        }
    }
    for (const [name, deviceIndex, hoursAgo] of DEVICES_OFFLINE_NOW) {
        const device = (devicesByStop.get(named(name).id) ?? [])[deviceIndex]
        if (!device) continue
        openFrom.set(device.key, V_NOW - hoursAgo * HOUR)
        push(device, V_NOW - hoursAgo * HOUR, null, "device")
    }

    // Убираем пересечения: у одного устройства отключения не накладываются друг на друга.
    const byDevice = new Map<string, Omit<VOutage, "id">[]>()
    for (const outage of raw) {
        const open = openFrom.get(outage.deviceKey)
        if (outage.endAt !== null) {
            if (outage.endAt > V_NOW - 10 * 60_000) continue
            if (open !== undefined && outage.endAt > open - HOUR) continue
        }
        byDevice.set(outage.deviceKey, [...(byDevice.get(outage.deviceKey) ?? []), outage])
    }
    const merged: Omit<VOutage, "id">[] = []
    for (const list of byDevice.values()) {
        list.sort((a, b) => a.startAt - b.startAt)
        let last: Omit<VOutage, "id"> | null = null
        for (const outage of list) {
            if (last && last.endAt !== null && outage.startAt <= last.endAt) {
                if (outage.endAt === null || outage.endAt > last.endAt) last.endAt = outage.endAt
                continue
            }
            last = { ...outage }
            merged.push(last)
        }
    }
    return merged
        .sort((a, b) => b.startAt - a.startAt)
        .map((outage, index) => ({ ...outage, id: `o${index + 1}` }))
}

export let V_OUTAGES = buildOutages()

let CONTROLLER_OUTAGES = new Map<number, VOutage[]>()
let STOP_WIDE_OUTAGES = new Map<number, VOutage[]>()
function indexOutages() {
    CONTROLLER_OUTAGES = new Map()
    STOP_WIDE_OUTAGES = new Map()
    for (const outage of V_OUTAGES) {
        if (outage.device === "controller") {
            CONTROLLER_OUTAGES.set(outage.stopId, [...(CONTROLLER_OUTAGES.get(outage.stopId) ?? []), outage])
            if (outage.cause !== "device") STOP_WIDE_OUTAGES.set(outage.stopId, [...(STOP_WIDE_OUTAGES.get(outage.stopId) ?? []), outage])
        }
    }
}
indexOutages()

function covered(list: VOutage[] | undefined, ts: number) {
    if (!list) return false
    return list.some((outage) => outage.startAt <= ts && (outage.endAt === null || outage.endAt > ts))
}

/** Остановка целиком без связи: нет ни видео, ни показаний. */
export function stopOfflineAt(stopId: number, ts: number) {
    return covered(STOP_WIDE_OUTAGES.get(stopId), ts)
}

// ---------------------------------------------------------------- климат

const DIURNAL = [-2.6, -2.9, -3.1, -3.2, -3.1, -2.8, -2.2, -1.4, -0.4, 0.7, 1.7, 2.5, 3.0, 3.2, 3.1, 2.7, 2.0, 1.2, 0.4, -0.3, -0.9, -1.5, -1.9, -2.3]

export function outdoorTempAt(ts: number) {
    const dayFloat = (ts - V_START) / DAY
    const dayIndex = Math.floor(dayFloat)
    const frac = dayFloat - dayIndex
    const wave = (index: number) => (hash2(index, 7) - 0.5) * 9
    const weather = wave(dayIndex) * (1 - frac) + wave(dayIndex + 1) * frac
    return -2 - dayFloat * 0.19 + weather + DIURNAL[cityHour(ts)]
}

interface ClimateWindow {
    from: number
    to: number
    kind: "cold" | "wet"
}

const COLD_NOW: [string, number][] = [
    ["Никольский", 26],
    ["Медицинский колледж", 7],
    ["42 микрорайон", 3],
    ["ул. Крылова", 1.5],
]
const WET_NOW: [string, number][] = [
    ["Речной вокзал", 5],
    ["ул. Энергетиков", 2.2],
]

function buildClimateWindows() {
    const rnd = mulberry32(73311)
    const windows = new Map<number, ClimateWindow[]>()
    const add = (stopId: number, window: ClimateWindow) => windows.set(stopId, [...(windows.get(stopId) ?? []), window])
    const powerDip = cityDayStart(V_NOW) - 6 * DAY + 18 * HOUR

    V_STOPS.forEach((stop, index) => {
        for (let day = 0; day < V_HISTORY_DAYS - 1; day += 1) {
            if (rnd() < 0.02 * stop.coldProne) {
                const from = V_START + day * DAY + rnd() * DAY
                add(stop.id, { from, to: Math.min(from + (3 + rnd() * 25) * HOUR, V_NOW - 2 * DAY), kind: "cold" })
            }
            if (rnd() < 0.012) {
                const from = V_START + day * DAY + rnd() * DAY
                add(stop.id, { from, to: Math.min(from + (2 + rnd() * 9) * HOUR, V_NOW - 2 * DAY), kind: "wet" })
            }
        }
        // Общее отключение электричества шесть дней назад: видно всплеском на графике.
        if (index % 3 === 0) add(stop.id, { from: powerDip, to: powerDip + (3 + (index % 4) * 0.5) * HOUR, kind: "cold" })
    })
    for (const [name, hoursAgo] of COLD_NOW) add(named(name).id, { from: V_NOW - hoursAgo * HOUR, to: V_NOW + DAY, kind: "cold" })
    for (const [name, hoursAgo] of WET_NOW) add(named(name).id, { from: V_NOW - hoursAgo * HOUR, to: V_NOW + DAY, kind: "wet" })
    return windows
}

const CLIMATE_WINDOWS = buildClimateWindows()

export interface VClimate {
    /** null — показаний нет: датчик молчит или остановка без связи. */
    temp: number | null
    humidity: number | null
}

export function climateAt(stop: VStop, ts: number): VClimate {
    if (live) return live.climateAt(stop, ts)
    if (stop.sensorFault === "silent" && ts > V_NOW - 20 * DAY) return { temp: null, humidity: null }
    if (stop.sensorFault === "empty" && ts > V_NOW - 27 * DAY) return { temp: null, humidity: null }
    if (covered(CONTROLLER_OUTAGES.get(stop.id), ts)) return { temp: null, humidity: null }

    const hourIndex = Math.floor(ts / HOUR)
    const outdoor = outdoorTempAt(ts)
    const windows = CLIMATE_WINDOWS.get(stop.id)
    const cold = windows?.some((window) => window.kind === "cold" && window.from <= ts && window.to > ts)
    const wet = windows?.some((window) => window.kind === "wet" && window.from <= ts && window.to > ts)
    const temp = cold
        ? outdoor + 6 + hash2(stop.id, hourIndex) * 2
        : 17.2 + 0.12 * outdoor + (hash2(stop.id, hourIndex) - 0.5) * 1.2
    const humidity = (wet ? 83 : 52) + (hash2(stop.id + 3, hourIndex) - 0.5) * (wet ? 8 : 16)
    return { temp: Math.round(temp * 10) / 10, humidity: Math.round(humidity) }
}

export function climateOutOfNorm(value: VClimate) {
    if (value.temp !== null && (value.temp < V_NORMS.tempMin || value.temp > V_NORMS.tempMax)) return true
    if (value.humidity !== null && value.humidity > V_NORMS.humidityMax) return true
    return false
}

// ---------------------------------------------------------------- загруженность

const WEEKDAY_PROFILE = [0.05, 0.03, 0.02, 0.02, 0.05, 0.2, 0.6, 1.5, 1.9, 1.2, 0.8, 0.8, 0.9, 0.9, 0.8, 0.9, 1.2, 1.7, 1.8, 1.2, 0.8, 0.5, 0.3, 0.12]
const WEEKEND_PROFILE = [0.08, 0.05, 0.03, 0.02, 0.03, 0.08, 0.2, 0.4, 0.6, 0.8, 1.0, 1.1, 1.15, 1.1, 1.0, 0.95, 0.9, 0.85, 0.8, 0.65, 0.5, 0.4, 0.25, 0.15]

/** Среднее число людей на остановке за час, начинающийся в ts. */
export function loadAt(stop: VStop, ts: number) {
    if (live) return live.loadAt(stop, ts)
    const profile = cityDow(ts) >= 5 ? WEEKEND_PROFILE : WEEKDAY_PROFILE
    const hourIndex = Math.floor(ts / HOUR)
    return 3.1 * stop.busy * profile[cityHour(ts)] * (0.75 + 0.5 * hash2(stop.id, hourIndex + 17))
}

/** Наибольшее число людей на остановке за тот же час. */
export function peakAt(stop: VStop, ts: number) {
    if (live) return live.peakAt(stop, ts)
    const hourIndex = Math.floor(ts / HOUR)
    return Math.round(loadAt(stop, ts) * (1.3 + 0.5 * hash2(stop.id + 1, hourIndex)))
}

// ---------------------------------------------------------------- форматирование

function pad(value: number) {
    return String(value).padStart(2, "0")
}

export function fmtDateTime(ts: number) {
    const date = new Date(ts + CITY_OFFSET)
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}
export function fmtDay(ts: number) {
    const date = new Date(ts + CITY_OFFSET)
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}`
}
export function fmtTime(ts: number) {
    const date = new Date(ts + CITY_OFFSET)
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}
export function fmtDuration(ms: number) {
    const minutes = Math.max(0, Math.round(ms / 60_000))
    if (minutes < 60) return `${minutes} мин`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return minutes % 60 === 0 ? `${hours} ч` : `${hours} ч ${minutes % 60} мин`
    const days = Math.floor(hours / 24)
    return hours % 24 === 0 ? `${days} дн` : `${days} дн ${hours % 24} ч`
}
export function fmtInt(value: number) {
    return Math.round(value).toLocaleString("ru-RU")
}
export function fmtNum(value: number, digits = 1) {
    return value.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}
export function plural(count: number, forms: [string, string, string]) {
    const mod10 = Math.abs(count) % 10
    const mod100 = Math.abs(count) % 100
    if (mod10 === 1 && mod100 !== 11) return forms[0]
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
    return forms[2]
}
export function median(values: number[]) {
    if (values.length === 0) return 0
    const sorted = values.slice().sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
export function overlapMs(aFrom: number, aTo: number, from: number, to: number) {
    return Math.max(0, Math.min(aTo, to) - Math.max(aFrom, from))
}
export const DOW_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

// ---------------------------------------------------------------- живые данные

/**
 * Набор данных из базы. Пока он не установлен, модуль отдаёт детерминированные демо-данные
 * (страница прототипа). Вкладка «Аналитика» ставит живой набор до первого рисования разделов.
 */
export interface VisionDataset {
    now: number
    historyDays: number
    districts: VDistrict[]
    cityStopTotal: number
    stops: VStop[]
    safety: VSafetyEvent[]
    bins: VBinEpisode[]
    devices: VDevice[]
    outages: VOutage[]
    norms: Partial<typeof V_NORMS>
    climateAt: (stop: VStop, ts: number) => VClimate
    loadAt: (stop: VStop, ts: number) => number
    /** Есть ли у остановки подсчёт людей (камера с аналитикой загруженности). */
    hasLoad: (stop: VStop) => boolean
    peakAt: (stop: VStop, ts: number) => number
}

let live: VisionDataset | null = null

/** Есть ли у остановки живые показания загруженности или климата — для пустых состояний. */
/** У остановки считают людей: в демо — у всех, на живых данных — где есть окна загруженности. */
export function hasLoadData(stop: VStop) {
    return live ? live.hasLoad(stop) : true
}

export function isLiveVisionData() {
    return live !== null
}

export function installVisionDataset(dataset: VisionDataset) {
    live = dataset
    V_NOW = dataset.now
    V_HISTORY_DAYS = dataset.historyDays
    V_START = cityDayStart(V_NOW) - (V_HISTORY_DAYS - 1) * DAY
    Object.assign(V_NORMS, dataset.norms)
    V_DISTRICTS = dataset.districts
    V_CITY_STOP_TOTAL = dataset.cityStopTotal
    V_STOPS = dataset.stops
    V_SAFETY = dataset.safety.slice().sort((a, b) => b.at - a.at)
    V_BINS = dataset.bins.slice().sort((a, b) => b.startAt - a.startAt)
    V_DEVICES = dataset.devices
    V_OUTAGES = dataset.outages
    STOP_BY_NAME = new Map(V_STOPS.map((stop) => [stop.name, stop]))
    STOP_BY_ID = new Map(V_STOPS.map((stop) => [stop.id, stop]))
    DISTRICT_BY_ID = new Map(V_DISTRICTS.map((district) => [district.id, district]))
    indexOutages()
}
