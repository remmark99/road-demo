/** Calendar days are interpreted in Surgut (UTC+5); the end is exclusive. */
export function sensorCalendarBounds(from: string | null, to: string | null) {
    if (from === null && to === null) return null
    const parse = (day: string | null) => {
        if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Выберите начальную и конечную даты")
        const utc = new Date(`${day}T00:00:00Z`)
        if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== day) throw new Error("Некорректная дата")
        return utc.getTime() - 5 * 3600_000
    }
    const start = parse(from), end = parse(to) + 86400_000
    if (end <= start) throw new Error("Конец периода должен быть не раньше начала")
    return { from: new Date(start), to: new Date(end), hours: (end - start) / 3600_000 }
}

const SURGUT_OFFSET_MS = 5 * 3600_000
const MAX_CHART_BUCKETS = 48
const BUCKET_STEPS_MINUTES = [5, 15, 30, 60, 120, 240, 360, 720, 1440]

/** Calendar day in Surgut, for the from/to query parameters. */
export function sensorCityDay(date: Date) {
    return new Date(date.getTime() + SURGUT_OFFSET_MS).toISOString().slice(0, 10)
}

/** Narrowest chart step that keeps the period within MAX_CHART_BUCKETS points. */
export function sensorBucketMinutes(spanMs: number) {
    const needed = spanMs / 60_000 / MAX_CHART_BUCKETS
    return BUCKET_STEPS_MINUTES.find((step) => step >= needed) ?? Math.ceil(needed / 1440) * 1440
}

/** Start of the chart bucket holding the instant, aligned to Surgut midnight. */
export function floorToSensorBucket(ms: number, bucketMinutes: number) {
    const width = bucketMinutes * 60_000
    return Math.floor((ms + SURGUT_OFFSET_MS) / width) * width - SURGUT_OFFSET_MS
}

/** Half-open windows covering [from, to), one per chart bucket, newest first. */
export function sensorSampleWindows(from: Date, to: Date, bucketMinutes: number) {
    const width = bucketMinutes * 60_000
    const windows: { from: string; to: string }[] = []
    for (let start = floorToSensorBucket(from.getTime(), bucketMinutes); start < to.getTime(); start += width) {
        windows.unshift({
            from: new Date(Math.max(start, from.getTime())).toISOString(),
            to: new Date(Math.min(start + width, to.getTime())).toISOString(),
        })
    }
    return windows
}
