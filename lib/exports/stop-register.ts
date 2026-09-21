import type { Sheet } from './xlsx'
import type { BusStopsGeoJSON } from '../api/bus-stops'

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
export function registerSheets(stops:RegisterStop[],cameras:RegisterCamera[],geometry:BusStopsGeoJSON):Sheet[] {
 const header=['№ п/п','Номер остановки','Остановка','Место','Есть камеры','Есть датчики','Оборудование','Количество камер','Камеры']
 const sheet=(name:string,items:RegisterStop[]):Sheet=>({name,columnWidths:[10,18,32,45,16,16,24,20,42],wrapColumns:[2,3,8],rows:[header,...items.map((s,i)=>[i+1,s.number,s.name,s.place,s.cameras?'Да':'Нет',s.sensors?'Да':'Нет',s.equipment,s.cameras,s.cameraNames||'—'])]})
 return [sheet('Все остановки',stops),sheet('Есть камеры',stops.filter(s=>s.cameras>0)),sheet('Есть датчики',stops.filter(s=>s.sensors)),sheet('Только камеры',stops.filter(s=>s.cameras>0&&!s.sensors)),sheet('Только датчики',stops.filter(s=>!s.cameras&&s.sensors)),sheet('Нет оборудования',stops.filter(s=>!s.cameras&&!s.sensors)),{name:'Камеры',columnWidths:[10,18,32,55,20],wrapColumns:[2,3],rows:[['№ п/п','Номер камеры','Название камеры','Место установки','Номер остановки'],...cameras.map((c,i)=>[i+1,c.camera_index,c.name?.trim()||`Камера №${c.camera_index}`,cameraPlace(c,geometry),stops.find(s=>s.id===c.bus_stop_id)?.number||'Вне остановки'])]}]
}
