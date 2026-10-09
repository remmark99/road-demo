'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { addYears, EDITABLE_STATUSES, type LicenseForm } from '@/lib/licenses/editor'
import { LICENSE_STATUSES } from '@/lib/licenses/presentation'
import { LICENSE_MODULES, russianModuleLabel } from '@/lib/licenses/resources'
import { isPerpetual, type CustomerLicense } from '@/lib/licenses/types'

const NEW_CUSTOMER = 'new'

function formFor(license: CustomerLicense | null): LicenseForm {
  const today = new Date().toISOString().slice(0, 10)
  if (!license) return {
    customerId: null, customerName: '', prefix: 'SRG', contractNo: '', modules: ['stops'], maxCameras: 30,
    expiresOn: addYears(today, 1), perpetual: false, support: {}, status: '', reason: '', notes: '',
  }
  return {
    customerId: license.customer_id, customerName: license.customer, prefix: license.license_id.split('-')[0] || 'SRG',
    contractNo: license.contract_no || '', modules: [...license.modules], maxCameras: license.max_cameras,
    expiresOn: license.expires_at ? license.expires_at.slice(0, 10) : addYears(today, 1), perpetual: isPerpetual(license.expires_at),
    support: Object.fromEntries(license.support.map(row => [row.module, row.support_until])),
    status: license.status === 'expired' ? 'active' : license.status, reason: '', notes: '',
  }
}

/** Новая лицензия (license = null) или правка/продление существующей. */
export function LicenseEditor({ license, customers, moduleLabels, open, onClose, onSaved }: {
  license: CustomerLicense | null
  customers: [string, string][]
  moduleLabels: Record<string, string>
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [form, setForm] = useState<LicenseForm>(() => formFor(license))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const creating = !license
  const set = <K extends keyof LicenseForm>(key: K, value: LicenseForm[K]) => setForm(prev => ({ ...prev, [key]: value }))
  const toggleModule = (module: string, checked: boolean) => setForm(prev => ({
    ...prev,
    modules: checked ? LICENSE_MODULES.filter(m => m === module || prev.modules.includes(m)) : prev.modules.filter(m => m !== module),
  }))

  async function submit() {
    setSaving(true); setError('')
    try {
      const support = Object.fromEntries(Object.entries(form.support).filter(([module]) => form.modules.includes(module)))
      const response = await fetch(creating ? '/api/admin/licenses' : `/api/admin/licenses/${encodeURIComponent(license!.id)}`, {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, support, customerId: form.customerId === NEW_CUSTOMER ? null : form.customerId }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Не удалось сохранить лицензию')
      onSaved(creating
        ? `Лицензия ${result.license_id} заведена и ждёт подписи: python licensing/license_tool.py sign ${result.license_id}`
        : `Лицензия ${license!.license_id} сохранена`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить лицензию')
    } finally {
      setSaving(false)
    }
  }

  const customerValue = form.customerId || NEW_CUSTOMER
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{license ? `Лицензия ${license.license_id}` : 'Новая лицензия'}</DialogTitle>
        <DialogDescription>
          {creating
            ? 'Лицензия заводится в реестре черновиком. Файл license.key выпускает владелец ключа подписи.'
            : 'Продление срока и смена модулей записываются в журнал с основанием; после них license.key нужно переподписать.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 text-sm">
        {creating && <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Клиент</Label>
            <Select value={customerValue} onValueChange={value => set('customerId', value === NEW_CUSTOMER ? null : value)}>
              <SelectTrigger aria-label="Клиент"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_CUSTOMER}>Новый клиент</SelectItem>
                {customers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {customerValue === NEW_CUSTOMER && <div className="space-y-1.5">
            <Label htmlFor="license-customer">Название клиента</Label>
            <Input id="license-customer" value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder="Администрация г. Сургут" />
          </div>}
          <div className="space-y-1.5">
            <Label htmlFor="license-prefix">Префикс номера</Label>
            <Input id="license-prefix" value={form.prefix} maxLength={8} onChange={e => set('prefix', e.target.value.toUpperCase())} />
          </div>
        </div>}

        <div className="space-y-1.5">
          <Label htmlFor="license-contract">Договор</Label>
          <Input id="license-contract" value={form.contractNo} onChange={e => set('contractNo', e.target.value)} placeholder="Договор №17/2026" />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-medium">Модули и техническая поддержка</legend>
          {LICENSE_MODULES.map(module => {
            const checked = form.modules.includes(module)
            return <div key={module} className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[1fr_auto]">
              <div className="flex items-center gap-2">
                <Checkbox id={`module-${module}`} checked={checked} onCheckedChange={value => toggleModule(module, !!value)} />
                <Label htmlFor={`module-${module}`} className="cursor-pointer">{russianModuleLabel(module, moduleLabels)}</Label>
              </div>
              {checked && <div className="flex items-center gap-2">
                <Label htmlFor={`support-${module}`} className="whitespace-nowrap text-muted-foreground">Техподдержка до</Label>
                <Input id={`support-${module}`} type="date" className="w-40" value={form.support[module] || ''}
                  onChange={e => set('support', { ...form.support, [module]: e.target.value })} />
              </div>}
            </div>
          })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="license-cameras">Камер по лицензии</Label>
            <Input id="license-cameras" type="number" min={0} max={10000} value={form.maxCameras}
              onChange={e => set('maxCameras', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="license-expires">Срок действия до</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="license-expires" type="date" className="w-40" disabled={form.perpetual} value={form.expiresOn}
                onChange={e => set('expiresOn', e.target.value)} />
              {!form.perpetual && <Button type="button" variant="outline" size="sm" onClick={() => set('expiresOn', addYears(form.expiresOn, 1))}>+1 год</Button>}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="license-perpetual" checked={form.perpetual} onCheckedChange={value => set('perpetual', !!value)} />
              <Label htmlFor="license-perpetual" className="cursor-pointer">Бессрочно</Label>
            </div>
          </div>
        </div>

        {license && license.status !== 'pending' && <div className="space-y-1.5">
          <Label>Статус</Label>
          <Select value={form.status} onValueChange={value => set('status', value)}>
            <SelectTrigger aria-label="Статус" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{EDITABLE_STATUSES.map(status => <SelectItem key={status} value={status}>{LICENSE_STATUSES[status]}</SelectItem>)}</SelectContent>
          </Select>
        </div>}

        {creating
          ? <div className="space-y-1.5">
              <Label htmlFor="license-notes">Примечание</Label>
              <Textarea id="license-notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          : <div className="space-y-1.5">
              <Label htmlFor="license-reason">Основание изменения</Label>
              <Input id="license-reason" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Допсоглашение №2 от 09.10.2026" />
              <p className="text-xs text-muted-foreground">Обязательно при смене срока, модулей, камер или статуса.</p>
            </div>}

        {error && <p role="alert" className="text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Сохранение…' : creating ? 'Завести лицензию' : 'Сохранить'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
