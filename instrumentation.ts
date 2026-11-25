// Фоновые задачи сайта. Прогрев кэшей аналитики остановок при старте сервера и раз в 4 минуты:
// открытие вкладки «Аналитика» не должно ждать базу. Прогрев кладёт готовые ответы в общий
// кэш процесса (lib/server/shared-cache.ts) — тот же, из которого отвечают маршруты.
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return
    const DAY = 24 * 3_600_000
    const CITY_OFFSET = 5 * 3_600_000
    const WARM_EVERY_MS = 4 * 60_000
    let running = false
    const warm = async () => {
        if (running) return
        running = true
        const started = Date.now()
        try {
            const [{ createNotificationAdminClient }, { getStopConditionsCached }, { readSignificantOutagesCached }, { getStopLoadPayloadCached }, { analyticsClimateChunks, analyticsLoadRange }] = await Promise.all([
                import('@/lib/notifications/admin'),
                import('@/lib/stop-conditions-data'),
                import('@/lib/exports/equipment-outages-read'),
                import('@/lib/stop-load-analytics-data'),
                import('@/lib/stop-analytics-vision/chunks'),
            ])
            const db = createNotificationAdminClient()
            const now = Date.now()
            // Окна вкладки меняются на границе часа: незадолго до неё греем и окна следующего часа.
            const moments = Math.ceil(now / 3_600_000) === Math.ceil((now + WARM_EVERY_MS + 60_000) / 3_600_000) ? [now] : [now, now + WARM_EVERY_MS + 60_000]
            for (const at of moments) {
                // Те же окна, что запрашивает вкладка: общий модуль, одинаковые границы.
                for (const [from, to] of analyticsClimateChunks(at)) await getStopConditionsCached(db, from, to, Math.min(to, now), true)
                const [loadFrom, loadTo] = analyticsLoadRange(at)
                await getStopLoadPayloadCached(db, new Date(loadFrom), new Date(loadTo), true)
            }
            // Начало окна отключений — как у вкладки: полночь по Сургуту 61 день назад.
            const historyFrom = Math.floor((now + CITY_OFFSET) / DAY) * DAY - CITY_OFFSET - 61 * DAY
            await readSignificantOutagesCached(db, historyFrom)
            console.info(`Analytics warm-up done in ${Date.now() - started} ms`)
        } catch (error) {
            console.error('Analytics warm-up failed:', error instanceof Error ? error.message : 'unknown error')
        } finally {
            running = false
        }
    }
    setTimeout(() => { void warm() }, 10_000)
    setInterval(() => { void warm() }, WARM_EVERY_MS).unref?.()

    // Рассылка сводного отчёта по расписанию: раз в минуту смотрим, кому пора.
    let sending = false
    const sendDueReports = async () => {
        if (sending) return
        sending = true
        try {
            const [{ createNotificationAdminClient }, { runDueReportSchedules }] = await Promise.all([
                import('@/lib/notifications/admin'),
                import('@/lib/reports/scheduled-run'),
            ])
            const started = await runDueReportSchedules(createNotificationAdminClient())
            if (started) console.info(`Report schedules: ${started} processed`)
        } catch (error) {
            console.error('Report schedules failed:', error instanceof Error ? error.message : 'unknown error')
        } finally {
            sending = false
        }
    }
    setInterval(() => { void sendDueReports() }, 60_000).unref?.()
}
