import type { CustomerLicense } from './types'
export const LICENSE_STATUSES: Record<string, string> = { active: 'Действует', expired: 'Истекла', revoked: 'Отозвана', suspended: 'Приостановлена' }
export function formatLicenseDate(value: string | null): { date: string; time: string; full: string } | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return {
    date: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date),
    full: date.toLocaleString('ru-RU'),
  }
}
export function filterLicenses(licenses: CustomerLicense[], status: string, customer: string): CustomerLicense[] {
  return licenses.filter(license => (status === 'all' || license.status === status) && (customer === 'all' || license.customer_id === customer))
}
