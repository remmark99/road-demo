import { LICENSE_MODULES } from './resources'
import { PERPETUAL_EXPIRES_AT } from './types'

/** Что отправляет форма лицензии в админке. Даты — YYYY-MM-DD. */
export type LicenseForm = {
  customerId: string | null
  customerName: string
  prefix: string
  contractNo: string
  modules: string[]
  maxCameras: number
  expiresOn: string
  perpetual: boolean
  support: Record<string, string>
  status: string
  reason: string
  notes: string
}

export type LicenseInput = {
  customerId: string | null
  customerName: string | null
  prefix: string
  contractNo: string | null
  modules: string[]
  maxCameras: number
  expiresAt: string
  support: { module: string; support_until: string }[]
  status: string | null
  reason: string | null
  notes: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
export const EDITABLE_STATUSES = ['active', 'suspended', 'revoked'] as const

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/** Срок лицензии: конец указанного дня по UTC, как у license_tool issue. */
export function expiresAtFromDate(date: string): string {
  return `${date}T23:59:59Z`
}

export function addYears(date: string, years: number): string {
  const base = validDate(date) ? new Date(`${date}T00:00:00Z`) : new Date()
  base.setUTCFullYear(base.getUTCFullYear() + years)
  return base.toISOString().slice(0, 10)
}

export function parseLicenseInput(body: unknown, mode: 'create' | 'update'): { value: LicenseInput } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Некорректный запрос' }
  const form = body as Partial<Record<keyof LicenseForm, unknown>>

  const customerId = typeof form.customerId === 'string' && form.customerId ? form.customerId : null
  if (customerId && !UUID.test(customerId)) return { error: 'Некорректный клиент' }
  const customerName = text(form.customerName, 200)
  if (mode === 'create' && !customerId && !customerName) return { error: 'Укажите клиента' }

  const prefix = (text(form.prefix, 8) || 'LIC').toUpperCase()
  if (!/^[A-Z0-9]{2,8}$/.test(prefix)) return { error: 'Префикс номера — 2–8 латинских букв или цифр' }

  const known = new Set<string>(LICENSE_MODULES)
  const modules = Array.isArray(form.modules) ? form.modules.filter((m): m is string => typeof m === 'string') : []
  if (!modules.length) return { error: 'Выберите хотя бы один модуль' }
  if (modules.some(m => !known.has(m)) || new Set(modules).size !== modules.length) return { error: 'Некорректный список модулей' }

  const maxCameras = Number(form.maxCameras)
  if (!Number.isInteger(maxCameras) || maxCameras < 0 || maxCameras > 10000) return { error: 'Число камер — целое от 0 до 10000' }

  let expiresAt = PERPETUAL_EXPIRES_AT
  if (form.perpetual !== true) {
    if (typeof form.expiresOn !== 'string' || !validDate(form.expiresOn)) return { error: 'Укажите срок действия или отметьте «Бессрочно»' }
    expiresAt = expiresAtFromDate(form.expiresOn)
  }

  const support: LicenseInput['support'] = []
  if (form.support && typeof form.support === 'object' && !Array.isArray(form.support)) {
    for (const [module, until] of Object.entries(form.support as Record<string, unknown>)) {
      if (until === '' || until == null) continue
      if (!modules.includes(module)) return { error: 'Техподдержка указана для модуля, которого нет в лицензии' }
      if (typeof until !== 'string' || !validDate(until)) return { error: 'Некорректная дата техподдержки' }
      support.push({ module, support_until: until })
    }
  }

  let status: string | null = null
  if (mode === 'update' && typeof form.status === 'string' && form.status) {
    if (!(EDITABLE_STATUSES as readonly string[]).includes(form.status)) return { error: 'Некорректный статус' }
    status = form.status
  }

  return { value: {
    customerId, customerName, prefix, contractNo: text(form.contractNo, 200), modules, maxCameras, expiresAt,
    support, status, reason: text(form.reason, 500), notes: text(form.notes, 1000),
  } }
}

/** Следующий номер ПРЕФИКС-ГОД-NNN: максимум, а не количество, как в license_tool. */
export function nextLicenseId(prefix: string, year: number, existing: string[]): string {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d{3,4})$`)
  const used = existing.flatMap(id => { const match = pattern.exec(id); return match ? [Number(match[1])] : [] })
  return `${prefix}-${year}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`
}
