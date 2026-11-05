import type { ControllerAlert } from '@/lib/api/controller-alerts'

export function GlassEvidencePanel({ alert }: { alert: ControllerAlert }) {
  const episode = alert.metadata?.glass_episode
  if (!episode) return null
  const groups = [
    { label: 'При обнаружении', evidence: episode.first_evidence },
    { label: 'Последняя проверка', evidence: episode.latest_evidence },
  ]
  return <section className="mt-4 space-y-4 border-t pt-4" onClick={e => e.stopPropagation()}>
    <p className="font-medium">{episode.status === 'open' ? 'Разбитие стекла — под контролем' : 'Стекло восстановлено — событие закрыто'}</p>
    <p className="text-sm text-muted-foreground">Последнее подтверждение разбития: {new Date(episode.last_seen_at).toLocaleString('ru-RU')}</p>
    {episode.ended_at && <p className="text-sm">Закрыто: {new Date(episode.ended_at).toLocaleString('ru-RU')}</p>}
    {groups.map(group => <div key={group.label}>
      <h4 className="mb-2 font-medium">{group.label}</h4>
      <div className="grid gap-3 md:grid-cols-2">
        {(group.evidence ?? []).flatMap(view => (['before', 'after'] as const).map(kind => {
          const frame = view[kind]
          if (!frame) return null
          return <figure key={`${view.camera_index}-${kind}`}>
            <a href={frame.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.url} alt={`Камера ${view.camera_index}: ${kind === 'before' ? 'до' : 'после'}`} className="w-full rounded object-contain" loading="lazy" />
            </a>
            <figcaption className="text-xs text-muted-foreground">Камера {view.camera_index} · {kind === 'before' ? 'До срабатывания' : 'Состояние при проверке'} · {new Date(frame.timestamp * 1000).toLocaleString('ru-RU')}</figcaption>
          </figure>
        }))}
      </div>
    </div>)}
  </section>
}
