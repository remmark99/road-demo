import { readReportRows } from '@/lib/exports/read-report-rows'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notificationPeriodBounds, buildCameraPlaces, filteredCameraIndexes } from '@/lib/notifications/feed-filters'
import { cameraEventSheet, sensorEventSheet } from '@/lib/exports/notification-events'
import { createXlsx } from '@/lib/exports/xlsx'
import { ALERT_TYPE_CONFIG, type LyingPersonEpisode } from '@/lib/api/alerts'
import { CATEGORY_LABELS, ALARM_CONFIG, type ControllerAlert } from '@/lib/api/controller-alerts'
import type { Alert, Camera } from '@/lib/types'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
 const db=await createClient(),{data:{user},error}=await db.auth.getUser()
 if(error||!user)return NextResponse.json({error:'Войдите в систему'},{status:401})
 const {data:profile,error:profileError}=await db.from('profiles').select('role,modules').eq('id',user.id).single()
 if(profileError||!profile)return NextResponse.json({error:'Нет доступа к отчёту'},{status:403})
 const params=request.nextUrl.searchParams,channel=params.get('channel'),admin=profile.role==='admin',modules:string[]=profile.modules||[]
 if(!['cameras','sensors'].includes(channel||''))return NextResponse.json({error:'Выберите камеры или датчики'},{status:400})
 if(!admin&&(!modules.length||(channel==='sensors'&&!modules.includes('stops'))))return NextResponse.json({error:'Нет доступа к отчёту'},{status:403})
 const from=params.get('from')||'',to=params.get('to')||''
 let bounds
 const list=(key:string)=>{const value=params.get(key);if(value===null||value==='')return [];const items=value.split(',');if(items.length>500||items.some(x=>!x||x.length>80||!/^[-\w ]+$/.test(x)))throw new Error('Некорректный фильтр');return items}
 const numbers=(key:string)=>list(key).map(x=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<0)throw new Error('Некорректный фильтр');return n})
 let types:string[],selected:number[],elements:number[],alarms:string[],categories:string[]
 try{bounds=notificationPeriodBounds({from,to});types=list('types');selected=numbers('cameras');elements=numbers('elements');alarms=list('alarms');categories=list('categories')}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400})}
 try{
  const geometry=(admin||modules.includes('stops'))?await db.rpc('get_bus_stops_geojson'):{data:{features:[]},error:null}
  if(geometry.error)throw new Error('Не удалось прочитать адреса остановок')
  const stops=(geometry.data?.features||[]).map((f:{properties:Record<string,unknown>})=>f.properties)
  const stopNames=new Map<number,string>(stops.map((p:{id:number;address?:string;name?:string})=>[p.id,p.address||p.name||'Адрес не указан']))
  let sheet
  if(channel==='cameras'){
   const cameras=await readReportRows<Record<string,unknown>>((a,b)=>{let q=db.from('cameras').select('camera_index,bus_stop_id,module,name,description').order('camera_index').range(a,b);if(!admin)q=q.in('module',modules);return q})
   const places=buildCameraPlaces(cameras.map(c=>({cameraIndex:c.camera_index,busStopId:c.bus_stop_id,module:c.module,name:c.name,description:c.description}) as Camera),stops)
   const indexes=filteredCameraIndexes(places,params.get('search')||'',selected)
   const rows=indexes?.length===0?[]:await readReportRows<Alert>((a,b)=>{
    let q=db.from('alerts_with_bin_episodes').select('*').order('timestamp').order('id').range(a,b)
    if(!admin)q=q.in('module_name',modules)
    if(bounds.fromInclusive)q=q.gte('timestamp',bounds.fromInclusive)
    if(bounds.toExclusive)q=q.lt('timestamp',bounds.toExclusive)
    if(types.length)q=q.in('alert_type',types)
    if(indexes){const aliases=indexes.filter(i=>i>=10000).map(i=>i-10000);q=aliases.length?q.or(`camera_index.in.(${indexes.join(',')}),and(module_name.eq.stops,camera_index.in.(${aliases.join(',')}))`):q.in('camera_index',indexes)}
    return q
   })
   const ids=[...new Set(rows.filter(a=>a.alert_type==='lying_person').map(a=>a.metadata?.episode_id).filter((id):id is string=>typeof id==='string'))],episodes=new Map<string,LyingPersonEpisode>()
   for(let i=0;i<ids.length;i+=100){const {data,error}=await db.from('lying_person_episodes').select('*').in('id',ids.slice(i,i+100));if(error)throw new Error('Не удалось прочитать длительность событий');for(const e of data||[])episodes.set(e.id,e)}
   sheet=cameraEventSheet(rows,episodes,a=>{const p=places.find(p=>p.cameraIndexes.includes(a.camera_index??-1)||(a.module_name==='stops'&&p.cameraIndexes.some(i=>i>=10000&&i-10000===a.camera_index)));return p?[p.label,p.detail].filter(Boolean).join(' · '):'Адрес не указан'},type=>ALERT_TYPE_CONFIG[type]?.label||'Другое событие')
  }else{
   const rows=await readReportRows<ControllerAlert>((a,b)=>{
    let q=db.from('controller_alerts').select('*').eq('module_name','stops').order('created_at').order('id').range(a,b)
    if(bounds.fromInclusive)q=q.gte('created_at',bounds.fromInclusive)
    if(bounds.toExclusive)q=q.lt('created_at',bounds.toExclusive)
    if(elements.length)q=q.in('element',elements)
    if(alarms.length)q=q.in('alarm',alarms)
    if(categories.length)q=q.in('category',categories)
    return q
   })
   sheet=sensorEventSheet(rows,a=>stopNames.get(a.bus_stop_id??-1)||'Адрес не указан',a=>{const name=CATEGORY_LABELS[a.category]||'Событие датчика';const unit=a.category==='temperature'?'°C':a.category==='humidity'?'%':a.category==='digital input'?'В':null;return unit&&Number.isFinite(a.value)?`${name}: ${a.value.toLocaleString('ru-RU')} ${unit}`:name},alarm=>ALARM_CONFIG[alarm]?.label||'Зафиксировано')
  }
  const day=(v:string)=>v.split('-').reverse().join('.')
  const period=from&&to?`с ${day(from)} по ${day(to)}`:from?`с ${day(from)}`:to?`по ${day(to)}`:'за всё время'
  return new NextResponse(Buffer.from(createXlsx([sheet])),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`События ${channel==='cameras'?'камер':'датчиков'} ${period}.xlsx`)}`,'Cache-Control':'private, no-store'}})
 }catch(e){console.error('Notification export failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:e instanceof Error?e.message:'Не удалось сформировать Excel'},{status:503})}
}
