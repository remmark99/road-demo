import type { Alert } from '@/lib/types'
import type { LyingPersonEpisode } from '@/lib/api/alerts'
import type { ControllerAlert } from '@/lib/api/controller-alerts'
import type { Sheet } from './xlsx'
import { getBinEpisode } from '@/lib/bin-episodes'
import { getAbandonedEpisode } from '@/lib/notifications/abandoned-episode'
import { formatEventDuration } from '@/lib/notifications/feed-filters'

export function reportTime(value: string | null | undefined): string {
  if(!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Date(Date.parse(value)+5*3600000).toISOString().slice(0,16).replace('T',' ').replace(/^(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1')
}
export function cameraEventSheet(alerts:Alert[], episodes:Map<string,LyingPersonEpisode>, place:(a:Alert)=>string, label:(type:string)=>string, now=Date.now()):Sheet {
  return {name:'События камер',columnWidths:[38,30,22,22,23,20],wrapColumns:[0,1],rows:[['Место','Событие','Начало (Сургут)','Завершение (Сургут)','Длительность','Статус'],...alerts.map(a=>{
    const episode=getBinEpisode(a)||getAbandonedEpisode(a)||episodes.get(String(a.metadata?.episode_id))
    return [place(a),label(a.alert_type),reportTime(episode?.started_at||a.timestamp),episode?.status==='open'?'Продолжается':reportTime(episode?.ended_at),episode?formatEventDuration(episode.started_at,episode.status==='open'?new Date(now).toISOString():episode.ended_at||episode.last_seen_at):'Не определена',episode?(episode.status==='open'?'Продолжается':'Завершено'):'Зафиксировано']
  })]}
}
export function sensorEventSheet(alerts:ControllerAlert[],place:(a:ControllerAlert)=>string,label:(a:ControllerAlert)=>string,status:(alarm:string)=>string):Sheet {
 return {name:'События датчиков',columnWidths:[38,38,22,22,23,20],wrapColumns:[0,1],rows:[['Место','Событие','Начало (Сургут)','Завершение (Сургут)','Длительность','Статус'],...alerts.map(a=>{
  const recovered=a.category==='controller_online' && Number.isFinite(a.value) && a.value>=0
  const start=recovered?new Date(Date.parse(a.created_at)-a.value*60000).toISOString():a.created_at
  return [place(a),label(a),reportTime(start),recovered?reportTime(a.created_at):'—',recovered?formatEventDuration(start,a.created_at):'Не определена',recovered?'Связь восстановлена':status(a.alarm)]
 })]}
}
