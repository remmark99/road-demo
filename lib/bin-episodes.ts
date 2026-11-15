import type { Alert } from './types'

export interface BinEpisode {
    status: 'open' | 'closed'
    started_at: string
    last_seen_at: string
    ended_at: string | null
    first_image_url?: string | null
    first_image_at?: string | null
    closed_image_url?: string | null
    closed_image_at?: string | null
    observation_count: number
    // Abandoned objects only: when the object was first tracked. The event fires
    // `abandoned_hold_seconds` after that, so a total duration must start here,
    // not at started_at (which is the firing moment).
    object_first_seen_at?: string | null
    // Our trained bin classifier's score at each boundary of the episode. The
    // start is the observation that opened it; the end is the average over the
    // clean streak that closed it (undefined while it is still open). Absent on
    // the Stage 2 VLM path, which returns no probability.
    start_confidence?: number | null
    end_confidence?: number | null
    end_confidence_samples?: number | null
}

function confidence(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

function samples(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function getBinEpisode(alert: Pick<Alert, 'alert_type' | 'metadata'>): BinEpisode | null {
    if (alert.alert_type !== 'bin_full' || alert.metadata?.episode_schema !== 'bin_episode_v1') return null
    const value = alert.metadata.bin_episode
    if (!value || typeof value !== 'object') return null
    const episode = value as Record<string, unknown>
    const validDate = (date: unknown): date is string =>
        typeof date === 'string' && Number.isFinite(Date.parse(date))
    if (!validDate(episode.started_at) || !validDate(episode.last_seen_at)
        || Date.parse(episode.last_seen_at) < Date.parse(episode.started_at)
        || typeof episode.observation_count !== 'number'
        || !Number.isInteger(episode.observation_count) || episode.observation_count < 1) return null
    const image = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : null
    const normalized = { ...episode, first_image_url: image(episode.first_image_url),
        first_image_at: validDate(episode.first_image_at) ? episode.first_image_at : null,
        closed_image_at: validDate(episode.closed_image_at) ? episode.closed_image_at : null,
        closed_image_url: episode.status === 'closed' ? image(episode.closed_image_url) : null,
        start_confidence: confidence(episode.start_confidence),
        end_confidence: episode.status === 'closed' ? confidence(episode.end_confidence) : null,
        end_confidence_samples: episode.status === 'closed' ? samples(episode.end_confidence_samples) : null } as unknown as BinEpisode
    if (episode.status === 'open' && episode.ended_at === null) return normalized
    if (episode.status === 'closed' && validDate(episode.ended_at)
        && Date.parse(episode.ended_at) >= Date.parse(episode.last_seen_at)) return normalized
    return null
}
