import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { createNotificationAdminClient } from '@/lib/notifications/admin'
import { parseResourceScopes, russianCameraName, russianModuleLabel, type LicenseDetail, type LicenseStop } from './resources'
import { parseCustomerBindings, licenseStatus, type LicenseResponse } from './types'

// The DB stores customers, not platform auth users. Bind only by explicitly configured UUIDs.
export async function readCustomerLicenses(userId?: string): Promise<LicenseResponse> {
  const bindings = parseCustomerBindings(process.env.LICENSE_USER_CUSTOMERS)
  const customerId = userId ? bindings[userId] : undefined
  if (userId && !customerId) return { licenses: [], moduleLabels: {}, linked: false }
  const url = process.env.LICENSE_DB_URL
  const key = process.env.LICENSE_DB_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('License DB is not configured')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const licenses: LicenseResponse['licenses'] = []
  const batchSize = 200
  for (let start = 0; ;) {
    let query = db.from('licenses').select('id,license_id,customer_id,contract_no,status,issued_at,expires_at,modules,max_cameras,customers(name)', { count: 'exact' }).order('id').range(start, start + batchSize - 1)
    if (customerId) query = query.eq('customer_id', customerId)
    const { data, error, count } = await query
    if (error || !data) throw new Error('License DB read failed')
    for (const row of data) {
      const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
      licenses.push({ id: row.id, license_id: row.license_id, customer_id: row.customer_id,
        customer: customer?.name || 'Клиент не указан', contract_no: row.contract_no,
        status: licenseStatus(row.status, row.expires_at), issued_at: row.issued_at,
        expires_at: row.expires_at, modules: row.modules || [], max_cameras: row.max_cameras, users: [] })
    }
    if (count === null || count === undefined) throw new Error('License count unavailable')
    start += data.length
    if (start >= count) break
    if (!data.length) throw new Error('License pagination did not advance')
  }
  const { data: modules, error: moduleError } = await db.from('license_modules').select('key,label')
  if (moduleError) throw new Error('License modules read failed')
  if (!userId) {
    const userIds = Object.keys(bindings).filter(id => licenses.some(l => l.customer_id === bindings[id]))
    if (userIds.length) {
      const { data: profiles, error } = await createNotificationAdminClient().from('profiles').select('id,email').in('id', userIds)
      if (error) throw new Error('License user read failed')
      for (const license of licenses) license.users = (profiles || []).filter(p => bindings[p.id] === license.customer_id)
    }
  }
  return { licenses, moduleLabels: Object.fromEntries((modules || []).map(m => [m.key, m.label])), linked: true }
}

// Resource display does not alter the signed license or grant access to streams.
// Verify customer ownership before reading inventory with the service-role client.
export async function readLicenseDetail(id: string, userId?: string): Promise<LicenseDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const { licenses, moduleLabels } = await readCustomerLicenses(userId)
  const license = licenses.find(row => row.id === id)
  if (!license) return null
  const scope = parseResourceScopes(process.env.LICENSE_RESOURCE_SCOPES)[id]
  const result: LicenseDetail = { license, moduleLabels, assigned: !!scope, city: scope ? 'Сургут' : null,
    stops: [], cameraCount: 0, exceedsCameraLimit: false }
  if (!scope || !scope.stopIds.length) return result
  const inventory = createNotificationAdminClient()
  for (let start = 0; start < scope.stopIds.length; start += 100) {
    const ids = scope.stopIds.slice(start, start + 100)
    const { data: stops, error } = await inventory.from('bus_stops').select('id,name,address').in('id', ids)
    if (error || !stops || stops.length !== ids.length) throw new Error('Incomplete stop assignment')
    const byId = new Map<number, LicenseStop>(stops.map(stop => [stop.id, {
      id: stop.id, name: stop.name || `Остановка №${stop.id}`, address: stop.address, cameras: [],
    }]))
    let offset = 0
    for (;;) {
      const { data: cameras, error: cameraError, count } = await inventory.from('cameras')
        .select('id,camera_index,name,module,bus_stop_id', { count: 'exact' })
        .in('bus_stop_id', ids).order('id').range(offset, offset + 199)
      if (cameraError || !cameras || count == null) throw new Error('Camera inventory read failed')
      for (const camera of cameras) {
        const stop = byId.get(camera.bus_stop_id)
        if (!stop) throw new Error('Camera outside configured scope')
        stop.cameras.push({ id: camera.id, name: russianCameraName(camera.name, camera.camera_index, camera.id),
          module: russianModuleLabel(camera.module || 'stops', moduleLabels) })
        result.cameraCount++
      }
      offset += cameras.length
      if (offset >= count) break
      if (!cameras.length) throw new Error('Camera pagination did not advance')
    }
    result.stops.push(...byId.values())
  }
  result.stops.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  result.exceedsCameraLimit = result.cameraCount > license.max_cameras
  return result
}
