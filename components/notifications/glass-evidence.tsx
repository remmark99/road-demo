"use client"
import { Badge } from '@/components/ui/badge'
import { formatEventDuration } from '@/lib/notifications/feed-filters'
import type { ControllerAlert, GlassEvidence } from '@/lib/api/controller-alerts'

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const frameTime = (ts: number) => when(new Date(ts * 1000).toISOString())

/** Камеры, на которых модель увидела повреждение, идут первыми: оператор смотрит сначала на них. */
export function orderEvidence(evidence: readonly GlassEvidence[] | undefined): GlassEvidence[] {
  return [...(evidence ?? [])].sort((a, b) => Number(Boolean(b.damaged)) - Number(Boolean(a.damaged)) || a.camera_index - b.camera_index)
}

function Frame({ frame, label, camera }: { frame: GlassEvidence['before'] | undefined; label: string; camera: number }) {
  if (!frame) {
    return <div className="flex aspect-video items-center justify-center rounded border border-dashed text-xs text-muted-foreground">Кадра «{label.toLowerCase()}» нет</div>
  }
  return <figure className="min-w-0">
    <a href={frame.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border bg-black/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frame.url} alt={`Камера ${camera}: ${label.toLowerCase()}`} className="aspect-video w-full object-contain" loading="lazy" />
    </a>
    <figcaption className="mt-1 flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{label}</span><span>{frameTime(frame.timestamp)}</span></figcaption>
  </figure>
}

function CameraPair({ view, afterLabel, afterOnly = false }: { view: GlassEvidence; afterLabel: string; afterOnly?: boolean }) {
  return <div className={`rounded-lg border p-3 ${view.damaged ? 'border-red-500/40 bg-red-500/5' : ''}`}>
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Камера {view.camera_index}</span>
      {view.damaged && <Badge className="border-red-500/30 bg-red-500/20 text-red-400">Повреждение видно здесь</Badge>}
    </div>
    <div className={`grid gap-3 ${afterOnly ? '' : 'sm:grid-cols-2'}`}>
      {!afterOnly && <Frame frame={view.before} label="До срабатывания" camera={view.camera_index} />}
      <Frame frame={view.after} label={afterLabel} camera={view.camera_index} />
    </div>
  </div>
}

/**
 * Кадры «до / после» подтверждённого разбития.
 *
 * «До» — кадр, замороженный в момент срабатывания датчика, «после» — то, что
 * увидела модель при подтверждении; пара всегда с одной камеры. У остановки
 * несколько камер, поэтому показаны все пары, а те, где модель назвала
 * повреждение, отмечены и стоят первыми. Если модель камеры не назвала,
 * отметок нет — смотреть надо все.
 */
export function GlassEvidencePanel({ alert }: { alert: ControllerAlert }) {
  const episode = alert.metadata?.glass_episode
  if (!episode) return null
  const open = episode.status === 'open'
  const first = orderEvidence(episode.first_evidence)
  const latest = orderEvidence(episode.latest_evidence)
  const anyMarked = first.some(view => view.damaged)
  const sameAsFirst = latest.length === first.length && latest.every(view => first.some(f => f.camera_index === view.camera_index && f.after?.url === view.after?.url))
  const since = formatEventDuration(episode.started_at, open ? new Date().toISOString() : episode.ended_at || episode.last_seen_at)
  return <section className="mt-4 space-y-4 border-t pt-4" onClick={e => e.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-2">
      <Badge className={open ? 'border-red-500/30 bg-red-500/20 text-red-400' : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'}>
        {open ? 'Стекло разбито — под контролем' : 'Стекло восстановлено'}
      </Badge>
      <span className="text-sm text-muted-foreground">
        Подтверждено по камерам {when(episode.started_at)} · последняя проверка {when(episode.last_checked_at || episode.last_seen_at)} · {open ? `длится ${since}` : `длилось ${since}`}
      </span>
    </div>
    {first.length === 0
      ? <p className="text-sm text-muted-foreground">Кадры этого события не сохранились.</p>
      : <div className="space-y-3">
        <h4 className="text-sm font-medium">При обнаружении{anyMarked ? '' : ' — повреждение ищите на любой из камер'}</h4>
        {first.map(view => <CameraPair key={view.camera_index} view={view} afterLabel="При подтверждении" />)}
      </div>}
    {latest.length > 0 && !sameAsFirst && <div className="space-y-3">
      <h4 className="text-sm font-medium">{open ? 'Последняя проверка' : 'При закрытии'}</h4>
      <div className="grid gap-3 md:grid-cols-3">
        {latest.map(view => <CameraPair key={view.camera_index} view={{ ...view, damaged: open && view.damaged }} afterLabel={open ? 'Текущее состояние' : 'Стекло на месте'} afterOnly />)}
      </div>
    </div>}
  </section>
}
