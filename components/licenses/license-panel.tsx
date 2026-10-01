'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { russianModuleLabel, type LicenseDetail } from '@/lib/licenses/resources'
import { filterLicenses, formatLicenseDate, LICENSE_STATUSES } from '@/lib/licenses/presentation'
import type { CustomerLicense, LicenseResponse } from '@/lib/licenses/types'

function LicensePeriod({ license }: { license: CustomerLicense }) {
  const start = formatLicenseDate(license.issued_at), end = formatLicenseDate(license.expires_at)
  return <div className="flex items-center gap-3 whitespace-nowrap text-sm">
    <div><p className="text-xs text-muted-foreground">С</p><time dateTime={license.issued_at} title={start?.full} className="font-medium">{start?.date || 'Дата не указана'}</time><p className="text-xs text-muted-foreground">{start?.time || '—'}</p></div>
    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    <div><p className="text-xs text-muted-foreground">До</p><time dateTime={license.expires_at || undefined} title={end?.full} className="font-medium">{end?.date || 'Срок не задан'}</time><p className="text-xs text-muted-foreground">{end?.time || '—'}</p></div>
  </div>
}

export function LicensePanel({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<LicenseResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [status, setStatus] = useState('all')
  const [customer, setCustomer] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<LicenseDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [search, setSearch] = useState('')
  const endpoint = admin ? '/api/admin/licenses' : '/api/settings/licenses'
  useEffect(() => {
    setDetail(null); setDetailError(''); setSearch('')
    if (!selected) return
    const controller = new AbortController()
    fetch(`${endpoint}/${encodeURIComponent(selected)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить состав лицензии')
        if (!controller.signal.aborted) setDetail(result)
      })
      .catch(e => { if (!controller.signal.aborted) setDetailError(e.message) })
    return () => controller.abort()
  }, [endpoint, selected, reload])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить лицензии')
        if (!controller.signal.aborted) setData(result)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [endpoint, reload])
  const customers = useMemo(() => [...new Map((data?.licenses || []).map(license => [license.customer_id, license.customer])).entries()].sort((a,b) => a[1].localeCompare(b[1], 'ru')), [data])
  const visible = filterLicenses(data?.licenses || [], status, customer)
  const q = search.trim().toLocaleLowerCase('ru')
  const cameras = detail?.cameras?.filter(camera => [camera.name, camera.module, camera.stopName || ''].some(value => value.toLocaleLowerCase('ru').includes(q))) || []
  const stops = detail?.stops.filter(stop => [stop.name, stop.address || '', ...stop.cameras.map(camera => camera.name)].some(value => value.toLocaleLowerCase('ru').includes(q))) || []

  return <Card className="mb-6">
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <CardTitle>{admin ? 'Лицензии клиентов' : 'Мои лицензии'}</CardTitle>
      <Button variant="outline" disabled={loading} onClick={() => setReload(n => n + 1)}>Обновить</Button>
    </CardHeader>
    <CardContent>
      {admin && data?.linked && <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Статус лицензии" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все статусы</SelectItem>{Object.entries(LICENSE_STATUSES).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={customer} onValueChange={setCustomer}><SelectTrigger aria-label="Клиент лицензии" className="w-full sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все клиенты</SelectItem>{customers.map(([id,name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
        {(status !== 'all' || customer !== 'all') && <Button variant="ghost" onClick={() => { setStatus('all'); setCustomer('all') }}>Сбросить</Button>}
        <span className="text-sm text-muted-foreground">Показано {visible.length} из {data.licenses.length}</span>
      </div>}
      {loading ? <p role="status">Загрузка лицензий…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : !data?.linked ?
        <p className="text-muted-foreground">Лицензия пока не привязана к вашему аккаунту. Обратитесь к администратору.</p> : !data.licenses.length ?
        <p className="text-muted-foreground">Лицензии не найдены.</p> : !visible.length ? <p className="text-muted-foreground">Нет лицензий с выбранными фильтрами.</p> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b">
            {admin && <th className="p-3">Клиент / аккаунты</th>}
            <th className="p-3">Лицензия / договор</th><th className="p-3">Статус</th><th className="p-3">Срок действия</th><th className="p-3">Модули</th>
          </tr></thead>
          <tbody>{visible.map(license => <tr key={license.id} className="border-b align-top">
            {admin && <td className="p-3"><p>{license.customer}</p><p className="text-muted-foreground">{license.users.map(user => user.email).join(', ') || 'Аккаунты не привязаны'}</p></td>}
            <td className="p-3"><button className="font-medium underline underline-offset-4 focus-visible:outline-ring" onClick={() => setSelected(license.id)} aria-label={`Открыть лицензию ${license.license_id}`}>{license.license_id}</button><p className="text-muted-foreground">Договор: {license.contract_no || 'Не указан'}</p></td>
            <td className="p-3">{LICENSE_STATUSES[license.status] || 'Статус не указан'}</td>
            <td className="p-3"><LicensePeriod license={license} /></td>
            <td className="p-3"><p>{license.modules.map(module => russianModuleLabel(module, data.moduleLabels)).join(', ') || 'Модули не указаны'}</p></td>
          </tr>)}</tbody>
        </table></div>}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{detail ? `Лицензия ${detail.license.license_id}` : 'Состав лицензии'}</DialogTitle><DialogDescription>Срок действия, модули и камеры города.</DialogDescription></DialogHeader>
          {detailError ? <div role="alert"><p className="text-destructive">{detailError}</p><Button variant="outline" onClick={() => setReload(n => n + 1)}>Повторить</Button></div> : !detail ?
            <p role="status">Загрузка состава лицензии…</p> : <div className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Клиент</dt><dd>{detail.license.customer}</dd></div>
                <div><dt className="text-muted-foreground">Статус</dt><dd>{LICENSE_STATUSES[detail.license.status] || 'Статус не указан'}</dd></div>
                <div><dt className="mb-1 text-muted-foreground">Срок действия</dt><dd><LicensePeriod license={detail.license} /></dd></div>
                <div><dt className="text-muted-foreground">Модули</dt><dd>{detail.license.modules.map(key => russianModuleLabel(key, detail.moduleLabels)).join(', ') || 'Модули не указаны'}</dd></div>
              </dl>
              {detail.inventorySource === 'unavailable' ? <p className="rounded-md bg-muted p-3 text-sm">Камеры этого клиента пока не подключены к платформе.</p> : <>
                <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-medium">Город: {detail.city}</span><span>Остановок: {detail.stops.length}</span><span>Камер: {detail.cameraCount}</span></div>
                <Input aria-label="Поиск остановки или камеры" placeholder="Поиск по остановке, адресу или камере" value={search} onChange={e => setSearch(e.target.value)} />
                <Tabs defaultValue="cameras"><TabsList><TabsTrigger value="cameras">Камеры ({detail.cameraCount})</TabsTrigger><TabsTrigger value="stops">Остановки ({detail.stops.length})</TabsTrigger></TabsList>
                  <TabsContent value="cameras"><div className="space-y-2">{cameras.length ? cameras.map(camera => <div key={camera.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{camera.name}</p><p className="text-muted-foreground">{camera.module} · {camera.stopName || 'Остановка не привязана'}</p></div>) : <p className="text-muted-foreground">{q ? 'Ничего не найдено.' : 'Камеры не найдены.'}</p>}</div></TabsContent>
                  <TabsContent value="stops"><div className="space-y-2">{stops.length ? stops.map(stop => <div key={stop.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{stop.name}</p>{stop.address && <p className="text-muted-foreground">{stop.address}</p>}{stop.cameras.length ? <ul className="mt-2 space-y-1">{stop.cameras.map(camera => <li key={camera.id}>{camera.name}</li>)}</ul> : <p className="mt-2 text-muted-foreground">Камеры не привязаны</p>}</div>) : <p className="text-muted-foreground">{q ? 'Ничего не найдено.' : 'Остановки не найдены.'}</p>}</div></TabsContent>
                </Tabs>
              </>}
            </div>}
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>
}
