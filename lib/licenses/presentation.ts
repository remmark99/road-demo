import type { CustomerLicense, LicenseResponse } from './types'
export const LICENSE_STATUSES: Record<string, string> = { pending: 'Ожидает подписи', active: 'Действует', expired: 'Истекла', revoked: 'Отозвана', suspended: 'Приостановлена' }
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
/** Панель лицензий обслуживает двух разных зрителей. У вендора есть реестр: он
 *  видит всех клиентов, заводит лицензии и подписывает файлы. У инстанса заказчика
 *  реестра нет и быть не должно — есть одна подписанная лицензия, а вендорские
 *  действия ведут в ошибку «License DB is not configured». Поэтому их не показываем. */
export function licensePanelView(admin: boolean, data: LicenseResponse | null | undefined): { vendor: boolean; title: string; empty: string } {
  if (!admin) return { vendor: false, title: 'Мои лицензии', empty: 'Лицензии не найдены.' }
  if (data && !data.registry) return { vendor: false, title: 'Лицензия этого сервера', empty: 'Подписанная лицензия на этом сервере не найдена. Обратитесь к поставщику.' }
  return { vendor: true, title: 'Лицензии клиентов', empty: 'Лицензии не найдены.' }
}
export function filterLicenses(licenses: CustomerLicense[], status: string, customer: string): CustomerLicense[] {
  return licenses.filter(license => (status === 'all' || license.status === status) && (customer === 'all' || license.customer_id === customer))
}
