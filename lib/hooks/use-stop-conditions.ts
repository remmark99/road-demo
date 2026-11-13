"use client"
import { useEffect, useState } from 'react'
import type { StopConditionsResponse } from '@/lib/stop-conditions'

const HOUR = 3_600_000

/** История для слоя «Состояние остановок» за окно слайдера; живое окно обновляется раз в 5 минут. */
export function useStopConditions(enabled: boolean, range: { from: Date; to: Date } | null | undefined) {
    const [data, setData] = useState<StopConditionsResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    // Окно сдвигается каждую минуту; перечитываем, только когда меняется час.
    const fromHour = range ? Math.floor(range.from.getTime() / HOUR) : null
    const toHour = range ? Math.ceil(range.to.getTime() / HOUR) : null
    useEffect(() => {
        if (!enabled) return
        const controller = new AbortController()
        const load = async () => {
            try {
                const params = new URLSearchParams()
                if (fromHour !== null) params.set('from', new Date(fromHour * HOUR).toISOString())
                if (toHour !== null) params.set('to', new Date(toHour * HOUR).toISOString())
                const response = await fetch(`/api/stop-conditions?${params}`, { signal: controller.signal, cache: 'no-store' })
                const body = await response.json()
                if (!response.ok) throw new Error(body.error || 'Не удалось загрузить состояние остановок')
                if (!controller.signal.aborted) { setData(body); setError(null) }
            } catch (e) {
                if (!controller.signal.aborted) setError((e as Error).message)
            }
        }
        void load()
        const timer = setInterval(load, 5 * 60_000)
        return () => { controller.abort(); clearInterval(timer) }
    }, [enabled, fromHour, toHour])
    return { data: enabled ? data : null, error: enabled ? error : null }
}
