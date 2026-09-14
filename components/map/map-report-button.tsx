"use client"
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { EquipmentExport } from '@/components/notifications/equipment-export'

export function MapReportButton() {
    return <Dialog>
        <DialogTrigger asChild><Button variant="outline" className="mb-4 w-full justify-start gap-2"><FileSpreadsheet className="h-4 w-4" />Сформировать отчёт</Button></DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader><DialogTitle>Отчёт о состоянии остановок</DialogTitle><DialogDescription>Excel по дням за выбранный период</DialogDescription></DialogHeader>
            <EquipmentExport />
        </DialogContent>
    </Dialog>
}
