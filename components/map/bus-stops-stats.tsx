"use client"

import { historicalCameras, historicalStops, type StopHistorySnapshot } from "@/lib/stop-history"
import { useEffect, useMemo, useState } from "react"
import { fetchBusStopsGeoJSON, type BusStopsGeoJSON } from "@/lib/api/bus-stops"
import { fetchCameras } from "@/lib/api/cameras"
import { useModuleAccess } from "@/components/providers/module-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Video, Radio, Crosshair, ChevronDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    BUS_STOP_STATUS_LABELS,
    BUS_STOP_STATUS_ORDER,
    busStopStatusKey,
    useBusStopStatusFilters,
    type BusStopStatusFilters,
    type BusStopStatusKey,
} from "@/lib/map-stop-filters"
import type { Camera, MapFocusTarget, StopEquipmentClass } from "@/lib/types"
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
    unknown = 0,
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
    unknown?: number
    openList: ListKey | null
    onlineKey: ListKey
    offlineKey: ListKey
    onToggle: (key: ListKey) => void
    onSelect: (item: FocusItem) => void
}) {
    const total = onlineItems.length + offlineItems.length + unknown

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
            {unknown > 0 && <p className="mt-1 text-xs text-violet-400">Нет истории: {unknown}</p>}
            {openItems && <FocusList items={openItems} onSelect={onSelect} />}
        </div>
    )
}

/**
 * Строка разбивки по оснащению. Клик оставляет на карте только этот класс
 * остановок, повторный клик по активной строке снимает фильтр.
 */
function ClassRow({
    label,
    value,
    valueClass = "",
    active,
    onClick,
}: {
    label: string
    value: number
    valueClass?: string
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            title={active
                ? "На карте только эти остановки — нажмите, чтобы показать все"
                : "Показать на карте только эти остановки"}
            className={`-mx-1.5 flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                active ? "bg-primary/10" : "hover:bg-muted"
            }`}
        >
            <span className={`truncate ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {label}
            </span>
            <span className={`font-medium tabular-nums shrink-0 ${valueClass}`}>{value}</span>
        </button>
    )
}

/** Цвета счётчиков повторяют раскраску меток на карте. */
const STATUS_COUNT_CLASS: Record<BusStopStatusKey, string> = {
    online: "text-green-500",
    offline: "",
    incidents: "text-red-500",
    unknown: "text-violet-400",
    unequipped: "text-blue-500",
}

/**
 * Строка статуса: галочка включает эти остановки на карте, «только» оставляет
 * их одних (повторное нажатие возвращает остальные).
 */
function StatusRow({
    statusKey,
    count,
    checked,
    disabled,
    solo,
    onToggle,
    onSolo,
}: {
    statusKey: BusStopStatusKey
    count: number
    checked: boolean
    disabled: boolean
    solo: boolean
    onToggle: (checked: boolean) => void
    onSolo: () => void
}) {
    const id = `stop-status-${statusKey}`
    return (
        <div
            className={`group -mx-1.5 flex items-center gap-2 rounded px-1.5 py-1 transition-colors ${
                disabled ? "opacity-50" : "hover:bg-muted"
            }`}
        >
            <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={c => onToggle(!!c)} />
            <Label
                htmlFor={id}
                className={`flex-1 min-w-0 truncate text-xs font-normal ${disabled ? "" : "cursor-pointer"} ${
                    checked ? "text-foreground" : "text-muted-foreground"
                }`}
            >
                {BUS_STOP_STATUS_LABELS[statusKey]}
            </Label>
            {!disabled && (
                <button
                    type="button"
                    onClick={onSolo}
                    title={solo ? "Вернуть остальные статусы" : "Оставить на карте только эти остановки"}
                    className={`text-[11px] shrink-0 transition-opacity ${
                        solo
                            ? "text-foreground font-medium"
                            : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                    }`}
                >
                    только
                </button>
            )}
            <span className={`text-xs font-medium tabular-nums shrink-0 ${STATUS_COUNT_CLASS[statusKey]}`}>
                {count}
            </span>
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

export function BusStopsStats({
    onFocusStop,
    historySnapshot = null,
    stopClass = "all",
    onStopClassChange,
}: {
    onFocusStop?: (target: MapFocusTarget) => void
    historySnapshot?: StopHistorySnapshot | null
    stopClass?: StopEquipmentClass
    onStopClassChange?: (next: StopEquipmentClass) => void
}) {
    const { modules, loading: modulesLoading } = useModuleAccess()
    const [liveData, setData] = useState<BusStopsGeoJSON | null>(null)
    const [liveCameras, setCameras] = useState<Camera[] | null>(null)
    const cameras = useMemo(() => liveCameras && historicalCameras(liveCameras, historySnapshot), [liveCameras, historySnapshot])
    const data = useMemo(() => historicalStops(liveData, cameras ?? [], historySnapshot), [liveData, cameras, historySnapshot])
    const [openList, setOpenList] = useState<ListKey | null>(null)
    const [statusFilters, setStatusFilters] = useBusStopStatusFilters()

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
        let camerasUnknown = 0, sensorsUnknown = 0
        // Класс считается по оборудованию, как и has_equipment: у остановки
        // могут быть только камеры, только датчики или и то, и другое.
        let withCameras = 0, withSensors = 0
        const statusCounts: Record<BusStopStatusKey, number> =
            { online: 0, offline: 0, incidents: 0, unknown: 0, unequipped: 0 }
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
            statusCounts[busStopStatusKey(sd)]++

            if (!sd || !sd.has_equipment) return

            if ((sd.total_camera_count ?? 0) > 0) withCameras++
            if (sd.has_controller) withSensors++

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
                if (sd.sensors_history_known === false) sensorsUnknown++
                else if (sd.sensors_online) sensorsOnline.push(item)
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
                if (c.historyStatus === "unknown") camerasUnknown++
                else if (c.status === "online") camerasOnline.push(item)
                else camerasOffline.push(item)
            })

        const byTitle = (a: FocusItem, b: FocusItem) => a.title.localeCompare(b.title, "ru")
        camerasOnline.sort(byTitle)
        camerasOffline.sort(byTitle)
        sensorsOnline.sort(byTitle)
        sensorsOffline.sort(byTitle)

        return {
            camerasUnknown, sensorsUnknown,
            totalStops: data.features.length,
            withCameras,
            withSensors,
            statusCounts,
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

    const isSolo = (key: BusStopStatusKey) => BUS_STOP_STATUS_ORDER.every(k => statusFilters[k] === (k === key))

    const handleSolo = (key: BusStopStatusKey) => {
        setStatusFilters(prev => {
            const alreadySolo = BUS_STOP_STATUS_ORDER.every(k => prev[k] === (k === key))
            return Object.fromEntries(
                BUS_STOP_STATUS_ORDER.map(k => [k, alreadySolo || k === key]),
            ) as BusStopStatusFilters
        })
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
                    unknown={stats.camerasUnknown}
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
                    unknown={stats.sensorsUnknown}
                    onlineItems={stats.sensorsOnline}
                    offlineItems={stats.sensorsOffline}
                    openList={openList}
                    onlineKey="sensors-online"
                    offlineKey="sensors-offline"
                    onToggle={handleToggle}
                    onSelect={handleSelect}
                />

                <div className="pt-3 border-t space-y-0.5 text-xs">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Оснащение</div>
                    <ClassRow
                        label="Всего остановок"
                        value={stats.totalStops}
                        active={stopClass === "all"}
                        onClick={() => onStopClassChange?.("all")}
                    />
                    <ClassRow
                        label="С камерами"
                        value={stats.withCameras}
                        active={stopClass === "cameras"}
                        onClick={() => onStopClassChange?.(stopClass === "cameras" ? "all" : "cameras")}
                    />
                    <ClassRow
                        label="С датчиками"
                        value={stats.withSensors}
                        active={stopClass === "sensors"}
                        onClick={() => onStopClassChange?.(stopClass === "sensors" ? "all" : "sensors")}
                    />
                </div>

                <div className="pt-3 border-t space-y-0.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Статус на карте</div>
                    {BUS_STOP_STATUS_ORDER.map(key => (
                        <StatusRow
                            key={key}
                            statusKey={key}
                            count={stats.statusCounts[key]}
                            checked={statusFilters[key]}
                            disabled={stopClass !== "all"}
                            solo={isSolo(key)}
                            onToggle={checked => setStatusFilters(prev => ({ ...prev, [key]: checked }))}
                            onSolo={() => handleSolo(key)}
                        />
                    ))}
                    {stopClass !== "all" && (
                        <p className="pt-1 text-[11px] text-muted-foreground">
                            Выбранная строка оснащения показывает весь класс — статусы не применяются.
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
