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
