import { Suspense } from 'react'
import { StopEquipmentList } from '@/components/dashboard/stop-equipment-list'
export default function EquipmentPage() {
  return <Suspense fallback={<p className="p-6">Загрузка оборудования…</p>}><StopEquipmentList /></Suspense>
}
