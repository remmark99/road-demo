import { getBinEpisode } from '../bin-episodes'

export interface TrashEventEpisode {
    startAt: string
    endAt: string | null
    lastSeenAt: string
    confirmations: number
}

export interface TrashOverflowEvent {
    id: string
    locationId: string
    timestamp: string
    cameraIndex: number | null
    /** Настоящий эпизод из metadata.bin_episode; null у старых записей без него. */
    episode: TrashEventEpisode | null
}

export interface TrashOverflowEpisode {
    id: string
    locationId: string
    startAt: string
    endAt: string
    lastSeenAt: string
    isOpen: boolean
    durationMs: number
    confirmations: number
    cameraIndexes: number[]
}

const LEGACY_EPISODE_GAP_MS = 2 * 60 * 60 * 1000

export function episodeOfAlert(alert: { alert_type: string; metadata: Record<string, unknown> | null }): TrashEventEpisode | null {
    const episode = getBinEpisode(alert as Parameters<typeof getBinEpisode>[0])
    if (!episode) return null
    return {
        startAt: episode.started_at,
        endAt: episode.ended_at,
        lastSeenAt: episode.last_seen_at,
        confirmations: episode.observation_count,
    }
}

/** Эпизод, начатый до периода, но ещё шедший в нём, к периоду относится. */
export function eventOverlapsRange(event: TrashOverflowEvent, from: Date) {
    const end = event.episode ? event.episode.endAt : event.timestamp
    return end === null || new Date(end).getTime() >= from.getTime()
}

function cameraIndexesOf(event: TrashOverflowEvent) {
    return typeof event.cameraIndex === 'number' ? [event.cameraIndex] : []
}

function episodeFromEvent(event: TrashOverflowEvent, episode: TrashEventEpisode, nowMs: number): TrashOverflowEpisode {
    const endMs = episode.endAt === null ? nowMs : new Date(episode.endAt).getTime()
    return {
        id: event.id,
        locationId: event.locationId,
        startAt: episode.startAt,
        endAt: episode.endAt ?? new Date(nowMs).toISOString(),
        lastSeenAt: episode.lastSeenAt,
        isOpen: episode.endAt === null,
        durationMs: Math.max(0, endMs - new Date(episode.startAt).getTime()),
        confirmations: episode.confirmations,
        cameraIndexes: cameraIndexesOf(event),
    }
}

/**
 * Запись о переполнении с bin_episode — это уже готовый эпизод одной камеры: его
 * начало, конец и число наблюдений показывает и лента уведомлений, поэтому строка
 * аналитики берёт их как есть. Старые записи (одно срабатывание — одна запись)
 * склеиваются по разрыву между срабатываниями, как раньше.
 */
export function buildTrashOverflowEpisodes(events: TrashOverflowEvent[], nowMs = Date.now()): TrashOverflowEpisode[] {
    const episodes: TrashOverflowEpisode[] = []
    const legacyByLocation = new Map<string, TrashOverflowEvent[]>()

    for (const event of events) {
        if (event.episode) {
            episodes.push(episodeFromEvent(event, event.episode, nowMs))
            continue
        }
        const list = legacyByLocation.get(event.locationId) ?? []
        list.push(event)
        legacyByLocation.set(event.locationId, list)
    }

    for (const [locationId, locationEvents] of legacyByLocation.entries()) {
        const sorted = [...locationEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        let current: TrashOverflowEpisode | null = null

        for (const event of sorted) {
            const eventMs = new Date(event.timestamp).getTime()
            if (!Number.isFinite(eventMs)) continue

            if (current && eventMs - new Date(current.endAt).getTime() <= LEGACY_EPISODE_GAP_MS) {
                current.endAt = event.timestamp
                current.lastSeenAt = event.timestamp
                current.durationMs = Math.max(0, eventMs - new Date(current.startAt).getTime())
                current.confirmations += 1
                for (const cameraIndex of cameraIndexesOf(event)) {
                    if (!current.cameraIndexes.includes(cameraIndex)) current.cameraIndexes.push(cameraIndex)
                }
                continue
            }

            if (current) episodes.push(current)
            current = {
                id: `${locationId}-${event.timestamp}`,
                locationId,
                startAt: event.timestamp,
                endAt: event.timestamp,
                lastSeenAt: event.timestamp,
                isOpen: false,
                durationMs: 0,
                confirmations: 1,
                cameraIndexes: cameraIndexesOf(event),
            }
        }

        if (current) episodes.push(current)
    }

    return episodes.sort((a, b) => b.durationMs - a.durationMs || b.confirmations - a.confirmations || b.endAt.localeCompare(a.endAt))
}
