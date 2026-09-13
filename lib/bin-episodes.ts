import type { Alert } from './types'

export interface BinEpisode {
    status: 'open' | 'closed'
    started_at: string
    last_seen_at: string
    ended_at: string | null
    observation_count: number
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
    if (episode.status === 'open' && episode.ended_at === null) return episode as unknown as BinEpisode
    if (episode.status === 'closed' && validDate(episode.ended_at)
        && Date.parse(episode.ended_at) >= Date.parse(episode.last_seen_at)) return episode as unknown as BinEpisode
    return null
}
