"use client"
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { EquipmentExport } from '@/components/notifications/equipment-export'

export function MapReportButton() {
    return <Dialog>
        <DialogTrigger asChild><Button variant="outline" className="my-4 w-full justify-start gap-2"><FileSpreadsheet className="h-4 w-4" />Сформировать отчёт</Button></DialogTrigger>
        <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden sm:max-w-5xl">
            <DialogHeader><DialogTitle>Отчёт о состоянии остановок</DialogTitle><DialogDescription>Списки остановок и камер с фильтрами, история за выбранный период</DialogDescription></DialogHeader>
            <EquipmentExport />
        </DialogContent>
    </Dialog>
}
