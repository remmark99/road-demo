"use client"
import { useId, useRef, useState } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { searchCameraPlaces, selectCameraPlaceRange, type CameraPlace } from '@/lib/notifications/feed-filters'

export function CameraPlaceFilter({ places, query, selected, onQueryChange, onSelectionChange }: {
  places: CameraPlace[]; query: string; selected: number[]; onQueryChange: (value: string) => void; onSelectionChange: (value: number[]) => void
}) {
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const rangeAnchor = useRef<string | null>(null)
  const shiftPressed = useRef(false)
  const directoryPlaces = searchCameraPlaces(places, directoryQuery)
  const suggestionsId = useId()
  const suggestions = searchCameraPlaces(places, query)
    .filter(place => !place.cameraIndexes.every(index => selected.includes(index))).slice(0, 8)
  const addPlace = (place: CameraPlace) => {
    onSelectionChange([...new Set([...selected, ...place.cameraIndexes])])
    onQueryChange('')
    setSuggestionsOpen(false)
    setActiveSuggestion(-1)
  }
  const selectedPlaces = places.filter(place => place.cameraIndexes.some(index => selected.includes(index)))
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSuggestionsOpen(false) }}>
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 pr-9" aria-label="Поиск остановки или адреса" placeholder="Остановка, улица или номер остановки"
          role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls={suggestionsId}
          aria-activedescendant={suggestionsOpen && activeSuggestion >= 0 && suggestions[activeSuggestion] ? `${suggestionsId}-${activeSuggestion}` : undefined}
          value={query} onFocus={() => setSuggestionsOpen(true)}
          onChange={event => { onQueryChange(event.target.value); setSuggestionsOpen(true); setActiveSuggestion(-1) }}
          onKeyDown={event => {
            if (event.key === 'Escape') { setSuggestionsOpen(false); setActiveSuggestion(-1) }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setSuggestionsOpen(true)
              setActiveSuggestion(index => suggestions.length ? (index < 0 ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length) : -1)
            }
            if (event.key === 'Enter' && suggestionsOpen && suggestions[activeSuggestion]) { event.preventDefault(); addPlace(suggestions[activeSuggestion]) }
          }} />
        {query && <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-9" aria-label="Очистить поиск остановки" onClick={() => { onQueryChange(''); setActiveSuggestion(-1); setSuggestionsOpen(false) }}><X className="size-4" /></Button>}
        {suggestionsOpen && <div id={suggestionsId} role="listbox" aria-label="Подсказки остановок" className="absolute top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {suggestions.map((place, index) => <button type="button" role="option" aria-selected={activeSuggestion === index} id={`${suggestionsId}-${index}`} key={place.key}
            className={`w-full rounded-sm px-3 py-2 text-left hover:bg-accent ${activeSuggestion === index ? 'bg-accent' : ''}`}
            onMouseDown={event => event.preventDefault()} onClick={() => addPlace(place)}>
            <span className="block text-sm font-medium">{place.label}</span>
            {place.detail && <span className="block text-xs text-muted-foreground">{place.detail}</span>}
          </button>)}
          {suggestions.length === 0 && <p className="p-3 text-sm text-muted-foreground">Новых совпадений нет</p>}
        </div>}
      </div>
      <Dialog onOpenChange={() => { rangeAnchor.current = null; shiftPressed.current = false }}>
        <DialogTrigger asChild><Button variant="outline" className="gap-2"><BookOpen className="h-4 w-4" />Справочник</Button></DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Остановки и места установки камер</DialogTitle><DialogDescription>Отметьте нужные места — в списке останутся события только с этих камер.</DialogDescription></DialogHeader>
          <Input aria-label="Поиск в справочнике" placeholder="Найти по названию, адресу или номеру" value={directoryQuery} onChange={e => { setDirectoryQuery(e.target.value); rangeAnchor.current = null }} />
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {directoryPlaces.map(place => {
              const count = place.cameraIndexes.filter(index => selected.includes(index)).length
              return <div key={place.key} onClickCapture={event => { shiftPressed.current = event.shiftKey || (event.detail === 0 && shiftPressed.current) }} onClick={event => { if ((event.target as Element).closest('[role="checkbox"]')) return; onSelectionChange(selectCameraPlaceRange(directoryPlaces, selected, place.key, event.shiftKey ? rangeAnchor.current : null, count !== place.cameraIndexes.length)); rangeAnchor.current = place.key; shiftPressed.current = false }} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted">
                <Checkbox className="mt-1" aria-label={`${place.label}${place.detail ? ` · ${place.detail}` : ''}`} checked={count === place.cameraIndexes.length ? true : count ? 'indeterminate' : false} onKeyDown={event => { shiftPressed.current = event.shiftKey }} onCheckedChange={checked => { onSelectionChange(selectCameraPlaceRange(directoryPlaces, selected, place.key, shiftPressed.current ? rangeAnchor.current : null, checked === true)); rangeAnchor.current = place.key; shiftPressed.current = false }} />
                <span><span className="block text-sm font-medium">{place.label}</span>{place.detail && <span className="block text-xs text-muted-foreground">{place.detail}</span>}</span>
              </div>
            })}
            {directoryPlaces.length === 0 && <p className="p-4 text-sm text-muted-foreground">Ничего не найдено</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={directoryPlaces.length === 0} title="Выбрать все остановки в результатах поиска" onClick={() => { onSelectionChange([...new Set([...selected, ...directoryPlaces.flatMap(place => place.cameraIndexes)])]); rangeAnchor.current = null }}>Выбрать все</Button>
            <Button type="button" variant="outline" disabled={selected.length === 0} onClick={() => { onSelectionChange([]); rangeAnchor.current = null }}>Убрать все</Button>
            <span className="text-xs text-muted-foreground">Shift + щелчок — диапазон</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    {selectedPlaces.length > 0 && <div className="flex flex-wrap gap-2">{selectedPlaces.map(place => <div key={place.key} className="flex max-w-full items-center gap-2 rounded-md bg-secondary py-1 pl-3 pr-1 text-sm text-secondary-foreground">
      <span>{place.label}{place.detail ? ` · ${place.detail}` : ''}</span>
      <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`Убрать остановку: ${place.label}${place.detail ? ` · ${place.detail}` : ''}`} onClick={() => onSelectionChange(selected.filter(index => !place.cameraIndexes.includes(index)))}><X className="size-4" /></Button>
    </div>)}</div>}
  </div>
}
