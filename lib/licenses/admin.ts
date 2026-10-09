import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { nextLicenseId, type LicenseInput } from './editor'

// Админка заводит и правит строки реестра, но не подписывает: приватный ключ
// остаётся у владельца license_tool.py. Новая лицензия — черновик 'pending', после
// продления или смены прав license.key нужно переподписать (`license_tool.py sign`).
// Права меняются только через set_entitlements / set_license_status — они требуют
// основание и пишут его в журнал license_changes.

export class LicenseEditError extends Error {}

const SIGNING_KEY_ID = 'k1'

function registry() {
  const url = process.env.LICENSE_DB_URL
  const key = process.env.LICENSE_DB_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('License DB is not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
type Registry = ReturnType<typeof registry>

async function resolveCustomer(db: Registry, input: LicenseInput): Promise<string> {
  if (input.customerId) {
    const { data, error } = await db.from('customers').select('id').eq('id', input.customerId).maybeSingle()
    if (error) throw new Error('Customer read failed')
    if (!data) throw new LicenseEditError('Клиент не найден')
    return data.id
  }
  // Имя уникально без учёта регистра (customers_name_key on lower(name)); заказчиков
  // единицы, поэтому сравниваем здесь, а не шаблоном ilike.
  const name = input.customerName!
  const { data: customers, error } = await db.from('customers').select('id,name')
  if (error) throw new Error('Customer read failed')
  const existing = (customers || []).find(row => row.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))
  if (existing) return existing.id
  const { data: created, error: createError } = await db.from('customers').insert({ name }).select('id').single()
  if (createError || !created) throw new Error('Customer create failed')
  return created.id
}

async function replaceSupport(db: Registry, licenseId: string, support: LicenseInput['support'], actor: string) {
  const { error: deleteError } = await db.from('license_support').delete().eq('license_id', licenseId)
    .not('module', 'in', `(${support.map(row => row.module).join(',') || '""'})`)
  if (deleteError) throw new Error('License support update failed')
  if (!support.length) return
  const { error } = await db.from('license_support').upsert(
    support.map(row => ({ license_id: licenseId, ...row, updated_at: new Date().toISOString(), updated_by: actor })),
    { onConflict: 'license_id,module' })
  if (error) throw new Error('License support update failed')
}

export async function createLicenseDraft(input: LicenseInput, actor: string): Promise<string> {
  const db = registry()
  const customerId = await resolveCustomer(db, input)
  const year = new Date().getUTCFullYear()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing, error } = await db.from('licenses').select('license_id').like('license_id', `${input.prefix}-${year}-%`)
    if (error) throw new Error('License number read failed')
    const licenseId = nextLicenseId(input.prefix, year, (existing || []).map(row => row.license_id))
    const { error: insertError } = await db.from('licenses').insert({
      license_id: licenseId, customer_id: customerId, contract_no: input.contractNo, modules: input.modules,
      max_cameras: input.maxCameras, expires_at: input.expiresAt, signing_key_id: SIGNING_KEY_ID,
      status: 'pending', issued_by: actor, notes: input.notes,
    })
    if (insertError?.code === '23505') continue // номер успели занять — берём следующий
    if (insertError) throw new Error(`License insert failed: ${insertError.code}`)
    await replaceSupport(db, licenseId, input.support, actor)
    return licenseId
  }
  throw new LicenseEditError('Не удалось подобрать свободный номер лицензии, повторите')
}

export async function updateLicense(id: string, input: LicenseInput, actor: string): Promise<void> {
  const db = registry()
  const { data: row, error } = await db.from('licenses')
    .select('license_id,status,contract_no,modules,max_cameras,expires_at').eq('id', id).maybeSingle()
  if (error) throw new Error('License read failed')
  if (!row) throw new LicenseEditError('Лицензия не найдена')

  const sameModules = [...(row.modules || [])].sort().join() === [...input.modules].sort().join()
  const rightsChanged = !sameModules || row.max_cameras !== input.maxCameras || Date.parse(row.expires_at) !== Date.parse(input.expiresAt)
  const statusChanged = input.status !== null && input.status !== row.status
  if (statusChanged && row.status === 'pending' && input.status === 'active') {
    throw new LicenseEditError('Черновик становится действующим только после подписи (license_tool.py sign)')
  }
  if ((rightsChanged || statusChanged) && !input.reason) {
    throw new LicenseEditError('Укажите основание изменения: допсоглашение, письмо или задачу')
  }

  if (rightsChanged) {
    const { error: rpcError } = await db.rpc('set_entitlements', {
      p_license_id: row.license_id, p_reason: input.reason, p_actor: actor,
      p_max_cameras: input.maxCameras, p_modules: input.modules, p_expires_at: input.expiresAt,
    })
    if (rpcError) throw new Error(`set_entitlements failed: ${rpcError.code}`)
  }
  if (statusChanged) {
    const { error: rpcError } = await db.rpc('set_license_status', {
      p_license_id: row.license_id, p_status: input.status, p_reason: input.reason, p_actor: actor,
    })
    if (rpcError) throw new Error(`set_license_status failed: ${rpcError.code}`)
  }
  if ((row.contract_no || null) !== input.contractNo) {
    const { error: updateError } = await db.from('licenses').update({ contract_no: input.contractNo }).eq('id', id)
    if (updateError) throw new Error('License contract update failed')
  }
  await replaceSupport(db, row.license_id, input.support, actor)
}
