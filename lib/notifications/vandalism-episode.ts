import type { Alert } from '@/lib/types'
import type { BinEpisode } from '@/lib/bin-episodes'

// Инцидент вандализма: одна строка alerts на всё время от появления следа до
// его устранения. Строку ведёт сервис vandalism-alerts в bus_stop_analytics
// (src/vandalism_alerts/episode.py) — episode_schema и ключи vandalism_episode
// общие для двух репозиториев, менять их можно только одновременно.

export const VANDALISM_ALERT_TYPE = 'vandalism'
export const VANDALISM_EPISODE_SCHEMA = 'vandalism_episode_v1'

export type VandalismStageType = 'appeared' | 'updated' | 'removed'
export type VandalismImageName = 'before' | 'after' | 'comparison' | 'frame' | 'detail'

export interface VandalismStage {
  event_id: string
  type: VandalismStageType
  at: string
  kind: string | null
  images: Partial<Record<VandalismImageName, string>>
}

/** Человек, которого камера видела рядом с местом изменения: серия кадров одного трека. */
export interface VandalismPerson {
  track: string
  frames: number
  images: { url: string; at: string }[]
}

export interface VandalismEpisode extends BinEpisode {
  kind: string | null
  asset: string | null
  asset_label: string
  /** Событие получено повторным прогоном сохранённой записи, а не с живого потока. */
  replay: boolean
  /** Когда изменение впервые замечено — до того, как детектор его подтвердил. */
  first_noticed_at: string | null
  /** Чистая поверхность до инцидента. */
  before_image_url: string | null
  stages: VandalismStage[]
  candidates: VandalismPerson[]
  candidates_state: 'ready' | 'pending' | 'none'
}

export const VANDALISM_KIND_LABELS: Record<string, string> = {
  paper_or_sticker: 'Бумага или наклейка',
  painted_mark: 'Надпись или рисунок',
}

export function vandalismKindLabel(kind: string | null | undefined): string {
  return (kind && VANDALISM_KIND_LABELS[kind]) || 'Изменение поверхности'
}

const STAGE_TYPES: readonly string[] = ['appeared', 'updated', 'removed']
const IMAGE_NAMES: readonly VandalismImageName[] = ['before', 'after', 'comparison', 'frame', 'detail']

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readStages(value: unknown): VandalismStage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const stage = record(item)
    if (!stage || !STAGE_TYPES.includes(stage.type as string) || !validDate(stage.at)) return []
    const source = record(stage.images) ?? {}
    const images: VandalismStage['images'] = {}
    for (const name of IMAGE_NAMES) {
      const url = text(source[name])
      if (url) images[name] = url
    }
    return [{ event_id: text(stage.event_id) ?? '', type: stage.type as VandalismStageType, at: stage.at,
      kind: text(stage.kind), images }]
  })
}

function readPeople(value: unknown): VandalismPerson[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const person = record(item)
    if (!person || !Array.isArray(person.images)) return []
    const images = person.images.flatMap((image) => {
      const photo = record(image)
      const url = photo && text(photo.url)
      return photo && url && validDate(photo.at) ? [{ url, at: photo.at }] : []
    })
    if (images.length === 0) return []
    const frames = typeof person.frames === 'number' && person.frames >= images.length ? person.frames : images.length
    return [{ track: text(person.track) ?? '', frames, images }]
  })
}

export function getVandalismEpisode(alert: Pick<Alert, 'alert_type' | 'metadata'>): VandalismEpisode | null {
  if (alert.alert_type !== VANDALISM_ALERT_TYPE || alert.metadata?.episode_schema !== VANDALISM_EPISODE_SCHEMA) return null
  const episode = record(alert.metadata.vandalism_episode)
  if (!episode || !validDate(episode.started_at) || !validDate(episode.last_seen_at)) return null
  const start = Date.parse(episode.started_at), last = Date.parse(episode.last_seen_at)
  if (last < start) return null
  const closed = episode.status === 'closed'
  if (!closed && episode.status !== 'open') return null
  // Закрытый эпизод без времени закрытия показывать как закрытый нельзя: длительность не посчитать.
  if (closed && (!validDate(episode.ended_at) || Date.parse(episode.ended_at) < last)) return null
  const firstNoticed = validDate(episode.first_noticed_at) && Date.parse(episode.first_noticed_at) <= start
    ? episode.first_noticed_at : null
  const count = typeof episode.observation_count === 'number' && Number.isInteger(episode.observation_count)
    && episode.observation_count > 0 ? episode.observation_count : 1
  const candidates = readPeople(episode.candidates)
  return {
    status: closed ? 'closed' : 'open',
    started_at: episode.started_at,
    last_seen_at: episode.last_seen_at,
    ended_at: closed ? episode.ended_at as string : null,
    first_image_url: text(episode.first_image_url),
    first_image_at: validDate(episode.first_image_at) ? episode.first_image_at : null,
    closed_image_url: closed ? text(episode.closed_image_url) : null,
    closed_image_at: closed && validDate(episode.closed_image_at) ? episode.closed_image_at : null,
    observation_count: count,
    kind: text(episode.kind),
    asset: text(episode.asset),
    asset_label: text(episode.asset_label) ?? 'Поверхность',
    replay: episode.replay === true,
    first_noticed_at: firstNoticed,
    before_image_url: text(episode.before_image_url),
    stages: readStages(episode.stages),
    candidates,
    candidates_state: candidates.length > 0 ? 'ready' : episode.candidates_state === 'pending' ? 'pending' : 'none',
  }
}

/** Сколько прошло от первого замеченного изменения до подтверждённой тревоги, в секундах. */
export function vandalismReactionSeconds(episode: Pick<VandalismEpisode, 'first_noticed_at' | 'started_at'>): number | null {
  if (!episode.first_noticed_at) return null
  const seconds = Math.round((Date.parse(episode.started_at) - Date.parse(episode.first_noticed_at)) / 1000)
  return seconds >= 0 ? seconds : null
}
