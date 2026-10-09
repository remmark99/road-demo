'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { russianModuleLabel, type LicenseDetail } from '@/lib/licenses/resources'
import { filterLicenses, formatLicenseDate, LICENSE_STATUSES } from '@/lib/licenses/presentation'
import { isPerpetual, type CustomerLicense, type LicenseResponse } from '@/lib/licenses/types'
import { LicenseEditor } from './license-editor'

function SupportLines({ license, moduleLabels }: { license: CustomerLicense; moduleLabels: Record<string, string> }) {
  if (!license.support.length) return null
  return <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
    {license.support.map(row => <li key={row.module}>
      Техническая поддержка модуля «{russianModuleLabel(row.module, moduleLabels)}» — до {formatLicenseDate(`${row.support_until}T00:00:00`)?.date || row.support_until}
    </li>)}
  </ul>
}

// Состав лицензии позициями прайс-листа платформы от 01.10.2026: право пользования
// модулем, лицензии на камеры и техподдержка отдельной строкой со сроком.
function PriceComposition({ license, moduleLabels, connected }: { license: CustomerLicense; moduleLabels: Record<string, string>; connected: number | null }) {
  const support = new Map(license.support.map(row => [row.module, row.support_until]))
  return <div className="space-y-3 text-sm">
    <p className="font-medium">Состав по прайсу</p>
    {license.modules.length ? license.modules.map(module => {
      const until = support.get(module)
      return <div key={module} className="rounded-md border p-3">
        <p className="font-medium">Неисключительное право пользования модулем «{russianModuleLabel(module, moduleLabels)}»</p>
        <p className="mt-1 text-muted-foreground">
          Техническая поддержка модуля «{russianModuleLabel(module, moduleLabels)}» — {until ? `до ${formatLicenseDate(`${until}T00:00:00`)?.date || until}` : 'не оформлена'}
        </p>
      </div>
    }) : <p className="text-muted-foreground">Модули не указаны</p>}
    <div className="rounded-md border p-3">
      <p className="font-medium">Лицензии на камеры с видеоаналитикой</p>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
        <span>Куплено: <span className="font-medium text-foreground">{license.max_cameras}</span></span>
        {connected !== null && <>
          <span>Подключено: <span className="font-medium text-foreground">{connected}</span></span>
          <span>Осталось: <span className={`font-medium ${connected > license.max_cameras ? 'text-destructive' : 'text-foreground'}`}>{license.max_cameras - connected}</span></span>
        </>}
      </div>
    </div>
  </div>
}

function LicensePeriod({ license }: { license: CustomerLicense }) {
  if (isPerpetual(license.expires_at)) {
    const start = formatLicenseDate(license.issued_at)
    return <div className="text-sm"><p className="text-xs text-muted-foreground">С {start?.date || '—'}</p><p className="font-medium">Бессрочно</p></div>
  }
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
  const [editing, setEditing] = useState<CustomerLicense | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const endpoint = admin ? '/api/admin/licenses' : '/api/settings/licenses'
  useEffect(() => {
    setDetail(null); setDetailError('')
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

  return <Card className="mb-6">
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <CardTitle>{admin ? 'Лицензии клиентов' : 'Мои лицензии'}</CardTitle>
      <div className="flex flex-wrap gap-2">
        {admin && data?.linked && <Button onClick={() => { setNotice(''); setEditing('new') }}>Новая лицензия</Button>}
        <Button variant="outline" disabled={loading} onClick={() => setReload(n => n + 1)}>Обновить</Button>
      </div>
    </CardHeader>
    <CardContent>
      {notice && <p role="status" className="mb-4 rounded-md bg-muted p-3 text-sm">{notice}</p>}
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
            <td className="p-3"><p>{LICENSE_STATUSES[license.status] || 'Статус не указан'}</p>{admin && license.needs_signing && license.status !== 'pending' && <p className="text-xs text-amber-600 dark:text-amber-400">Нужна переподпись license.key</p>}</td>
            <td className="p-3"><LicensePeriod license={license} /></td>
            <td className="p-3"><p>{license.modules.map(module => russianModuleLabel(module, data.moduleLabels)).join(', ') || 'Модули не указаны'}</p><SupportLines license={license} moduleLabels={data.moduleLabels} /></td>
          </tr>)}</tbody>
        </table></div>}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{detail ? `Лицензия ${detail.license.license_id}` : 'Состав лицензии'}</DialogTitle><DialogDescription>Состав лицензии по позициям прайс-листа.</DialogDescription></DialogHeader>
          {detailError ? <div role="alert"><p className="text-destructive">{detailError}</p><Button variant="outline" onClick={() => setReload(n => n + 1)}>Повторить</Button></div> : !detail ?
            <p role="status">Загрузка состава лицензии…</p> : <div className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Клиент</dt><dd>{detail.license.customer}</dd></div>
                <div><dt className="text-muted-foreground">Статус</dt><dd>{LICENSE_STATUSES[detail.license.status] || 'Статус не указан'}</dd></div>
                <div><dt className="mb-1 text-muted-foreground">Срок действия</dt><dd><LicensePeriod license={detail.license} /></dd></div>
                <div><dt className="text-muted-foreground">Договор</dt><dd>{detail.license.contract_no || 'Не указан'}</dd></div>
              </dl>
              <PriceComposition license={detail.license} moduleLabels={detail.moduleLabels} connected={detail.inventorySource === 'unavailable' ? null : detail.cameraCount} />
              {admin && <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => { setNotice(''); setEditing(detail.license) }}>Изменить / продлить</Button>
                {detail.license.status === 'pending'
                  ? <span className="text-sm text-muted-foreground">Ждёт подписи: license_tool.py sign {detail.license.license_id}</span>
                  : detail.license.needs_signing && <span className="text-sm text-amber-600 dark:text-amber-400">Права изменены — нужна переподпись: license_tool.py sign {detail.license.license_id}</span>}
              </div>}
            </div>}
        </DialogContent>
      </Dialog>
      {editing && <LicenseEditor key={editing === 'new' ? 'new' : editing.id} license={editing === 'new' ? null : editing}
        customers={customers} moduleLabels={data?.moduleLabels || {}} open onClose={() => setEditing(null)}
        onSaved={message => { setEditing(null); setSelected(null); setNotice(message); setReload(n => n + 1) }} />}
    </CardContent>
  </Card>
}
