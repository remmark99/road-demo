"use client"

import { useEffect, useState } from "react"
import { fetchBusStopsGeoJSON, type BusStopsGeoJSON } from "@/lib/api/bus-stops"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Wifi, WifiOff, Settings2, AlertTriangle, Flame } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

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
                        <Activity className="h-4 w-4" />
                        Остановки (Датчики)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <Skeleton className="h-[68px] w-full rounded-md" />
                        <Skeleton className="h-[68px] w-full rounded-md" />
                    </div>
                    <div>
                        <div className="text-sm font-medium mb-2 flex items-center gap-2">
                            <Settings2 className="h-4 w-4 text-muted-foreground" />
                            Оснащение
                        </div>
                        <div className="space-y-2 mt-1">
                            <div className="flex justify-between items-center"><Skeleton className="h-4 w-[120px]" /><Skeleton className="h-4 w-[20px]" /></div>
                            <div className="flex justify-between items-center"><Skeleton className="h-4 w-[130px]" /><Skeleton className="h-4 w-[20px]" /></div>
                            <div className="flex justify-between items-center"><Skeleton className="h-4 w-[110px]" /><Skeleton className="h-4 w-[20px]" /></div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const total = data.features.length
    let online = 0
    let offline = 0
    let fullyEquipped = 0
    let partlyEquipped = 0
    let unequipped = 0
    let vandalism = 0
    let heaterIssues = 0

    data.features.forEach(f => {
        const sd = f.properties.sensor_data
        if (sd && (sd.has_equipment || sd.is_partly_equipped)) {
            if (sd.is_online) online++
            else offline++

            if (sd.has_equipment) fullyEquipped++
            if (sd.is_partly_equipped) partlyEquipped++

            if (sd.glass_broken) vandalism++
            if (sd.heater_working === false) heaterIssues++
        } else {
            unequipped++
        }
    })

    return (
        <Card className="mb-4">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Остановки (Датчики)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-muted p-2 rounded-md">
                        <div className="text-muted-foreground mb-1 flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5 text-green-500" /> В сети</div>
                        <div className="font-semibold text-lg">{online}</div>
                    </div>
                    <div className="bg-muted p-2 rounded-md">
                        <div className="text-muted-foreground mb-1 flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5 text-red-500" /> Не в сети</div>
                        <div className="font-semibold text-lg">{offline}</div>
                    </div>
                </div>

                <div>
                    <div className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        Оснащение ({total})
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Полностью оборудованы:</span>
                            <span className="font-medium text-green-500">{fullyEquipped}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Частично оборудованы:</span>
                            <span className="font-medium inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 opacity-60"></span>{partlyEquipped}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Без оборудования:</span>
                            <span className="font-medium text-blue-500">{unequipped}</span>
                        </div>
                    </div>
                </div>

                {(vandalism > 0 || heaterIssues > 0) && (
                    <div className="pt-2 border-t">
                        <div className="text-sm font-medium mb-2 text-red-500 flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" /> Активные инциденты
                        </div>
                        <div className="space-y-1.5 text-sm">
                            {vandalism > 0 && (
                                <div className="flex justify-between items-center text-red-500">
                                    <span>Вандализм (разбито стекло)</span>
                                    <span className="font-bold">{vandalism}</span>
                                </div>
                            )}
                            {heaterIssues > 0 && (
                                <div className="flex justify-between items-center text-amber-500">
                                    <span className="flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" /> Отказ обогревателя</span>
                                    <span className="font-bold">{heaterIssues}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
