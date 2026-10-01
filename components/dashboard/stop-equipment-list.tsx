'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { useModuleAccess } from '@/components/providers/module-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchStopDirectory, type BusStopsGeoJSON } from '@/lib/api/bus-stops'
import { fetchStopActivity, type StopActivityResponse } from '@/lib/api/stop-activity'
import { fetchStopCameras, type StopCameraRow } from '@/lib/api/stop-current-analytics'
import { fetchEquipmentState, type EquipmentState } from '@/lib/api/equipment'
import { buildStopEquipmentLists, EQUIPMENT_GROUP_LABELS, parseEquipmentGroup } from '@/lib/stop-equipment-lists'
import { formatLicenseDate } from '@/lib/licenses/presentation'

type Snapshot = { directory: BusStopsGeoJSON | null; cameras: StopCameraRow[] | null; activity: StopActivityResponse | null; equipment: EquipmentState[] | null }
export function StopEquipmentList() {
  const params = useSearchParams(), group = parseEquipmentGroup(params.get('type'), params.get('status'))
  const { loading: accessLoading, hasModule } = useModuleAccess()
  const allowed = !accessLoading && hasModule('stops')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState(''), [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true), [reload, setReload] = useState(0)
  useEffect(() => {
    if (!allowed || !group) return
    let cancelled = false
    setLoading(true); setError(''); setSnapshot(null)
    Promise.allSettled([fetchStopDirectory(), fetchStopCameras(), fetchStopActivity(), fetchEquipmentState()])
      .then(([directory, cameras, activity, equipment]) => {
        if (cancelled) return
        const result: Snapshot = { directory: directory.status === 'fulfilled' ? directory.value : null,
          cameras: cameras.status === 'fulfilled' ? cameras.value : null,
          activity: activity.status === 'fulfilled' && Object.keys(activity.value.stops).length ? activity.value : null,
          equipment: equipment.status === 'fulfilled' && !equipment.value.error ? equipment.value.data : null }
        if (!result.directory || (group.startsWith('cameras-') ? !result.cameras || !result.equipment : !result.activity)) {
          setError('Не удалось загрузить список оборудования. Попробуйте обновить данные.')
        } else setSnapshot(result)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [allowed, group, reload])
  const rows = useMemo(() => snapshot && group ? buildStopEquipmentLists(snapshot)[group] : [], [snapshot, group])
  const q = search.trim().toLocaleLowerCase('ru')
  const filtered = rows.filter(row => [row.name, row.stopName, row.address || '', String(row.id)].some(value => value.toLocaleLowerCase('ru').includes(q)))
  return <main className="min-h-screen bg-background"><Navigation /><div className="mx-auto max-w-6xl space-y-4 px-4 pb-6 pt-24 sm:px-6">
    <Button asChild variant="outline"><Link href="/dashboard">Вернуться к аналитике</Link></Button>
    <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div className="space-y-1"><CardTitle>{group ? EQUIPMENT_GROUP_LABELS[group] : 'Список оборудования'}</CardTitle><CardDescription>{group?.startsWith('sensors-') ? 'Датчики сгруппированы по остановкам с контроллерами.' : 'Камеры остановок и их текущий статус.'}</CardDescription></div><Button variant="outline" disabled={loading || !allowed || !group} onClick={() => setReload(n => n + 1)}>Обновить</Button></CardHeader>
      <CardContent className="space-y-4">
        {accessLoading ? <p role="status">Проверка доступа…</p> : !allowed ? <p role="alert">Нет доступа к модулю «Остановки».</p> : !group ? <p role="alert">Некорректный фильтр оборудования.</p> : loading ? <p role="status">Загрузка оборудования…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : <>
          <div className="flex flex-wrap items-center gap-3"><Input aria-label="Поиск оборудования" className="sm:max-w-md" placeholder="Поиск по названию, остановке или адресу" value={search} onChange={event => setSearch(event.target.value)} /><span className="text-sm text-muted-foreground">Найдено {filtered.length} из {rows.length}</span></div>
          {!filtered.length ? <p className="text-muted-foreground">{q ? 'Ничего не найдено.' : 'В этой группе оборудования нет.'}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">{group.startsWith('cameras-') ? 'Камера' : 'Остановка с датчиками'}</th>{group.startsWith('cameras-') && <th className="p-3">Остановка</th>}<th className="p-3">Адрес</th><th className="p-3">Статус</th><th className="p-3">Последняя проверка</th></tr></thead><tbody>{filtered.map(row => {
            const checked = formatLicenseDate(row.checkedAt)
            return <tr key={row.id} className="border-b"><td className="p-3 font-medium">{row.name}</td>{group.startsWith('cameras-') && <td className="p-3">{row.stopName}</td>}<td className="p-3">{row.address || '—'}</td><td className="p-3 whitespace-nowrap">{row.online ? 'В сети' : 'Не в сети'}</td><td className="p-3 whitespace-nowrap">{checked ? `${checked.date}, ${checked.time}` : 'Нет данных'}</td></tr>
          })}</tbody></table></div>}
        </>}
      </CardContent>
    </Card>
  </div></main>
}
