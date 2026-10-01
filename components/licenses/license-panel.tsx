'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { russianModuleLabel, type LicenseDetail } from '@/lib/licenses/resources'
import type { LicenseResponse } from '@/lib/licenses/types'

const statuses: Record<string, string> = { active: 'Действует', expired: 'Истекла', revoked: 'Отозвана', suspended: 'Приостановлена' }
function date(value: string | null) {
  if (!value) return 'Не указан'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Не указан' : parsed.toLocaleString('ru-RU')
}

export function LicensePanel({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<LicenseResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<LicenseDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    setDetail(null); setDetailError(''); setSearch('')
    if (!selected) return
    const controller = new AbortController()
    fetch(`${admin ? '/api/admin/licenses' : '/api/settings/licenses'}/${encodeURIComponent(selected)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить состав лицензии')
        if (!controller.signal.aborted) setDetail(result)
      })
      .catch(e => { if (!controller.signal.aborted) setDetailError(e.message) })
    return () => controller.abort()
  }, [admin, selected, reload])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(admin ? '/api/admin/licenses' : '/api/settings/licenses', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить лицензии')
        setData(result)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [admin, reload])

  return <Card className="mb-6">
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <CardTitle>{admin ? 'Лицензии клиентов' : 'Мои лицензии'}</CardTitle>
      <Button variant="outline" disabled={loading} onClick={() => setReload(n => n + 1)}>Обновить</Button>
    </CardHeader>
    <CardContent>
      {loading ? <p role="status">Загрузка лицензий…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : !data?.linked ?
        <p className="text-muted-foreground">Лицензия пока не привязана к вашему аккаунту. Обратитесь к администратору.</p> : !data.licenses.length ?
        <p className="text-muted-foreground">Лицензии не найдены.</p> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b">
            {admin && <th className="p-3">Клиент / аккаунты</th>}
            <th className="p-3">Лицензия / договор</th><th className="p-3">Статус</th><th className="p-3">Сроки</th><th className="p-3">Модули / камеры</th>
          </tr></thead>
          <tbody>{data.licenses.map(license => <tr key={license.id} className="border-b align-top">
            {admin && <td className="p-3"><p>{license.customer}</p><p className="text-muted-foreground">{license.users.map(user => user.email).join(', ') || 'Аккаунты не привязаны'}</p></td>}
            <td className="p-3"><button className="font-medium underline underline-offset-4 focus-visible:outline-ring" onClick={() => setSelected(license.id)} aria-label={`Открыть лицензию ${license.license_id}`}>{license.license_id}</button><p className="text-muted-foreground">Договор: {license.contract_no || 'Не указан'}</p></td>
            <td className="p-3">{statuses[license.status] || 'Статус не указан'}</td>
            <td className="p-3 whitespace-nowrap"><p>Выдана: {date(license.issued_at)}</p><p>Окончание: {date(license.expires_at)}</p></td>
            <td className="p-3"><p>{license.modules.map(module => russianModuleLabel(module, data.moduleLabels)).join(', ') || 'Модули не указаны'}</p><p className="text-muted-foreground">Лимит камер: {license.max_cameras}</p></td>
          </tr>)}</tbody>
        </table></div>}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail ? `Лицензия ${detail.license.license_id}` : 'Состав лицензии'}</DialogTitle>
            <DialogDescription>Сроки, модули, остановки и связанные камеры.</DialogDescription>
          </DialogHeader>
          {detailError ? <div role="alert"><p className="text-destructive">{detailError}</p><Button variant="outline" onClick={() => setReload(n => n + 1)}>Повторить</Button></div> : !detail ?
            <p role="status">Загрузка состава лицензии…</p> : <div className="space-y-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Клиент</dt><dd>{detail.license.customer}</dd></div>
                <div><dt className="text-muted-foreground">Статус</dt><dd>{statuses[detail.license.status] || 'Статус не указан'}</dd></div>
                <div><dt className="text-muted-foreground">Выдана</dt><dd>{date(detail.license.issued_at)}</dd></div>
                <div><dt className="text-muted-foreground">Окончание</dt><dd>{date(detail.license.expires_at)}</dd></div>
                <div><dt className="text-muted-foreground">Модули</dt><dd>{detail.license.modules.map(key => russianModuleLabel(key, detail.moduleLabels)).join(', ') || 'Модули не указаны'}</dd></div>
                <div><dt className="text-muted-foreground">Лимит камер</dt><dd>{detail.license.max_cameras}</dd></div>
              </dl>
              {!detail.assigned ? <p className="rounded-md bg-muted p-3 text-sm">Список объектов этой лицензии ещё не назначен. Количество камер в лимите не означает, что конкретные камеры уже привязаны.</p> : <>
                <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-medium">Город: {detail.city}</span><span>Остановок: {detail.stops.length}</span><span>Камер: {detail.cameraCount}</span></div>
                {detail.exceedsCameraLimit && <p role="alert" className="rounded-md border border-destructive p-3 text-sm">В составе объектов {detail.cameraCount} камер при лимите {detail.license.max_cameras}. Требуется сверить состав и лимит лицензии.</p>}
                <Input aria-label="Поиск остановки или камеры" placeholder="Поиск по остановке, адресу или камере" value={search} onChange={e => setSearch(e.target.value)} />
                <div className="space-y-2">{(() => {
                  const q = search.trim().toLocaleLowerCase('ru')
                  const stops = detail.stops.filter(stop => [stop.name, stop.address || '', ...stop.cameras.map(camera => camera.name)].some(value => value.toLocaleLowerCase('ru').includes(q)))
                  return stops.length ? stops.map(stop => <div key={stop.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">{stop.name}</p>{stop.address && <p className="text-muted-foreground">{stop.address}</p>}
                    {stop.cameras.length ? <ul className="mt-2 space-y-1">{stop.cameras.map(camera => <li key={camera.id}>{camera.name}<span className="text-muted-foreground"> · {camera.module}</span></li>)}</ul> : <p className="mt-2 text-muted-foreground">Камеры не привязаны</p>}
                  </div>) : <p className="text-muted-foreground">{q ? 'Ничего не найдено.' : 'Остановки не назначены.'}</p>
                })()}</div>
              </>}
            </div>}
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>
}
