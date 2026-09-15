"use client"
import { useState } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { searchCameraPlaces, type CameraPlace } from '@/lib/notifications/feed-filters'

export function CameraPlaceFilter({ places, query, selected, onQueryChange, onSelectionChange }: {
  places: CameraPlace[]; query: string; selected: number[]; onQueryChange: (value: string) => void; onSelectionChange: (value: number[]) => void
}) {
  const [directoryQuery, setDirectoryQuery] = useState('')
  const selectedPlaces = places.filter(place => place.cameraIndexes.some(index => selected.includes(index)))
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Поиск остановки или адреса" placeholder="Остановка, улица или номер остановки" value={query} onChange={e => onQueryChange(e.target.value)} /></div>
      <Dialog>
        <DialogTrigger asChild><Button variant="outline" className="gap-2"><BookOpen className="h-4 w-4" />Справочник</Button></DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Остановки и места установки камер</DialogTitle><DialogDescription>Отметьте нужные места — в списке останутся события только с этих камер.</DialogDescription></DialogHeader>
          <Input aria-label="Поиск в справочнике" placeholder="Найти по названию, адресу или номеру" value={directoryQuery} onChange={e => setDirectoryQuery(e.target.value)} />
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {searchCameraPlaces(places, directoryQuery).map(place => {
              const count = place.cameraIndexes.filter(index => selected.includes(index)).length
              return <label key={place.key} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted">
                <Checkbox className="mt-1" checked={count === place.cameraIndexes.length ? true : count ? 'indeterminate' : false} onCheckedChange={checked => onSelectionChange(checked === true ? [...new Set([...selected, ...place.cameraIndexes])] : selected.filter(index => !place.cameraIndexes.includes(index)))} />
                <span><span className="block text-sm font-medium">{place.label}</span>{place.detail && <span className="block text-xs text-muted-foreground">{place.detail}</span>}</span>
              </label>
            })}
            {searchCameraPlaces(places, directoryQuery).length === 0 && <p className="p-4 text-sm text-muted-foreground">Ничего не найдено</p>}
          </div>
          <Button variant="outline" onClick={() => onSelectionChange([])}>Снять все отметки</Button>
        </DialogContent>
      </Dialog>
    </div>
    {selectedPlaces.length > 0 && <div className="flex flex-wrap gap-2">{selectedPlaces.map(place => <Button key={place.key} size="sm" variant="secondary" className="h-auto max-w-full gap-2 whitespace-normal text-left" onClick={() => onSelectionChange(selected.filter(index => !place.cameraIndexes.includes(index)))}>{place.label}{place.detail ? ` · ${place.detail}` : ''}<X className="h-3 w-3 shrink-0" /></Button>)}</div>}
  </div>
}
