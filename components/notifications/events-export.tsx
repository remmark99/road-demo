"use client"
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notificationPeriodBounds, type NotificationPeriod } from '@/lib/notifications/feed-filters'
export function EventsExport({channel,period,filters}:{channel:'cameras'|'sensors';period:NotificationPeriod;filters:Record<string,string|undefined>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function download() {
    setBusy(true);setError('')
    try {
      notificationPeriodBounds(period)
      const params=new URLSearchParams({channel,from:period.from,to:period.to})
      if(period.start)params.set('start',period.start)
      if(period.end)params.set('end',period.end)
      Object.entries(filters).forEach(([key,value])=>{if(value?.trim()) params.set(key,value)})
      const response=await fetch(`/api/notifications/export?${params}`)
      if(!response.ok) throw new Error((await response.json().catch(()=>({}))).error || 'Не удалось сформировать Excel')
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a')
      link.href=url
      const filename=response.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1]
      link.download=filename ? decodeURIComponent(filename) : `События ${channel === 'cameras' ? 'камер' : 'датчиков'}.xlsx`
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
    } catch(e) {setError(e instanceof Error ? e.message : 'Не удалось скачать Excel')} finally {setBusy(false)}
  }
  return <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" className="h-9 gap-2 font-sans font-normal" disabled={busy} onClick={download}>{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}{busy ? 'Формирование…' : 'Скачать события в Excel'}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
}
