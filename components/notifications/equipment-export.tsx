"use client"

import { sessionRequest } from '@/lib/request-cache'
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

export function EquipmentExport({ compact = false }: { compact?: boolean }) {
    const [equipment,setEquipment]=useState('all')
    const [search,setSearch]=useState('')
    const [from, setFrom] = useState(() => localDate(Date.now() - 6 * 86400_000))
    const [to, setTo] = useState(() => localDate(Date.now()))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [report, setReport] = useState<MapInventoryReport | null>(null)
    const [loading, setLoading] = useState(false)
    useEffect(() => {
        if (compact) return
        setReport(null)
        setError(null)
        const controller = new AbortController()
        setLoading(true)
        sessionRequest('equipment-register', 30_000, async () => {
                const response = await fetch(`/api/equipment/export?${new URLSearchParams({ from: localDate(Date.now()), to: localDate(Date.now()), format: 'inventory' })}`)
                const data = await response.json()
                if (!response.ok) throw new Error(data.error || 'Не удалось загрузить сводку')
                return data as MapInventoryReport
            }).then(data => { if (!controller.signal.aborted) setReport(data) })
            .catch(e => { if (!controller.signal.aborted) setError(e.message) })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [compact])
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
    const downloadControls = (
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
    )
    if (compact) return <div className="mb-4">{downloadControls}{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</div>
    return <Card className="mb-6 min-w-0 max-w-full">
        <CardContent className="min-w-0 space-y-3 p-4">
            <div>
                <h2 className="font-semibold">Камеры и остановки на карте</h2>
            </div>
            {downloadControls}
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
                <p className="text-sm text-muted-foreground">Найдено: {inventory.length}</p>
                <div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr>{['№','Номер остановки','Остановка / место','Есть камеры','Есть датчики','Камеры'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{inventory.map((s,i)=><tr key={s.id} className="border-t align-top even:bg-muted/20"><td className="p-3">{i+1}</td><td className="p-3 whitespace-nowrap">{s.number}</td><td className="p-3">{s.name}{s.place!==s.name&&<p className="text-xs text-muted-foreground">{s.place}</p>}</td><td className="p-3">{s.cameras?`Да (${s.cameras})`:'Нет'}</td><td className="p-3">{s.sensors?'Да':'Нет'}</td><td className="p-3 whitespace-pre-line">{s.cameraNames||'—'}</td></tr>)}{!inventory.length&&<tr><td colSpan={6} className="p-4 text-muted-foreground">Нет остановок по выбранным условиям.</td></tr>}</tbody></table></div>
            </>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
    </Card>
}
