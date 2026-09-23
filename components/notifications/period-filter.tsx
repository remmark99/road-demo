"use client"
import { useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notificationDate, notificationPeriodBounds, type NotificationPeriod } from '@/lib/notifications/feed-filters'

export function PeriodFilter({ value, onChange }: { value: NotificationPeriod; onChange: (value: NotificationPeriod) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const today = notificationDate(), ago = (days: number) => notificationDate(Date.now() - days * 86400_000)
  const presets: Record<string, NotificationPeriod> = { all: {from:'',to:''}, today: {from:today,to:today}, yesterday: {from:ago(1),to:ago(1)}, week:{from:ago(6),to:today}, month:{from:ago(29),to:today} }
  const preset = Object.keys(presets).find(key => presets[key].from === value.from && presets[key].to === value.to) || 'custom'
  const date = (day: string) => day ? new Date(`${day}T12:00:00`) : undefined
  let error = ''
  try { notificationPeriodBounds(draft) } catch (e) { error = (e as Error).message }
  return <div className="flex flex-wrap items-center gap-2">
    <Select value={preset} onValueChange={key => { if (presets[key]) onChange(presets[key]); else { setDraft(value); setOpen(true) } }}>
      <SelectTrigger aria-label="Период уведомлений" className="h-9 w-[145px]"><SelectValue /></SelectTrigger>
      <SelectContent>{[['all','Всё время'],['today','Сегодня'],['yesterday','Вчера'],['week','Неделя'],['month','Месяц'],['custom','Свой период']].map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
    </Select>
    {value.start && value.end && <span className="text-xs text-muted-foreground">{new Date(value.start).toLocaleTimeString('ru-RU',{timeZone:'Asia/Yekaterinburg',hour:'2-digit',minute:'2-digit'})} — {new Date(value.end).toLocaleTimeString('ru-RU',{timeZone:'Asia/Yekaterinburg',hour:'2-digit',minute:'2-digit'})}</span>}
    <Popover open={open} onOpenChange={next => { if(next) setDraft(value); setOpen(next) }}>
      <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 gap-2 font-normal" aria-label="Выбрать даты"><CalendarDays className="h-4 w-4" />{preset === 'custom' ? `${value.from ? value.from.split('-').reverse().join('.') : 'Начало'} — ${value.to ? value.to.split('-').reverse().join('.') : 'сейчас'}` : 'Выбрать даты'}</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[min(340px,calc(100vw-24px))] p-3">
        <Calendar mode="range" locale={ru} numberOfMonths={1} selected={{from:date(draft.from),to:date(draft.to)}} defaultMonth={date(value.from)} onSelect={range => setDraft({from:range?.from ? format(range.from,'yyyy-MM-dd') : '',to:range?.to ? format(range.to,'yyyy-MM-dd') : ''})} />
        <div className="mt-2 grid grid-cols-2 gap-2"><div><Label htmlFor="notifications-from">С</Label><Input id="notifications-from" type="date" value={draft.from} onChange={e => setDraft({from:e.target.value,to:draft.to})} /></div><div><Label htmlFor="notifications-to">По включительно</Label><Input id="notifications-to" type="date" value={draft.to} onChange={e => setDraft({from:draft.from,to:e.target.value})} /></div></div>
        <p className="mt-2 text-xs text-muted-foreground">По началу события. Время Сургута.</p>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        <Button size="sm" className="mt-3 w-full" disabled={!!error || !draft.from} onClick={() => {onChange({from:draft.from,to:draft.to || draft.from});setOpen(false)}}>Применить</Button>
      </PopoverContent>
    </Popover>
  </div>
}
