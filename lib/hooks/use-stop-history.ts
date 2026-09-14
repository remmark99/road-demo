"use client"
import { useEffect, useMemo, useState } from 'react'
import { stopHistoryAt, type StopHistory } from '@/lib/stop-history'

export function useStopHistory(at: Date | null, enabled: boolean) {
    const [history, setHistory] = useState<StopHistory | null>(null)
    const [error, setError] = useState<string | null>(null)
    useEffect(() => {
        if (!enabled) { setHistory(null); return }
        const controller = new AbortController()
        const refresh = async () => {
            try {
                const response = await fetch('/api/stop-history', { signal: controller.signal, cache: 'no-store' })
                const data = await response.json()
                if (!response.ok) throw new Error(data.error || 'Не удалось загрузить историю')
                if (!controller.signal.aborted) { setHistory(data); setError(null) }
            } catch (e) {
                if (!controller.signal.aborted) { setHistory(null); setError((e as Error).message) }
            }
        }
        void refresh()
        const timer = setInterval(refresh, 60_000)
        return () => { controller.abort(); clearInterval(timer) }
    }, [enabled])
    const time = at?.getTime()
    const snapshot = useMemo(() => time == null ? null : stopHistoryAt(history, time), [history, time])
    return { snapshot, loading: !history && !error, error }
}
