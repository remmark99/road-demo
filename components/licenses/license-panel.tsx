'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LicenseResponse } from '@/lib/licenses/types'

const statuses: Record<string, string> = { active: 'Действует', expired: 'Истекла', revoked: 'Отозвана', suspended: 'Приостановлена' }
function date(value: string | null) {
  if (!value) return 'Не указан'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Не указан' : parsed.toLocaleString('ru-RU')
}

export function LicensePanel({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<LicenseResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(admin ? '/api/admin/licenses' : '/api/settings/licenses', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить лицензии')
        setData(result)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [admin, reload])

  return <Card className="mb-6">
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <CardTitle>{admin ? 'Лицензии клиентов' : 'Мои лицензии'}</CardTitle>
      <Button variant="outline" disabled={loading} onClick={() => setReload(n => n + 1)}>Обновить</Button>
    </CardHeader>
    <CardContent>
      {loading ? <p role="status">Загрузка лицензий…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : !data?.linked ?
        <p className="text-muted-foreground">Лицензия пока не привязана к вашему аккаунту. Обратитесь к администратору.</p> : !data.licenses.length ?
        <p className="text-muted-foreground">Лицензии не найдены.</p> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b">
            {admin && <th className="p-3">Клиент / аккаунты</th>}
            <th className="p-3">Лицензия / договор</th><th className="p-3">Статус</th><th className="p-3">Сроки</th><th className="p-3">Модули / камеры</th>
          </tr></thead>
          <tbody>{data.licenses.map(license => <tr key={license.id} className="border-b align-top">
            {admin && <td className="p-3"><p>{license.customer}</p><p className="text-muted-foreground">{license.users.map(user => user.email).join(', ') || 'Аккаунты не привязаны'}</p></td>}
            <td className="p-3"><p>{license.license_id}</p><p className="text-muted-foreground">Договор: {license.contract_no || 'Не указан'}</p></td>
            <td className="p-3">{statuses[license.status] || license.status}</td>
            <td className="p-3 whitespace-nowrap"><p>Выдана: {date(license.issued_at)}</p><p>Окончание: {date(license.expires_at)}</p></td>
            <td className="p-3"><p>{license.modules.map(module => data.moduleLabels[module] || module).join(', ') || 'Модули не указаны'}</p><p className="text-muted-foreground">Лимит камер: {license.max_cameras}</p></td>
          </tr>)}</tbody>
        </table></div>}
    </CardContent>
  </Card>
}
