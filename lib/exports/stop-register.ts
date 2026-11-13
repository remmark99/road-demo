import type { Sheet } from './xlsx'
import type { BusStopsGeoJSON } from '../api/bus-stops'
import { monitoredCameraOnline, monitoredOnline, type EquipmentStatusIndex } from '../equipment-status'
import { equipmentLocalTime } from './equipment-hours'

export interface RegisterCamera { camera_index:number; bus_stop_id:number|null; name?:string|null; description?:string|null; lat:number|null; lng:number|null }
export interface RegisterStop { id:number; number:string; name:string; place:string; cameras:number; sensors:boolean; equipment:string; cameraNames:string }
export function coordinates(lat:number|null|undefined,lng:number|null|undefined):string {
 return typeof lat==='number' && typeof lng==='number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180 && (lat!==0 || lng!==0) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : ''
}
export function cameraPlace(camera:RegisterCamera, geometry:BusStopsGeoJSON):string {
 const stop=geometry.features.find(f=>f.properties.id===camera.bus_stop_id)
 const p=stop?.properties
 const place=p?.address?.trim() || p?.name?.trim() || camera.description?.trim() || coordinates(camera.lat,camera.lng)
 if(!place)throw new Error(`У камеры №${camera.camera_index} нет места установки. Заполните адрес или координаты в справочнике.`)
 return [p?.name && p.name!==place?p.name:null,place,p?.short_name?`№ ${p.short_name}`:null].filter(Boolean).join(' · ')
}
export function stopRegister(geometry:BusStopsGeoJSON,cameras:RegisterCamera[],controllers:{id:number;has_controller:boolean|null;ip_address:string|null}[]):RegisterStop[] {
 const sensors=new Set(controllers.filter(c=>c.has_controller || c.ip_address?.trim()).map(c=>c.id))
 return geometry.features.map(f=>{
  const p=f.properties, owned=cameras.filter(c=>c.bus_stop_id===p.id), hasSensors=sensors.has(p.id)
  const place=p.address?.trim() || p.name?.trim() || coordinates(f.geometry?.coordinates?.[1],f.geometry?.coordinates?.[0])
  if(!place)throw new Error(`У остановки №${p.id} нет адреса или координат в справочнике.`)
  return {id:p.id,number:p.short_name?.trim()||`ID ${p.id}`,name:p.name?.trim()||place,place,cameras:owned.length,sensors:hasSensors,equipment:owned.length?(hasSensors?'Камеры и датчики':'Только камеры'):(hasSensors?'Только датчики':'Нет оборудования'),cameraNames:owned.map(c=>`${c.name?.trim()||'Камера'} (№ ${c.camera_index})`).join('\n')}
 }).sort((a,b)=>a.name.localeCompare(b.name,'ru',{numeric:true})||a.number.localeCompare(b.number,'ru',{numeric:true}))
}
/** Состояние оборудования на момент формирования файла, а не история за период. */
export interface RegisterLiveStatus { at: number; status: EquipmentStatusIndex; period?: string }
const statusLabel=(online:boolean|null)=>online===null?'Нет данных':online?'В сети':'Не в сети'
export function registerSheets(stops:RegisterStop[],cameras:RegisterCamera[],geometry:BusStopsGeoJSON,live?:RegisterLiveStatus):Sheet[] {
 const cameraOnline=(c:RegisterCamera)=>live?monitoredCameraOnline(live.status.cameras,c.camera_index):null
 const stopCameras=(s:RegisterStop)=>{
  const owned=cameras.filter(c=>c.bus_stop_id===s.id)
  if(!owned.length)return '—'
  return `${owned.filter(c=>cameraOnline(c)===true).length} из ${owned.length}`
 }
 const stopSensors=(s:RegisterStop)=>s.sensors?statusLabel(monitoredOnline(live!.status.controllers,s.id)):'—'
 const header=['№','Номер','Остановка','Адрес','Камеры','Датчики',...(live?['Камер в сети на момент выгрузки','Датчики на момент выгрузки']:[])]
 const sheet=(name:string,items:RegisterStop[]):Sheet=>({name,columnWidths:[7,14,32,44,12,12,...(live?[18,18]:[])],wrapColumns:[2,3],rows:[header,...items.map((s,i)=>[i+1,s.number,s.name,s.place,s.cameras?'Да':'Нет',s.sensors?'Да':'Нет',...(live?[stopCameras(s),stopSensors(s)]:[])])]})
 const cameraSheet:Sheet={name:'Камеры',columnWidths:[10,18,32,55,20,...(live?[18]:[])],wrapColumns:[2,3],rows:[['№','Камера','Название','Место','Остановка',...(live?['На момент выгрузки']:[])],...cameras.map((c,i)=>[i+1,c.camera_index,c.name?.trim()||`Камера №${c.camera_index}`,cameraPlace(c,geometry),stops.find(s=>s.id===c.bus_stop_id)?.number||'Вне остановки',...(live?[statusLabel(cameraOnline(c))]:[])])]}
 if(!live)return [sheet('Все остановки',stops),cameraSheet]
 const camerasOnline=cameras.filter(c=>cameraOnline(c)===true).length
 const sensorStops=stops.filter(s=>s.sensors)
 const sensorsOnline=sensorStops.filter(s=>monitoredOnline(live.status.controllers,s.id)===true).length
 const about:Sheet={name:'Выгрузка',columnWidths:[40,40],rows:[['Параметр','Значение'],
  ['Сформирован (время Сургута, UTC+5)',equipmentLocalTime(live.at)],
  ...(live.period?[['Период отчёта',live.period]]:[]),
  ['Камер в сети на момент выгрузки',`${camerasOnline} из ${cameras.length}`],
  ['Остановок с датчиками в сети на момент выгрузки',`${sensorsOnline} из ${sensorStops.length}`]]}
 return [about,sheet('Все остановки',stops),cameraSheet]
}
