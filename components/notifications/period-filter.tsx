"use client"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { notificationDate, notificationPeriodBounds, type NotificationPeriod } from '@/lib/notifications/feed-filters'

export function PeriodFilter({ value, onChange }: { value: NotificationPeriod; onChange: (value: NotificationPeriod) => void }) {
  let error = ''
  try { notificationPeriodBounds(value) } catch (e) { error = (e as Error).message }
  return <div className="mb-6 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label htmlFor="notifications-from">С</Label><Input id="notifications-from" type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="notifications-to">По включительно</Label><Input id="notifications-to" type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} /></div>
      <Button variant="outline" onClick={() => onChange({ from: notificationDate(), to: notificationDate() })}>Сегодня</Button>
      <Button variant="outline" onClick={() => { const day = notificationDate(Date.now() - 86400_000); onChange({ from: day, to: day }) }}>Вчера</Button>
      <Button variant="outline" onClick={() => onChange({ from: notificationDate(Date.now() - 6 * 86400_000), to: notificationDate() })}>7 дней</Button>
      <Button variant="ghost" onClick={() => onChange({ from: '', to: '' })}>Всё время</Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">По дате начала события. Время Сургута.</p>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>
}
