"use client"
import { Badge } from '@/components/ui/badge'
import { formatEventDuration } from '@/lib/notifications/feed-filters'
import { vandalismKindLabel, vandalismReactionSeconds, type VandalismEpisode } from '@/lib/notifications/vandalism-episode'
import type { LightboxImage } from '@/components/notifications/media-lightbox'

const ZONE = 'Asia/Yekaterinburg'
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit' })

function reaction(seconds: number) {
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60), rest = seconds % 60
  return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`
}

interface Shot { label: string; url: string | null | undefined; time?: string | null; empty: string }

function Photo({ shot, onOpen, tall = false }: { shot: Shot; onOpen: (src: string) => void; tall?: boolean }) {
  return <figure className="min-w-0">
    {shot.url
      ? <button type="button" onClick={() => onOpen(shot.url as string)}
          className="block w-full cursor-zoom-in overflow-hidden rounded border bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt={shot.label} loading="lazy" decoding="async"
            className={`w-full object-contain ${tall ? 'aspect-video' : 'h-[150px]'}`} />
        </button>
      : <div className={`flex items-center justify-center rounded border border-dashed px-3 text-center text-xs text-muted-foreground ${tall ? 'aspect-video' : 'h-[150px]'}`}>{shot.empty}</div>}
    <figcaption className="mt-1 flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{shot.label}</span>
      {shot.time && <span>{when(shot.time)}</span>}
    </figcaption>
  </figure>
}

/**
 * Доказательства инцидента вандализма: чистая поверхность, обнаруженный след,
 * результат устранения, общий кадр с отметкой места и люди, которых камера
 * видела рядом с этим местом.
 *
 * Кадры людей — это те, кто был рядом в промежутке между чистым кадром и
 * подтверждением, а не установленный нарушитель: подпись об этом говорит прямо.
 */
export function VandalismEvidencePanel({ episode, onExpand }: {
  episode: VandalismEpisode
  onExpand: (images: LightboxImage[], startSrc?: string) => void
}) {
  const open = episode.status === 'open'
  const first = episode.stages.find(stage => stage.type !== 'removed')
  const updates = episode.stages.filter(stage => stage.type === 'updated')
  const kind = vandalismKindLabel(episode.kind)
  const seconds = vandalismReactionSeconds(episode)

  const main: Shot[] = [
    { label: 'До', url: episode.before_image_url, empty: 'Кадр «до» не сохранился' },
    { label: 'Обнаружено', url: episode.first_image_url, time: episode.first_image_at || episode.started_at, empty: 'Кадр недоступен' },
    ...updates.map(stage => ({ label: `Дополнено: ${vandalismKindLabel(stage.kind).toLowerCase()}`, url: stage.images.after, time: stage.at, empty: 'Кадр недоступен' })),
    ...(episode.replay ? [] : [{ label: 'После устранения', url: episode.closed_image_url, time: episode.closed_image_at || episode.ended_at,
      empty: open ? 'Ещё не устранено' : 'Кадр устранения недоступен' }]),
  ]
  const overview: Shot[] = [
    { label: 'Место на общем кадре', url: first?.images.detail || first?.images.frame, empty: '' },
    { label: 'Сравнение «до / после»', url: (updates.at(-1) ?? first)?.images.comparison, empty: '' },
  ].filter(shot => !!shot.url)
  const people = episode.candidates.flatMap((person, index) => person.images.map(image => ({
    person: index + 1, frames: person.frames, ...image,
  })))

  const gallery: LightboxImage[] = [
    ...[...main, ...overview].filter(shot => !!shot.url).map(shot => ({ src: shot.url as string, alt: shot.label, label: shot.label })),
    ...people.map(photo => ({ src: photo.url, alt: `Человек рядом, ${clock(photo.at)}`, label: `Человек рядом · ${clock(photo.at)}` })),
  ]
  const openAt = (src: string) => onExpand(gallery, src)

  return <section className="mt-4 space-y-4 border-t pt-4" onClick={e => e.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-2">
      {episode.replay
        ? <Badge variant="outline">Проверка по записи</Badge>
        : <Badge className={open ? 'border-red-500/30 bg-red-500/20 text-red-400' : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'}>
            {open ? 'Не устранено' : 'Устранено'}
          </Badge>}
      <span className="text-sm text-muted-foreground">
        {kind} · {episode.asset_label.toLowerCase()} · подтверждено {when(episode.started_at)}
        {seconds !== null && ` · через ${reaction(seconds)} после появления`}
        {!episode.replay && (open
          ? ` · длится ${formatEventDuration(episode.started_at, new Date().toISOString())}`
          : ` · устранено ${when(episode.ended_at as string)}`)}
      </span>
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {main.map(shot => <Photo key={shot.label} shot={shot} onOpen={openAt} />)}
    </div>

    {overview.length > 0 && <div className="grid gap-3 md:grid-cols-2">
      {overview.map(shot => <Photo key={shot.label} shot={shot} onOpen={openAt} tall />)}
    </div>}

    {people.length > 0 && <div className="space-y-2">
      <h4 className="text-sm font-medium">Кто был рядом с этим местом</h4>
      <p className="text-xs text-muted-foreground">
        Кадры людей, которых камера видела у места изменения до его подтверждения. Это не установленный нарушитель — решение за оператором.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {people.map(photo => <figure key={photo.url} className="min-w-0">
          <button type="button" onClick={() => openAt(photo.url)} className="block w-full cursor-zoom-in overflow-hidden rounded border bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Человек рядом, ${clock(photo.at)}`} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
          </button>
          <figcaption className="mt-1 text-xs text-muted-foreground">
            {episode.candidates.length > 1 && <span className="font-medium text-foreground">Человек {photo.person} · </span>}{clock(photo.at)}
          </figcaption>
        </figure>)}
      </div>
    </div>}
    {people.length === 0 && episode.candidates_state === 'pending' && (
      <p className="text-sm text-muted-foreground">Кадры людей рядом с местом изменения ещё собираются.</p>
    )}
  </section>
}
