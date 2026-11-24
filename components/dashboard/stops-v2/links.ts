// Переходы из аналитики остановок в журнал уведомлений и на карту.
import { safetyNotificationsHref } from "@/lib/analytics/safety-periods"
import { V_NOW, type VBinEpisode, type VStop } from "@/lib/mock/stop-analytics-vision-data"

const HOUR = 3_600_000
export const BIN_ALERT_TYPES = ["bin_full"] as const

/** Эпизод переполнения в журнале: камера и время вокруг эпизода, карточка уведомления сразу раскрыта (там кадры «до» и «после»). */
export function binEpisodeHref(episode: VBinEpisode): string | null {
    if (!episode.alertId) return null
    const end = episode.endAt ?? V_NOW
    const href = safetyNotificationsHref(
        { from: new Date(episode.startAt - HOUR), to: new Date(Math.min(V_NOW, end + HOUR)) },
        BIN_ALERT_TYPES,
        episode.camera !== null && episode.camera !== undefined ? [episode.camera] : [],
    )
    return `${href}&alertId=${encodeURIComponent(episode.alertId)}`
}

/** Все переполнения урн за период в журнале. */
export function binPeriodHref(from: number, to: number) {
    return safetyNotificationsHref({ from: new Date(from), to: new Date(to) }, BIN_ALERT_TYPES)
}

/** Все уведомления камер остановки за период; у остановки без камер — null. */
export function stopNotificationsHref(stop: VStop, from: number, to: number): string | null {
    if (!stop.cameras.length) return null
    const url = new URL(safetyNotificationsHref({ from: new Date(from), to: new Date(to) }, [], stop.cameras), "http://local")
    url.searchParams.delete("types")
    return `${url.pathname}${url.search}`
}

/** Остановка на карте: карта сама приближается и открывает карточку. */
export function stopMapHref(stop: VStop) {
    return `/?stop=${stop.id}&tab=${stop.cameras.length ? "cameras" : "sensors"}`
}

/** Камера остановки на карте: карточка остановки открывается сразу на этой камере. */
export function cameraMapHref(stop: VStop, camera: number) {
    return `/?stop=${stop.id}&tab=cameras&camera=${camera}`
}
