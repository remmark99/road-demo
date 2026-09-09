"use client"

import { useEffect, useMemo, useState } from "react"
import { fetchBusStopsGeoJSON, type BusStopsGeoJSON } from "@/lib/api/bus-stops"
import { fetchCameras } from "@/lib/api/cameras"
import { useModuleAccess } from "@/components/providers/module-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Video, Radio, AlertTriangle, Flame, Crosshair, ChevronDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Camera, MapFocusTarget } from "@/lib/types"
import type { LucideIcon } from "lucide-react"

/** Один элемент раскрывающегося списка (камера или остановка с датчиками). */
interface FocusItem {
    key: string
    title: string
    subtitle: string | null
    stopId: number
    lng: number | null
    lat: number | null
    /** Клик по камере раскрывает камеры остановки на карте. */
    spiderify: boolean
}

type ListKey =
    | "cameras-online"
    | "cameras-offline"
    | "sensors-online"
    | "sensors-offline"

interface StopInfo {
    id: number
    name: string
    address: string | null
    lng: number | null
    lat: number | null
}

function stopLabel(name: string | null, id: number) {
    return name?.trim() || `Остановка #${id}`
}

/** Раскрывающийся список выбранной группы: поиск + переход к остановке на карте. */
function FocusList({
    items,
    onSelect,
}: {
    items: FocusItem[]
    onSelect: (item: FocusItem) => void
}) {
    const [query, setQuery] = useState("")

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return items
        return items.filter(
            i => i.title.toLowerCase().includes(q) || (i.subtitle?.toLowerCase().includes(q) ?? false),
        )
    }, [items, query])

    return (
        <div className="mt-2 rounded-md border border-border p-1.5">
            {items.length > 8 && (
                <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Поиск…"
                    className="h-7 mb-1.5 text-xs"
                />
            )}
            <ScrollArea className={filtered.length > 6 ? "h-52 pr-2" : "pr-2"}>
                <div className="space-y-0.5">
                    {filtered.length === 0 && (
                        <div className="text-xs text-muted-foreground px-1.5 py-2">Ничего не найдено</div>
                    )}
                    {filtered.map(item => {
                        const locatable = item.lng !== null && item.lat !== null
                        return (
                            <button
                                key={item.key}
                                type="button"
                                disabled={!locatable}
                                onClick={() => onSelect(item)}
                                title={locatable ? "Показать на карте" : "Нет координат остановки"}
                                className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-default"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs truncate">{item.title}</span>
                                    {item.subtitle && (
                                        <span className="block text-[11px] text-muted-foreground truncate">
                                            {item.subtitle}
                                        </span>
                                    )}
                                </span>
                                {locatable && <Crosshair className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            </button>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}

/** Одна строка: «в сети / не в сети» для одного типа оборудования. */
function EquipmentRow({
    icon: Icon,
    label,
    onlineItems,
    offlineItems,
    openList,
    onlineKey,
    offlineKey,
    onToggle,
    onSelect,
}: {
    icon: LucideIcon
    label: string
    onlineItems: FocusItem[]
    offlineItems: FocusItem[]
    openList: ListKey | null
    onlineKey: ListKey
    offlineKey: ListKey
    onToggle: (key: ListKey) => void
    onSelect: (item: FocusItem) => void
}) {
    const total = onlineItems.length + offlineItems.length

    const tile = (
        tileKey: ListKey,
        tileLabel: string,
        items: FocusItem[],
        dotClass: string,
        valueClass: string,
    ) => {
        const open = openList === tileKey
        return (
            <button
                type="button"
                disabled={items.length === 0}
                onClick={() => onToggle(tileKey)}
                aria-expanded={open}
                className={`bg-muted rounded-md px-2 py-1.5 min-w-0 text-left transition-colors enabled:hover:bg-accent disabled:cursor-default ${open ? "ring-1 ring-ring" : ""}`}
            >
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                    <span className="truncate">{tileLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                    <span className={`text-lg font-semibold leading-tight tabular-nums ${valueClass}`}>
                        {items.length}
                    </span>
                    {items.length > 0 && (
                        <ChevronDown
                            className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                    )}
                </div>
            </button>
        )
    }

    const openItems =
        openList === onlineKey ? onlineItems : openList === offlineKey ? offlineItems : null

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
                {tile(onlineKey, "В сети", onlineItems, "bg-green-500", "text-green-500")}
                {tile(offlineKey, "Не в сети", offlineItems, "bg-gray-400", "")}
            </div>
            {openItems && <FocusList items={openItems} onSelect={onSelect} />}
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

export function BusStopsStats({ onFocusStop }: { onFocusStop?: (target: MapFocusTarget) => void }) {
    const { modules, loading: modulesLoading } = useModuleAccess()
    const [data, setData] = useState<BusStopsGeoJSON | null>(null)
    const [cameras, setCameras] = useState<Camera[] | null>(null)
    const [openList, setOpenList] = useState<ListKey | null>(null)

    useEffect(() => {
        fetchBusStopsGeoJSON().then(setData)
    }, [])

    useEffect(() => {
        if (modulesLoading) return
        fetchCameras(modules).then(setCameras)
    }, [modules, modulesLoading])

    const stats = useMemo(() => {
        if (!data || !cameras) return null

        const stops = new Map<number, StopInfo>()
        let unequipped = 0
        let vandalism = 0
        let heaterIssues = 0
        const sensorsOnline: FocusItem[] = []
        const sensorsOffline: FocusItem[] = []

        data.features.forEach(f => {
            const p = f.properties
            const coords = f.geometry?.coordinates
            const info: StopInfo = {
                id: p.id,
                name: stopLabel(p.name ?? p.short_name, p.id),
                address: p.address,
                lng: typeof coords?.[0] === "number" ? coords[0] : null,
                lat: typeof coords?.[1] === "number" ? coords[1] : null,
            }
            stops.set(p.id, info)

            const sd = p.sensor_data
            if (!sd || !sd.has_equipment) {
                unequipped++
                return
            }

            if (sd.glass_broken) vandalism++
            if (sd.heater_working === false) heaterIssues++

            if (sd.has_controller) {
                const item: FocusItem = {
                    key: `stop-${info.id}`,
                    title: info.name,
                    subtitle: info.address,
                    stopId: info.id,
                    lng: info.lng,
                    lat: info.lat,
                    spiderify: false,
                }
                if (sd.sensors_online) sensorsOnline.push(item)
                else sensorsOffline.push(item)
            }
        })

        // В модуле остановок камера всегда привязана к остановке — к ней и зумим.
        const camerasOnline: FocusItem[] = []
        const camerasOffline: FocusItem[] = []

        cameras
            .filter(c => c.busStopId !== null && c.busStopId !== undefined)
            .forEach(c => {
                const stop = stops.get(c.busStopId as number)
                const item: FocusItem = {
                    key: c.id,
                    title: c.name,
                    subtitle: stop ? stop.name : `Остановка #${c.busStopId}`,
                    stopId: c.busStopId as number,
                    lng: stop?.lng ?? null,
                    lat: stop?.lat ?? null,
                    spiderify: true,
                }
                if (c.status === "online") camerasOnline.push(item)
                else camerasOffline.push(item)
            })

        const byTitle = (a: FocusItem, b: FocusItem) => a.title.localeCompare(b.title, "ru")
        camerasOnline.sort(byTitle)
        camerasOffline.sort(byTitle)
        sensorsOnline.sort(byTitle)
        sensorsOffline.sort(byTitle)

        return {
            totalStops: data.features.length,
            unequipped,
            vandalism,
            heaterIssues,
            camerasOnline,
            camerasOffline,
            sensorsOnline,
            sensorsOffline,
        }
    }, [data, cameras])

    const handleSelect = (item: FocusItem) => {
        if (item.lng === null || item.lat === null) return
        onFocusStop?.({
            stopId: item.stopId,
            lng: item.lng,
            lat: item.lat,
            spiderify: item.spiderify,
            requestId: Date.now(),
        })
    }

    const handleToggle = (key: ListKey) => {
        setOpenList(prev => (prev === key ? null : key))
    }

    const header = (
        <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 shrink-0" />
                <span className="truncate">Остановки и камеры</span>
            </CardTitle>
        </CardHeader>
    )

    if (!stats) {
        return (
            <Card className="mb-4">
                {header}
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

    return (
        <Card className="mb-4">
            {header}
            <CardContent className="space-y-4">
                <EquipmentRow
                    icon={Video}
                    label="Камеры"
                    onlineItems={stats.camerasOnline}
                    offlineItems={stats.camerasOffline}
                    openList={openList}
                    onlineKey="cameras-online"
                    offlineKey="cameras-offline"
                    onToggle={handleToggle}
                    onSelect={handleSelect}
                />
                <EquipmentRow
                    icon={Radio}
                    label="Остановки (датчики)"
                    onlineItems={stats.sensorsOnline}
                    offlineItems={stats.sensorsOffline}
                    openList={openList}
                    onlineKey="sensors-online"
                    offlineKey="sensors-offline"
                    onToggle={handleToggle}
                    onSelect={handleSelect}
                />

                <div className="pt-3 border-t space-y-1.5 text-xs">
                    <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground truncate">Всего остановок</span>
                        <span className="font-medium tabular-nums shrink-0">{stats.totalStops}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground truncate">Без оборудования</span>
                        <span className="font-medium text-blue-500 tabular-nums shrink-0">{stats.unequipped}</span>
                    </div>
                </div>

                {(stats.vandalism > 0 || stats.heaterIssues > 0) && (
                    <div className="pt-3 border-t">
                        <div className="text-sm font-medium mb-2 text-red-500 flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="truncate">Активные инциденты</span>
                        </div>
                        <div className="space-y-1.5 text-xs">
                            {stats.vandalism > 0 && (
                                <div className="flex justify-between items-center gap-2 text-red-500">
                                    <span className="truncate">Вандализм (разбито стекло)</span>
                                    <span className="font-bold tabular-nums shrink-0">{stats.vandalism}</span>
                                </div>
                            )}
                            {stats.heaterIssues > 0 && (
                                <div className="flex justify-between items-center gap-2 text-orange-500">
                                    <span className="flex items-center gap-1.5 min-w-0"><Flame className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Отказ обогревателя</span></span>
                                    <span className="font-bold tabular-nums shrink-0">{stats.heaterIssues}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
