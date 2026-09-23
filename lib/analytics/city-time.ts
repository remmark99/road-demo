import type { TimeRangeResult } from '@/components/dashboard/time-range-filter'
const DAY = 86_400_000
const OFFSET = 5 * 3_600_000
export function cityDayStart(date: Date) {
    return new Date(Math.floor((date.getTime() + OFFSET) / DAY) * DAY - OFFSET)
}
function calendarDayStart(date: Date) {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - OFFSET)
}
export function cityRange(result: TimeRangeResult, now = new Date()) {
    if (result.preset === 'custom' && result.customRange?.from) {
        return { from: calendarDayStart(result.customRange.from), to: new Date(calendarDayStart(result.customRange.to ?? result.customRange.from).getTime() + DAY - 1) }
    }
    if (result.preset === 'yesterday') {
        const today = cityDayStart(now).getTime()
        return { from: new Date(today - DAY), to: new Date(today - 1) }
    }
    const days = result.preset === 'week' ? 7 : result.preset === 'month' ? 30 : 0
    return { from: days ? new Date(now.getTime() - days * DAY) : cityDayStart(now), to: now }
}
export function cityDateTime(iso: string) {
    return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export function cityHour(iso: string, showDate: boolean) {
    return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg', ...(showDate ? { day: '2-digit', month: '2-digit' } as const : {}), hour: '2-digit', minute: '2-digit' })
}
