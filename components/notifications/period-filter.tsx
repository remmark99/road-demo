"use client"
import { useRef, useState } from 'react'
import { DateRangePicker } from '@/components/date-range-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notificationDate, notificationPeriodBounds, type NotificationPeriod } from '@/lib/notifications/feed-filters'

export function PeriodFilter({ value, onChange }: { value: NotificationPeriod; onChange: (value: NotificationPeriod) => void }) {
  const [open, setOpen] = useState(false)
  const custom = useRef(false)
  const today = notificationDate(), ago = (days: number) => notificationDate(Date.now() - days * 86400_000)
  const presets: Record<string, NotificationPeriod> = { all: {from:'',to:''}, today: {from:today,to:today}, yesterday: {from:ago(1),to:ago(1)}, week:{from:ago(6),to:today}, month:{from:ago(29),to:today} }
  const preset = Object.keys(presets).find(key => presets[key].from === value.from && presets[key].to === value.to) || 'custom'
  return <div className="flex flex-wrap items-center gap-2">
    <Select value={preset} onValueChange={key => { if (presets[key]) onChange(presets[key]); else custom.current = true }}>
      <SelectTrigger aria-label="Период уведомлений" className="h-9 w-[145px]"><SelectValue /></SelectTrigger>
      <SelectContent onCloseAutoFocus={event => { if (!custom.current) return; custom.current = false; event.preventDefault(); setOpen(true) }}>{[['all','Всё время'],['today','Сегодня'],['yesterday','Вчера'],['week','Неделя'],['month','Месяц'],['custom','Свой период']].map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
    </Select>
    <DateRangePicker value={value} onChange={onChange} validate={notificationPeriodBounds} label={preset === 'custom' ? undefined : 'Выбрать даты'} open={open} onOpenChange={setOpen} />
  </div>
}
