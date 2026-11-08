import type { TimeRange, TimeRangeResult } from "@/components/dashboard/time-range-filter"

const PRESETS: TimeRange[] = ["today", "yesterday", "week", "month"]

function calendarDay(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

function parseCalendarDay(value: string | null) {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    const [year, month, day] = match.slice(1).map(Number)
    const date = new Date(year, month - 1, day)
    return date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

/** Период в параметрах адреса, чтобы он пережил переход на другую страницу и возврат. */
export function timeRangeToParams(result: TimeRangeResult, params: URLSearchParams) {
    params.delete("period")
    params.delete("from")
    params.delete("to")
    if (result.preset === "custom" && result.customRange?.from) {
        params.set("period", "custom")
        params.set("from", calendarDay(result.customRange.from))
        params.set("to", calendarDay(result.customRange.to ?? result.customRange.from))
    } else if (result.preset !== "today") {
        params.set("period", result.preset)
    }
}

export function timeRangeFromParams(params: { get(name: string): string | null }): TimeRangeResult {
    const period = params.get("period")
    if (period === "custom") {
        const from = parseCalendarDay(params.get("from"))
        const to = parseCalendarDay(params.get("to"))
        if (from && to && from <= to) return { preset: "custom", customRange: { from, to } }
    }
    return { preset: PRESETS.includes(period as TimeRange) ? period as TimeRange : "today" }
}
