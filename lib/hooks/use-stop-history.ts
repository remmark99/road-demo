"use client"
import { useEffect, useMemo, useState } from 'react'
import { stopHistoryAt, type StopHistory } from '@/lib/stop-history'

/** `from` — начало окна слайдера: история читается только за него. */
export function useStopHistory(at: Date | null, enabled: boolean, from?: Date | null) {
    const [history, setHistory] = useState<StopHistory | null>(null)
    const [error, setError] = useState<string | null>(null)
    const historyEnabled = enabled && at !== null
    // Окно сдвигается каждую минуту, а перечитывать историю нужно, только когда меняется его начало по часам.
    const fromHour = from ? Math.floor(from.getTime() / 3_600_000) : null
    useEffect(() => {
        if (!historyEnabled) { setHistory(null); return }
        const controller = new AbortController()
        const refresh = async () => {
            try {
                const query = fromHour === null ? '' : `?from=${new Date(fromHour * 3_600_000).toISOString()}`
                const response = await fetch(`/api/stop-history${query}`, { signal: controller.signal, cache: 'no-store' })
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
    }, [historyEnabled, fromHour])
    const time = at?.getTime()
    const snapshot = useMemo(() => time == null ? null : stopHistoryAt(history, time), [history, time])
    return { snapshot, loading: historyEnabled && !history && !error, error }
}
