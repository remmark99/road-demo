// Прогрев кэшей аналитики остановок при старте сервера и раз в 5 минут:
// первое открытие вкладки «Аналитика» не должно ждать сотни запросов к базе.
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return
    const DAY = 24 * 3_600_000
    const CITY_OFFSET = 5 * 3_600_000
    const warm = async () => {
        try {
            const [{ createNotificationAdminClient }, { buildStopConditions }, { readSignificantOutagesCached }, { analyticsClimateChunks }] = await Promise.all([
                import('@/lib/notifications/admin'),
                import('@/lib/stop-conditions-data'),
                import('@/lib/exports/equipment-outages-read'),
                import('@/lib/stop-analytics-vision/chunks'),
            ])
            const db = createNotificationAdminClient()
            const now = Date.now()
            // Те же окна, что запрашивает вкладка: общий модуль, одинаковые границы.
            for (const [from, to] of analyticsClimateChunks(now)) await buildStopConditions(db, from, to, Math.min(to, now))
            // Начало окна отключений — как у вкладки: полночь по Сургуту 61 день назад.
            const historyFrom = Math.floor((now + CITY_OFFSET) / DAY) * DAY - CITY_OFFSET - 61 * DAY
            await readSignificantOutagesCached(db, historyFrom)
        } catch (error) {
            console.error('Analytics warm-up failed:', error instanceof Error ? error.message : 'unknown error')
        }
    }
    setTimeout(() => { void warm() }, 10_000)
    setInterval(() => { void warm() }, 5 * 60_000).unref?.()
}
