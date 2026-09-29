import { notificationDate } from '@/lib/notifications/feed-filters'

export function durationBucket(start: string | null | undefined, end: string | null | undefined): string {
  const duration = Date.parse(end || '') - Date.parse(start || '')
  if (!Number.isFinite(duration) || duration < 0) return 'Нет данных'
  const hours = duration / 3_600_000
  if (hours < 3) return '0–3 часа'
  if (hours < 6) return '3–6 часов'
  if (hours < 12) return '6–12 часов'
  if (hours <= 24) return '12–24 часа'
  return 'Более 1 дня'
}

/** Calendar days in Surgut, relative to when the file is generated. */
export function completionBucket(end: string | null | undefined, ongoing = false, now = Date.now()): string {
  if (ongoing) return 'Не завершено'
  const timestamp = Date.parse(end || '')
  if (!Number.isFinite(timestamp) || timestamp > now) return 'Нет данных'
  const days = (Date.parse(notificationDate(now)) - Date.parse(notificationDate(timestamp))) / 86_400_000
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  if (days <= 7) return '2–7 дней назад'
  return 'Более 7 дней назад'
}
