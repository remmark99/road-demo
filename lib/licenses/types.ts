export type CustomerLicense = {
  id: string
  license_id: string
  customer_id: string
  customer: string
  contract_no: string | null
  status: string
  issued_at: string
  expires_at: string | null
  modules: string[]
  max_cameras: number
  users: { id: string; email: string }[]
  /** Срок технической поддержки по модулям, отдельно от срока лицензии. */
  support: LicenseSupport[]
  /** Только для админа: права в реестре разошлись с подписанным license.key. */
  needs_signing?: boolean
}

export type LicenseSupport = { module: string; support_until: string }

/** Бессрочная лицензия хранится датой, протокол проверки подписи не меняется. */
export const PERPETUAL_EXPIRES_AT = '2099-12-31T23:59:59Z'
export function isPerpetual(expiresAt: string | null): boolean {
  const time = expiresAt ? Date.parse(expiresAt) : NaN
  return Number.isFinite(time) && new Date(time).getUTCFullYear() >= 2099
}

export type LicenseResponse = {
  licenses: CustomerLicense[]
  moduleLabels: Record<string, string>
  linked: boolean
}

export function parseCustomerBindings(value: string | undefined): Record<string, string> {
  const parsed: unknown = JSON.parse(value || '{}')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid license bindings')
  for (const [user, customer] of Object.entries(parsed)) {
    if (!uuid.test(user) || typeof customer !== 'string' || !uuid.test(customer)) throw new Error('Invalid license bindings')
  }
  return parsed as Record<string, string>
}

export function licenseStatus(status: string, expiresAt: string | null, now = Date.now()): string {
  if (status === 'active' && expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now) return 'expired'
  return status
}
