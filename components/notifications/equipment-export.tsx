"use client"

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function localDate(time: number) {
    return new Date(time + 5 * 3_600_000).toISOString().slice(0, 10)
}

export function EquipmentExport() {
    const [from, setFrom] = useState(() => localDate(Date.now() - 6 * 86400_000))
    const [to, setTo] = useState(() => localDate(Date.now()))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
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
            link.download = `equipment-hourly-${from}-${to}.xlsx`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось скачать Excel') }
        finally { setBusy(false) }
    }
    return <Card className="mb-6">
        <CardContent className="space-y-3 p-4">
            <div>
                <h2 className="font-semibold">Активность камер и остановок — Excel</h2>
                <p className="mt-1 text-sm text-muted-foreground">По часам, UTC+5. Остановка активна, если хотя бы одна её камера работала в течение часа.</p>
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
            <p className="text-xs text-muted-foreground">Период — до 366 дней. Пробелы в истории отмечаются в файле; неизвестные значения не заменяются нулями.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
    </Card>
}
