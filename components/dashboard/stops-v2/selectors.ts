// Расчёты показателей для новой аналитики остановок.
// Сейчас считают по демо-набору; при подключении базы меняется только источник строк.

import {
    DAY,
    HOUR,
    V_BINS,
    V_DEVICES,
    V_NORMS,
    V_NOW,
    V_OUTAGES,
    V_SAFETY,
    cityDayStart,
    climateAt,
    climateOutOfNorm,
    fmtDay,
    fmtNum,
    fmtTime,
    loadAt,
    median,
    overlapMs,
    stopOfflineAt,
    type SafetyType,
    type VBinEpisode,
    type VDeviceType,
    type VOutage,
    type VSafetyEvent,
    type VStop,
} from "@/lib/mock/stop-analytics-vision-data"

export interface Scope {
    from: number
    to: number
    prevFrom: number
    prevTo: number
    stops: VStop[]
    ids: Set<number>
    /** «к прошлой неделе» и т. п. — подпись под изменением показателя. */
    prevLabel: string
    /** Период до двух суток показывается по часам, длиннее — по дням. */
    hourly: boolean
}

export interface Bucket {
    from: number
    to: number
    label: string
}

export function buildBuckets(scope: Pick<Scope, "from" | "to" | "hourly">): Bucket[] {
    const buckets: Bucket[] = []
    if (scope.hourly) {
        const multiDay = scope.to - scope.from > DAY
        for (let ts = Math.floor(scope.from / HOUR) * HOUR; ts < scope.to; ts += HOUR) {
            buckets.push({ from: ts, to: ts + HOUR, label: multiDay ? `${fmtDay(ts)} ${fmtTime(ts)}` : fmtTime(ts) })
        }
        return buckets
    }
    for (let ts = cityDayStart(scope.from); ts < scope.to; ts += DAY) {
        buckets.push({ from: ts, to: ts + DAY, label: fmtDay(ts) })
    }
    return buckets
}

// ---------------------------------------------------------------- безопасность

export function safetyIn(ids: Set<number>, from: number, to: number, types?: Set<SafetyType>): VSafetyEvent[] {
    return V_SAFETY.filter((event) => event.at >= from && event.at < to && ids.has(event.stopId) && (!types || types.has(event.type)))
}

// ---------------------------------------------------------------- урны

export function binDurationMs(episode: VBinEpisode) {
    return (episode.endAt ?? V_NOW) - episode.startAt
}

export function binsIn(ids: Set<number>, from: number, to: number) {
    return V_BINS.filter((episode) => episode.startAt >= from && episode.startAt < to && ids.has(episode.stopId))
}

export function binsOpenNow(ids: Set<number>) {
    return V_BINS.filter((episode) => episode.endAt === null && ids.has(episode.stopId)).sort((a, b) => a.startAt - b.startAt)
}

export function binStats(ids: Set<number>, from: number, to: number) {
    const episodes = binsIn(ids, from, to)
    const closed = episodes.filter((episode) => episode.endAt !== null)
    const durations = closed.map(binDurationMs)
    const normMs = V_NORMS.binHours * HOUR
    const inNorm = closed.filter((episode) => binDurationMs(episode) <= normMs).length
    return {
        episodes,
        count: episodes.length,
        closedCount: closed.length,
        medianMs: median(durations),
        inNormPct: closed.length ? (inNorm / closed.length) * 100 : 100,
        totalMs: episodes.reduce((sum, episode) => sum + binDurationMs(episode), 0),
    }
}

// ---------------------------------------------------------------- оборудование

export function outageEnd(outage: VOutage) {
    return outage.endAt ?? V_NOW
}

export function outageDurationMs(outage: VOutage) {
    return outageEnd(outage) - outage.startAt
}

export function devicesOf(ids: Set<number>, type?: VDeviceType) {
    return V_DEVICES.filter((device) => ids.has(device.stopId) && (!type || device.type === type))
}

export function outagesTouching(ids: Set<number>, from: number, to: number, type?: VDeviceType) {
    return V_OUTAGES.filter((outage) => ids.has(outage.stopId) && (!type || outage.device === type) && outage.startAt < to && outageEnd(outage) > from)
}

export function outagesStarted(ids: Set<number>, from: number, to: number, type?: VDeviceType) {
    return V_OUTAGES.filter((outage) => ids.has(outage.stopId) && (!type || outage.device === type) && outage.startAt >= from && outage.startAt < to)
}

export function openOutages(ids: Set<number>, type?: VDeviceType) {
    return V_OUTAGES.filter((outage) => outage.endAt === null && ids.has(outage.stopId) && (!type || outage.device === type))
}

/** Доля времени, когда оборудование было на связи, в процентах. */
export function availabilityPct(ids: Set<number>, from: number, to: number, type?: VDeviceType) {
    const devices = devicesOf(ids, type).length
    const span = Math.max(0, Math.min(to, V_NOW) - from)
    if (devices === 0 || span === 0) return 100
    const down = outagesTouching(ids, from, to, type).reduce((sum, outage) => sum + overlapMs(outage.startAt, outageEnd(outage), from, Math.min(to, V_NOW)), 0)
    return Math.max(0, 100 - (down / (devices * span)) * 100)
}

/** Среднее время восстановления по закрытым отключениям дольше 10 минут. */
export function meanRepairMs(ids: Set<number>, from: number, to: number, type?: VDeviceType) {
    const closed = outagesStarted(ids, from, to, type).filter((outage) => outage.endAt !== null && outageDurationMs(outage) >= 10 * 60_000)
    if (closed.length === 0) return 0
    return closed.reduce((sum, outage) => sum + outageDurationMs(outage), 0) / closed.length
}

// ---------------------------------------------------------------- климат

export interface ClimateSummary {
    /** Часы вне нормы по остановкам. */
    outHours: Map<number, number>
    minTemp: Map<number, number>
    /** Сколько остановок было вне нормы в каждом часе периода. */
    perHour: { ts: number; stops: number }[]
    /** Моменты, когда очередная остановка вышла за норму. */
    starts: number[]
    totalHours: number
}

const climateCache = new Map<string, ClimateSummary>()

export function climateSummary(stops: VStop[], from: number, to: number): ClimateSummary {
    const key = `${from}:${to}:${stops.length}:${stops[0]?.id ?? 0}:${stops[stops.length - 1]?.id ?? 0}`
    const cached = climateCache.get(key)
    if (cached) return cached

    const outHours = new Map<number, number>()
    const minTemp = new Map<number, number>()
    const perHour: { ts: number; stops: number }[] = []
    const starts: number[] = []
    let totalHours = 0
    const end = Math.min(to, V_NOW)
    const first = Math.ceil(from / HOUR) * HOUR
    const wasOut = new Map<number, boolean>(stops.map((stop) => [stop.id, climateOutOfNorm(climateAt(stop, first - HOUR))]))
    for (let ts = first; ts < end; ts += HOUR) {
        let outNow = 0
        for (const stop of stops) {
            const value = climateAt(stop, ts)
            if (value.temp !== null) {
                const known = minTemp.get(stop.id)
                if (known === undefined || value.temp < known) minTemp.set(stop.id, value.temp)
            }
            const out = climateOutOfNorm(value)
            if (out) {
                outNow += 1
                totalHours += 1
                outHours.set(stop.id, (outHours.get(stop.id) ?? 0) + 1)
                if (!wasOut.get(stop.id)) starts.push(ts)
            }
            wasOut.set(stop.id, out)
        }
        perHour.push({ ts, stops: outNow })
    }
    const result = { outHours, minTemp, perHour, starts, totalHours }
    if (climateCache.size > 24) climateCache.clear()
    climateCache.set(key, result)
    return result
}

export interface ClimateNowRow {
    stop: VStop
    temp: number | null
    humidity: number | null
    out: boolean
    /** С какого момента показания вне нормы. */
    since: number | null
    reason: string
}

export function climateNow(stops: VStop[]): ClimateNowRow[] {
    return stops.map((stop) => {
        const value = climateAt(stop, V_NOW)
        const out = climateOutOfNorm(value)
        let since: number | null = null
        if (out) {
            since = Math.floor(V_NOW / HOUR) * HOUR
            for (let step = 1; step <= 96; step += 1) {
                const ts = Math.floor(V_NOW / HOUR) * HOUR - step * HOUR
                if (!climateOutOfNorm(climateAt(stop, ts))) break
                since = ts
            }
        }
        let reason = ""
        if (value.temp !== null && value.temp < V_NORMS.tempMin) reason = `ниже нормы +${V_NORMS.tempMin} °C`
        else if (value.temp !== null && value.temp > V_NORMS.tempMax) reason = `выше нормы +${V_NORMS.tempMax} °C`
        else if (value.humidity !== null && value.humidity > V_NORMS.humidityMax) reason = `влажность выше ${V_NORMS.humidityMax} %`
        return { stop, temp: value.temp, humidity: value.humidity, out, since, reason }
    })
}

export function fmtTemp(value: number | null) {
    if (value === null) return "—"
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmtNum(Math.abs(value))} °C`
}

// ---------------------------------------------------------------- загруженность

export function peopleNow(stops: VStop[]) {
    return stops.reduce((sum, stop) => sum + (stopOfflineAt(stop.id, V_NOW) ? 0 : Math.round(loadAt(stop, V_NOW))), 0)
}

export function averageLoad(stop: VStop, from: number, to: number) {
    let sum = 0
    let hours = 0
    for (let ts = Math.ceil(from / HOUR) * HOUR; ts < Math.min(to, V_NOW); ts += HOUR) {
        sum += loadAt(stop, ts)
        hours += 1
    }
    return hours ? sum / hours : 0
}

// ---------------------------------------------------------------- что требует внимания

export type AttentionKind = "equipment" | "clean" | "safety" | "climate"

export interface AttentionItem {
    id: string
    kind: AttentionKind
    severity: "high" | "attention"
    title: string
    detail: string
    stopId: number
    since: number
}

export function attentionNow(stops: VStop[]): AttentionItem[] {
    const ids = new Set(stops.map((stop) => stop.id))
    const items: AttentionItem[] = []

    const open = openOutages(ids)
    const byStop = new Map<number, VOutage[]>()
    for (const outage of open) byStop.set(outage.stopId, [...(byStop.get(outage.stopId) ?? []), outage])
    for (const [stopId, list] of byStop) {
        const wholeStop = list.filter((outage) => outage.cause !== "device")
        if (wholeStop.length > 0) {
            const since = Math.min(...wholeStop.map((outage) => outage.startAt))
            items.push({
                id: `eq-stop-${stopId}`,
                kind: "equipment",
                severity: V_NOW - since > V_NORMS.offlineHours * HOUR ? "high" : "attention",
                title: "Нет связи со всей остановкой",
                detail: "Вероятно, связь или питание павильона",
                stopId,
                since,
            })
            continue
        }
        for (const outage of list) {
            if (V_NOW - outage.startAt < V_NORMS.offlineHours * HOUR) continue
            items.push({
                id: `eq-${outage.id}`,
                kind: "equipment",
                severity: "attention",
                title: `${outage.label} не в сети дольше суток`,
                detail: "Остальное оборудование остановки работает",
                stopId,
                since: outage.startAt,
            })
        }
    }

    for (const episode of binsOpenNow(ids)) {
        const duration = V_NOW - episode.startAt
        if (duration <= V_NORMS.binHours * HOUR) continue
        items.push({
            id: `bin-${episode.id}`,
            kind: "clean",
            severity: duration > 2 * V_NORMS.binHours * HOUR ? "high" : "attention",
            title: "Урна переполнена дольше нормы",
            detail: `Норматив уборки ${V_NORMS.binHours} ч`,
            stopId: episode.stopId,
            since: episode.startAt,
        })
    }

    for (const row of climateNow(stops)) {
        if (!row.out || row.since === null || V_NOW - row.since < HOUR) continue
        const cold = row.temp !== null && row.temp < V_NORMS.tempMin
        items.push({
            id: `cl-${row.stop.id}`,
            kind: "climate",
            severity: cold ? "high" : "attention",
            title: cold ? `В павильоне ${fmtTemp(row.temp)}` : `Влажность ${row.humidity} %`,
            detail: row.reason,
            stopId: row.stop.id,
            since: row.since,
        })
    }

    for (const event of V_SAFETY) {
        if (!ids.has(event.stopId)) continue
        if (event.type === "lying_person" && event.durationMin === null) {
            items.push({ id: `sf-${event.id}`, kind: "safety", severity: "high", title: "Лежачий человек, эпизод не закрыт", detail: `Камера ${event.camera}`, stopId: event.stopId, since: event.at })
        }
        if (event.type === "glass_break" && V_NOW - event.at < DAY && event.verdict !== "rejected") {
            items.push({
                id: `sf-${event.id}`,
                kind: "safety",
                severity: event.verdict === "confirmed" ? "high" : "attention",
                title: "Сработал датчик стекла",
                detail: event.verdict === "confirmed" ? "Подтверждено камерой" : "Проверяется по камере",
                stopId: event.stopId,
                since: event.at,
            })
        }
    }

    return items.sort((a, b) => (a.severity === b.severity ? a.since - b.since : a.severity === "high" ? -1 : 1))
}

// ---------------------------------------------------------------- категории происшествий

export const CATEGORY_ORDER: AttentionKind[] = ["equipment", "clean", "safety", "climate"]
export const CATEGORY_LABELS: Record<AttentionKind, string> = {
    equipment: "Оборудование",
    clean: "Чистота",
    safety: "Безопасность",
    climate: "Климат",
}
/** Цвет закреплён за категорией и одинаков во всех разделах. */
export const CATEGORY_COLORS: Record<AttentionKind, string> = {
    equipment: "#2563eb",
    clean: "#ea580c",
    safety: "#0d9488",
    climate: "#8b5cf6",
}

/** Отключения, начавшиеся почти одновременно на одной остановке, считаются одним случаем. */
export function outageIncidents(outages: VOutage[]) {
    const keys = new Set<string>()
    for (const outage of outages) {
        if (outageDurationMs(outage) < 10 * 60_000) continue
        keys.add(`${outage.stopId}:${Math.floor(outage.startAt / (10 * 60_000))}`)
    }
    return keys.size
}

/** Сколько происшествий каждой категории было на остановке за период. */
export function stopProblemParts(stop: VStop, from: number, to: number, climate: ClimateSummary): number[] {
    const ids = new Set([stop.id])
    return [
        outageIncidents(outagesStarted(ids, from, to)),
        binsIn(ids, from, to).length,
        safetyIn(ids, from, to).length,
        Math.ceil((climate.outHours.get(stop.id) ?? 0) / 24),
    ]
}

// ---------------------------------------------------------------- микрорайоны

export interface DistrictRow {
    id: string
    name: string
    equipped: number
    cityStops: number
    coveragePct: number
    availability: number
    binHoursPerStop: number
    safetyPerStop: number
    climateHoursPerStop: number
    avgLoad: number
}

export function districtRows(districts: { id: string; name: string; cityStops: number }[], allStops: VStop[], from: number, to: number): DistrictRow[] {
    return districts.map((district) => {
        const stops = allStops.filter((stop) => stop.districtId === district.id)
        const ids = new Set(stops.map((stop) => stop.id))
        const count = Math.max(1, stops.length)
        const climate = climateSummary(stops, from, to)
        return {
            id: district.id,
            name: district.name,
            equipped: stops.length,
            cityStops: district.cityStops,
            coveragePct: (stops.length / district.cityStops) * 100,
            availability: availabilityPct(ids, from, to),
            binHoursPerStop: binStats(ids, from, to).totalMs / HOUR / count,
            safetyPerStop: safetyIn(ids, from, to).length / count,
            climateHoursPerStop: climate.totalHours / count,
            avgLoad: stops.reduce((sum, stop) => sum + averageLoad(stop, from, to), 0) / count,
        }
    })
}

/** Светофор ячейки: насколько значение хуже медианы по городу. */
export function relativeTone(value: number, values: number[], worseWhen: "higher" | "lower"): "success" | "attention" | "high" {
    const mid = median(values)
    if (worseWhen === "lower") {
        if (value < mid - 2) return "high"
        if (value < mid - 0.5) return "attention"
        return "success"
    }
    if (mid <= 0) return value > 0 ? "attention" : "success"
    if (value > mid * 1.5) return "high"
    if (value > mid * 1.1) return "attention"
    return "success"
}
