"use client"

import { useEffect, useState } from 'react'
import type { MapInventoryReport } from '@/lib/exports/map-inventory'
import { mapReportFilename } from '@/lib/exports/filename'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function localDate(time: number) {
    return new Date(time + 5 * 3_600_000).toISOString().slice(0, 10)
}

export function EquipmentExport() {
    const [equipment,setEquipment]=useState('all')
    const [search,setSearch]=useState('')
    const [from, setFrom] = useState(() => localDate(Date.now() - 6 * 86400_000))
    const [to, setTo] = useState(() => localDate(Date.now()))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [report, setReport] = useState<MapInventoryReport | null>(null)
    const [loading, setLoading] = useState(false)
    useEffect(() => {
        setReport(null)
        setError(null)
        if (!from || !to || from > to) { setLoading(false); return }
        const controller = new AbortController()
        setLoading(true)
        fetch(`/api/equipment/export?${new URLSearchParams({ from, to, format: 'json' })}`, { signal: controller.signal })
            .then(async response => {
                const data = await response.json()
                if (!response.ok) throw new Error(data.error || 'Не удалось загрузить сводку')
                if (!controller.signal.aborted) setReport(data)
            })
            .catch(e => { if (!controller.signal.aborted) setError(e.message) })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [from, to])
    async function download() {
        setBusy(true)
        setError(null)
        try {
            const response = await fetch(`/api/equipment/export?${new URLSearchParams({ from, to })}`)
            if (!response.ok) {
                const data = await response.json().catch(() => null)
                throw new Error(data?.error || 'Не удалось скачать Excel')
            }
            const url = URL.createObjectURL(await response.blob())
            const link = document.createElement('a')
            link.href = url
            link.download = mapReportFilename(from, to)
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось скачать Excel') }
        finally { setBusy(false) }
    }
    const inventory=(report?.inventory||[]).filter(s => {
        const matches=equipment==='all'||equipment==='cameras'&&s.cameras>0||equipment==='sensors'&&s.sensors||equipment==='camera-only'&&s.cameras>0&&!s.sensors||equipment==='sensor-only'&&!s.cameras&&s.sensors||equipment==='none'&&!s.cameras&&!s.sensors
        return matches && `${s.number} ${s.name} ${s.place}`.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))
    })
    return <Card className="mb-6 min-w-0 max-w-full">
        <CardContent className="min-w-0 space-y-3 p-4">
            <div>
                <h2 className="font-semibold">Камеры и остановки на карте</h2>
                <p className="mt-1 text-sm text-muted-foreground">Модуль «Остановки». Количество на конец дня, включая объекты без связи.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1"><Label htmlFor="equipment-export-from">С</Label>
                    <Input id="equipment-export-from" type="date" value={from} max={to} disabled={busy} onChange={e => setFrom(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="equipment-export-to">По</Label>
                    <Input id="equipment-export-to" type="date" value={to} min={from} max={localDate(Date.now())} disabled={busy} onChange={e => setTo(e.target.value)} /></div>
                <Button onClick={download} disabled={busy || !from || !to || from > to}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {busy ? 'Формирование…' : 'Скачать Excel'}
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">Время местное (UTC+5). Сегодня — на текущий момент. Время указывается только для проблем. Датчики считаются по оснащённым остановкам. В Excel: списки остановок по оснащению и список камер на момент выгрузки; «По дням» и «Сбои» — за выбранный период. Все листы — таблицы с фильтрами.</p>
            {loading && <p className="text-sm text-muted-foreground" role="status">Загрузка сводки…</p>}
            {report && <>
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">Камер на карте сейчас</p><p className="mt-1 text-2xl font-semibold tabular-nums">{report.current.cameras}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">Остановок на карте сейчас</p><p className="mt-1 text-2xl font-semibold tabular-nums">{report.current.stops}</p></div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1"><Label>Оснащение</Label><Select value={equipment} onValueChange={setEquipment}><SelectTrigger aria-label="Оснащение остановок" className="w-52"><SelectValue /></SelectTrigger><SelectContent>{[['all','Все остановки'],['cameras','Есть камеры'],['sensors','Есть датчики'],['camera-only','Только камеры'],['sensor-only','Только датчики'],['none','Нет оборудования']].map(([v,label])=><SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="min-w-0 flex-1 basis-48 space-y-1"><Label htmlFor="register-search">Остановка, номер или адрес</Label><Input id="register-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск остановки" /></div>
                </div>
                <p className="text-sm text-muted-foreground">Текущее оснащение · Найдено: {inventory.length}. Excel содержит все группы на отдельных листах.</p>
                <div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr>{['№','Номер остановки','Остановка / место','Есть камеры','Есть датчики','Камеры'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{inventory.map((s,i)=><tr key={s.id} className="border-t align-top even:bg-muted/20"><td className="p-3">{i+1}</td><td className="p-3 whitespace-nowrap">{s.number}</td><td className="p-3">{s.name}{s.place!==s.name&&<p className="text-xs text-muted-foreground">{s.place}</p>}</td><td className="p-3">{s.cameras?`Да (${s.cameras})`:'Нет'}</td><td className="p-3">{s.sensors?'Да':'Нет'}</td><td className="p-3 whitespace-pre-line">{s.cameraNames||'—'}</td></tr>)}{!inventory.length&&<tr><td colSpan={6} className="p-4 text-muted-foreground">Нет остановок по выбранным условиям.</td></tr>}</tbody></table></div>
                <h3 className="pt-3 font-medium">История по дням</h3>
                {report.days.some(day => day.cameras === null) && <p className="text-sm text-muted-foreground">Для прошлых дат без сохранённой истории количество не указано.</p>}
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50"><tr><th className="p-3 text-left">Дата</th><th className="p-3 text-right">Камеры</th><th className="p-3 text-right">Остановки</th><th className="p-3 text-right">С датчиками</th><th className="p-3 text-right">Сбои</th><th className="p-3 text-left">Что произошло</th></tr></thead>
                        <tbody>{report.days.map(day => <tr key={day.date} className="border-t align-top">
                            <td className="whitespace-nowrap p-3">{day.date.split('-').reverse().join('.')}</td>
                            <td className="whitespace-nowrap p-3 text-right tabular-nums">{day.cameras ?? 'Нет истории'}</td>
                            <td className="whitespace-nowrap p-3 text-right tabular-nums">{day.stops ?? 'Нет истории'}</td>
                            <td className="p-3 text-right tabular-nums">{day.sensor_stops ?? 'Нет истории'}</td>
                            <td className="p-3 text-right tabular-nums">{day.failures}</td>
                            <td className="p-3 text-muted-foreground">
                                {day.caption && <p className="whitespace-pre-line">{day.caption}</p>}
                                {day.events.length > 0 ? <details className={day.caption ? 'mt-1' : ''}>
                                    <summary className="cursor-pointer text-foreground">Подробности ({day.events.length})</summary>
                                    <div className="mt-2 space-y-1">{day.events.map(event => <p key={event}>{event}</p>)}</div>
                                </details> : !day.caption && '—'}
                            </td>
                        </tr>)}</tbody>
                    </table>
                </div>
            </>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
    </Card>
}
