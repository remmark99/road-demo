"use client"

import { useEffect, useState } from "react"
import { fetchBusStopsGeoJSON, type BusStopsGeoJSON } from "@/lib/api/bus-stops"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Video, Radio, AlertTriangle, Flame } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { LucideIcon } from "lucide-react"

/** Одна строка: «в сети / не в сети» для одного типа оборудования. */
function EquipmentRow({
    icon: Icon,
    label,
    total,
    online,
}: {
    icon: LucideIcon
    label: string
    total: number
    online: number
}) {
    const offline = Math.max(total - online, 0)

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 text-sm font-medium min-w-0">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{label}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{total}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted rounded-md px-2 py-1.5 min-w-0">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        <span className="truncate">В сети</span>
                    </div>
                    <div className="text-lg font-semibold leading-tight tabular-nums text-green-500">{online}</div>
                </div>
                <div className="bg-muted rounded-md px-2 py-1.5 min-w-0">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
                        <span className="truncate">Не в сети</span>
                    </div>
                    <div className="text-lg font-semibold leading-tight tabular-nums">{offline}</div>
                </div>
            </div>
        </div>
    )
}

function EquipmentRowSkeleton() {
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <Skeleton className="h-4 w-[90px]" />
                <Skeleton className="h-3 w-[24px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-[52px] w-full rounded-md" />
                <Skeleton className="h-[52px] w-full rounded-md" />
            </div>
        </div>
    )
}

export function BusStopsStats() {
    const [data, setData] = useState<BusStopsGeoJSON | null>(null)

    useEffect(() => {
        fetchBusStopsGeoJSON().then(setData)
    }, [])

    if (!data) {
        return (
            <Card className="mb-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-4 w-4 shrink-0" />
                        <span className="truncate">Остановки и камеры</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <EquipmentRowSkeleton />
                    <EquipmentRowSkeleton />
                    <div className="pt-3 border-t space-y-2">
                        <div className="flex justify-between items-center"><Skeleton className="h-3 w-[110px]" /><Skeleton className="h-3 w-[24px]" /></div>
                        <div className="flex justify-between items-center"><Skeleton className="h-3 w-[130px]" /><Skeleton className="h-3 w-[24px]" /></div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const totalStops = data.features.length
    let camerasTotal = 0
    let camerasOnline = 0
    let stopsWithSensors = 0
    let sensorsOnline = 0
    let unequipped = 0
    let vandalism = 0
    let heaterIssues = 0

    data.features.forEach(f => {
        const sd = f.properties.sensor_data
        if (!sd || !sd.has_equipment) {
            unequipped++
            return
        }

        camerasTotal += sd.total_camera_count
        camerasOnline += sd.online_camera_count

        if (sd.has_controller) {
            stopsWithSensors++
            if (sd.sensors_online) sensorsOnline++
        }

        if (sd.glass_broken) vandalism++
        if (sd.heater_working === false) heaterIssues++
    })

    return (
        <Card className="mb-4">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 shrink-0" />
                    <span className="truncate">Остановки и камеры</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <EquipmentRow icon={Video} label="Камеры" total={camerasTotal} online={camerasOnline} />
                <EquipmentRow icon={Radio} label="Остановки (датчики)" total={stopsWithSensors} online={sensorsOnline} />

                <div className="pt-3 border-t space-y-1.5 text-xs">
                    <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground truncate">Всего остановок</span>
                        <span className="font-medium tabular-nums shrink-0">{totalStops}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground truncate">Без оборудования</span>
                        <span className="font-medium text-blue-500 tabular-nums shrink-0">{unequipped}</span>
                    </div>
                </div>

                {(vandalism > 0 || heaterIssues > 0) && (
                    <div className="pt-3 border-t">
                        <div className="text-sm font-medium mb-2 text-red-500 flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="truncate">Активные инциденты</span>
                        </div>
                        <div className="space-y-1.5 text-xs">
                            {vandalism > 0 && (
                                <div className="flex justify-between items-center gap-2 text-red-500">
                                    <span className="truncate">Вандализм (разбито стекло)</span>
                                    <span className="font-bold tabular-nums shrink-0">{vandalism}</span>
                                </div>
                            )}
                            {heaterIssues > 0 && (
                                <div className="flex justify-between items-center gap-2 text-orange-500">
                                    <span className="flex items-center gap-1.5 min-w-0"><Flame className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Отказ обогревателя</span></span>
                                    <span className="font-bold tabular-nums shrink-0">{heaterIssues}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
