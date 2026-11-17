// Прогрев кэшей аналитики остановок при старте сервера и раз в 5 минут:
// первое открытие вкладки «Аналитика» не должно ждать сотни запросов к базе.
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return
    const DAY = 24 * 3_600_000
    const CITY_OFFSET = 5 * 3_600_000
    const warm = async () => {
        try {
            const [{ createNotificationAdminClient }, { buildStopConditions }, { readSignificantOutagesCached }] = await Promise.all([
                import('@/lib/notifications/admin'),
                import('@/lib/stop-conditions-data'),
                import('@/lib/exports/equipment-outages-read'),
            ])
            const db = createNotificationAdminClient()
            const now = Date.now()
            const hour = 3_600_000
            // Те же окна, что запрашивает вкладка: 31 день кусками по 8 дней, срезы по часам.
            for (let to = now; to > now - 31 * DAY; to -= 8 * DAY) {
                const from = Math.max(to - 8 * DAY, now - 31 * DAY)
                const start = Math.floor(from / hour) * hour, end = Math.ceil(to / hour) * hour
                await buildStopConditions(db, start, end, Math.min(end, now))
            }
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
