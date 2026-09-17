import type { Alert } from '@/lib/types'
import type { BinEpisode } from '@/lib/bin-episodes'

export function getAbandonedEpisode(alert: Pick<Alert, 'alert_type' | 'metadata'>): BinEpisode | null {
  if (alert.alert_type !== 'abandoned_object' || alert.metadata?.episode_schema !== 'abandoned_episode_v1') return null
  const episode = alert.metadata.abandoned_episode as BinEpisode | undefined
  if (!episode || !['open','closed'].includes(episode.status)) return null
  const start = Date.parse(episode.started_at), last = Date.parse(episode.last_seen_at)
  if (!Number.isFinite(start) || !Number.isFinite(last) || last < start) return null
  if (episode.status === 'closed' && (!episode.ended_at || !Number.isFinite(Date.parse(episode.ended_at)) || Date.parse(episode.ended_at) < last)) return null
  return {...episode, closed_image_url:episode.status === 'closed' && typeof episode.closed_image_url === 'string' ? episode.closed_image_url : null}
}
