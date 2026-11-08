import type { Alert } from '@/lib/types'

// «Камера не в сети» и «Камера снова в сети» — два уведомления об одном
// отключении. В ленте они сливаются в одно событие, как лежачий человек или
// урна: строка «не в сети» показывает, продолжается ли отключение, а строки
// «снова в сети» не выводятся. Состояние берётся из equipment_outages по
// metadata.outage_ids, которые equipment-monitor пишет в уведомление.

export const CAMERA_OFFLINE = 'camera_offline'
export const CAMERA_ONLINE = 'camera_online'

export interface OutageRow {
    id: number
    started_at: string
    ended_at: string | null
}

export interface CameraOutageEpisode {
    status: 'open' | 'closed'
    started_at: string
    ended_at: string | null
    /** Конец отключения, а пока оно идёт — его начало */
    last_seen_at: string
}

/** Типы для запроса ленты: «снова в сети» заменяется на «не в сети», куда оно вливается. */
export function mergeCameraLinkTypes(types: readonly string[]): string[] {
    return Array.from(new Set(types.map((type) => (type === CAMERA_ONLINE ? CAMERA_OFFLINE : type))))
}

export function getCameraOutageIds(alert: Pick<Alert, 'alert_type' | 'metadata'>): number[] {
    if (alert.alert_type !== CAMERA_OFFLINE) return []
    const ids = alert.metadata?.outage_ids
    if (!Array.isArray(ids)) return []
    return ids.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id))
}

/**
 * Отключение, о котором говорит уведомление. Массовое уведомление охватывает
 * несколько камер: оно продолжается, пока не вернулась хотя бы одна.
 */
export function getCameraOutageEpisode(
    alert: Pick<Alert, 'alert_type' | 'metadata'>,
    outagesById: ReadonlyMap<number, OutageRow>,
): CameraOutageEpisode | null {
    const rows = getCameraOutageIds(alert)
        .map((id) => outagesById.get(id))
        .filter((row): row is OutageRow => !!row && Number.isFinite(Date.parse(row.started_at)))
    if (rows.length === 0) return null
    const started = rows.reduce((min, row) => (Date.parse(row.started_at) < Date.parse(min) ? row.started_at : min), rows[0].started_at)
    if (rows.some((row) => !row.ended_at)) return { status: 'open', started_at: started, ended_at: null, last_seen_at: started }
    const ended = rows.reduce((max, row) => (Date.parse(row.ended_at as string) > Date.parse(max) ? row.ended_at as string : max), rows[0].ended_at as string)
    return { status: 'closed', started_at: started, ended_at: ended, last_seen_at: ended }
}

/**
 * Длительность в тексте («не в сети 15 мин») устаревает сразу после отправки,
 * а у события есть своя, живая — убираем её из сообщения.
 */
export function withoutOutageDuration(message: string): string {
    return message
        .replace(/ не в сети (?:меньше минуты|\d+ (?:мин|ч|дн)(?: \d+ (?:мин|ч))?)$/, ' не в сети')
        .replace(/ \((?:меньше минуты|\d+ (?:мин|ч|дн)(?: \d+ (?:мин|ч))?)\)$/, '')
}
