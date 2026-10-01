import type { CustomerLicense } from './types'

const MODULE_LABELS: Record<string, string> = {
  roads: 'Состояние дорог', stops: 'Остановки', parks: 'Безопасный парк',
  shore: 'Безопасный берег', transport: 'Контроль транспорта', asr: 'Площадки ТКО',
  smoking: 'Курение', lying_person: 'Лежащий человек', bin_fullness: 'Наполнение урн',
  dogs_without_people: 'Собаки без сопровождающих', abandoned_object: 'Оставленные предметы',
  busyness: 'Загруженность остановок', stage2_verification: 'Проверка событий',
}
export function russianModuleLabel(key: string, catalog: Record<string, string> = {}): string {
  return MODULE_LABELS[key] || (/[А-Яа-яЁё]/.test(catalog[key] || '') ? catalog[key] : 'Дополнительный модуль')
}
export function russianCameraName(name: string | null, index: number | null, id: number): string {
  return name && /[А-Яа-яЁё]/.test(name) ? name : `Камера №${index ?? id}`
}
export type ResourceScope = { city: 'surgut'; stopIds: number[] }
export function parseResourceScopes(value: string | undefined): Record<string, ResourceScope> {
  const scopes: unknown = JSON.parse(value || '{}')
  if (!scopes || typeof scopes !== 'object' || Array.isArray(scopes)) throw new Error('Invalid resource scopes')
  for (const [id, scope] of Object.entries(scopes)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
        !scope || typeof scope !== 'object' || Array.isArray(scope)) throw new Error('Invalid resource scope')
    const s = scope as ResourceScope
    if (s.city !== 'surgut' || !Array.isArray(s.stopIds) || s.stopIds.length > 5000 ||
        s.stopIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(s.stopIds).size !== s.stopIds.length) {
      throw new Error('Invalid resource scope')
    }
  }
  return scopes as Record<string, ResourceScope>
}
export type LicenseCamera = { id: number; name: string; module: string }
export type InventoryCamera = LicenseCamera & { stopId: number | null; stopName: string | null }
export type LicenseStop = { id: number; name: string; address: string | null; cameras: LicenseCamera[] }
export type LicenseDetail = {
  license: CustomerLicense
  moduleLabels: Record<string, string>
  assigned: boolean
  inventorySource: 'assigned' | 'platform' | 'unavailable'
  cameras: InventoryCamera[]
  city: string | null
  stops: LicenseStop[]
  cameraCount: number
}

export function inventoryModules(modules: readonly string[]): string[] {
  const platform = new Set(['roads', 'stops', 'parks', 'shore', 'transport', 'asr'])
  const stopDetections = new Set(['smoking', 'lying_person', 'bin_fullness', 'dogs_without_people', 'abandoned_object', 'busyness', 'stage2_verification'])
  return [...new Set(modules.flatMap(key => platform.has(key) ? [key] : stopDetections.has(key) ? ['stops'] : []))]
}
