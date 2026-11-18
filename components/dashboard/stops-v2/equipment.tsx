"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Activity, Camera, Cctv, CircleHelp, Download, Gauge, ListX, TimerReset, Unplug, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { isLiveVisionData } from "@/lib/mock/stop-analytics-vision-data"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
    HOUR,
    OUTAGE_CAUSES,
    V_NORMS,
    V_NOW,
    districtName,
    fmtDateTime,
    fmtDuration,
    fmtInt,
    fmtNum,
    overlapMs,
    plural,
    stopById,
    type VDeviceType,
    type VOutage,
    type VOutageCause,
} from "@/lib/mock/stop-analytics-vision-data"
import {
    availabilityPct,
    buildBuckets,
    devicesOf,
    meanRepairMs,
    openOutages,
    outageDurationMs,
    outageEnd,
    outageIncidents,
    outagesStarted,
    outagesTouching,
} from "@/components/dashboard/stops-v2/selectors"
import {
    ChartCard,
    DataTable,
    EmptyNote,
    Insight,
    KpiCard,
    RankList,
    SectionShell,
    Segmented,
    StatusBadge,
    StopLink,
    makeDelta,
    usePeriodPhrase,
    useScope,
    type Column,
    type RankRow,
} from "@/components/dashboard/stops-v2/kit"

const SHORT_MS = 10 * 60_000

const availabilityConfig = {
    camera: { label: "Камеры", color: "#2563eb" },
    controller: { label: "Контроллеры датчиков", color: "#ea580c" },
} satisfies ChartConfig

type DeviceFilter = "offline" | "long" | "online" | "all"

interface DeviceRow {
    key: string
    label: string
    stopId: number
    since: number | null
    cause: VOutageCause | null
}

const DEVICE_FILTERS: { value: DeviceFilter; label: string }[] = [
    { value: "offline", label: "Не в сети" },
    { value: "long", label: "Дольше суток" },
    { value: "online", label: "В сети" },
    { value: "all", label: "Все" },
]

const EXPORT_SLUG: Record<DeviceFilter, string> = { offline: "ne-v-seti", long: "ne-v-seti-dolshe-sutok", online: "v-seti", all: "vse" }

const CAUSE_LABEL = Object.fromEntries(OUTAGE_CAUSES.map((cause) => [cause.id, cause])) as Record<VOutageCause, (typeof OUTAGE_CAUSES)[number]>

export function StopsEquipment() {
    const scope = useScope()
    const phrase = usePeriodPhrase()
    const [device, setDevice] = useState<VDeviceType>("camera")
    const [showShort, setShowShort] = useState(false)
    // Список устройств по нажатию на плитку: null — окно закрыто.
    const [deviceList, setDeviceList] = useState<DeviceFilter | null>(null)

    const data = useMemo(() => {
        const { ids, from, to, prevFrom, prevTo } = scope
        const total = devicesOf(ids, device).length
        const availability = availabilityPct(ids, from, to, device)
        const availabilityPrev = availabilityPct(ids, prevFrom, prevTo, device)
        const open = openOutages(ids, device)
        const openLong = open.filter((outage) => V_NOW - outage.startAt > V_NORMS.offlineHours * HOUR)
        const repair = meanRepairMs(ids, from, to, device)
        const repairPrev = meanRepairMs(ids, prevFrom, prevTo, device)

        const series = buildBuckets(scope).map((bucket) => ({
            label: bucket.label,
            camera: Number(availabilityPct(ids, bucket.from, bucket.to, "camera").toFixed(1)),
            controller: Number(availabilityPct(ids, bucket.from, bucket.to, "controller").toFixed(1)),
        }))
        const floor = Math.max(0, Math.floor((Math.min(...series.flatMap((row) => [row.camera, row.controller]), 100) - 2) / 5) * 5)

        const touching = outagesTouching(ids, from, to, device).filter((outage) => outageDurationMs(outage) >= SHORT_MS)
        const causes = OUTAGE_CAUSES.map((cause, index) => {
            const list = touching.filter((outage) => outage.cause === cause.id)
            const hours = list.reduce((sum, outage) => sum + overlapMs(outage.startAt, outageEnd(outage), from, to), 0) / HOUR
            const parts = OUTAGE_CAUSES.map((_, partIndex) => (partIndex === index ? hours : 0))
            return { cause, hours, incidents: outageIncidents(list), parts }
        })
        const causeHours = causes.reduce((sum, row) => sum + row.hours, 0)

        const openByStop = new Map<number, VOutage[]>()
        for (const outage of open) openByStop.set(outage.stopId, [...(openByStop.get(outage.stopId) ?? []), outage])
        const offlineNow = Array.from(openByStop.entries())
            .map(([stopId, list]) => {
                const whole = list.some((outage) => outage.cause !== "device")
                return { stop: stopById(stopId), list, whole, since: Math.min(...list.map((outage) => outage.startAt)) }
            })
            .filter((row) => row.stop)
            .sort((a, b) => a.since - b.since)

        const perStop = new Map<number, VOutage[]>()
        for (const outage of touching) perStop.set(outage.stopId, [...(perStop.get(outage.stopId) ?? []), outage])
        const ranking: RankRow[] = Array.from(perStop.entries())
            .map(([stopId, list]) => ({
                stop: stopById(stopId),
                incidents: outageIncidents(list),
                hours: list.reduce((sum, outage) => sum + overlapMs(outage.startAt, outageEnd(outage), from, to), 0) / HOUR / (device === "camera" ? 3 : 1),
            }))
            .filter((row) => row.stop)
            .sort((a, b) => b.hours - a.hours)
            .slice(0, 10)
            .map((row) => ({
                id: row.stop!.id,
                stop: row.stop!,
                parts: [row.hours],
                valueText: `${row.incidents} ${plural(row.incidents, ["отключение", "отключения", "отключений"])} · ${fmtNum(row.hours)} ч`,
            }))

        const table = outagesStarted(ids, from, to, device)
        const mainCause = causes.slice().sort((a, b) => b.hours - a.hours)[0]
        // Каждое устройство — один раз: со временем начала текущего отключения или «в сети».
        const openByDevice = new Map(open.map((outage) => [outage.deviceKey, outage]))
        const devices: DeviceRow[] = devicesOf(ids, device).map((item) => {
            const outage = openByDevice.get(item.key)
            return { key: item.key, label: item.label, stopId: item.stopId, since: outage?.startAt ?? null, cause: outage?.cause ?? null }
        })
        return { devices, total, availability, availabilityPrev, open, openLong, repair, repairPrev, series, floor, causes, causeHours, offlineNow, ranking, table, mainCause }
    }, [scope, device])

    const tableRows = useMemo(
        () => data.table.filter((outage) => showShort || outageDurationMs(outage) >= SHORT_MS),
        [data.table, showShort],
    )
    const hiddenShort = data.table.length - data.table.filter((outage) => outageDurationMs(outage) >= SHORT_MS).length
    const deviceWord = device === "camera" ? "камер" : "контроллеров"

    const longMs = V_NORMS.offlineHours * HOUR
    const deviceRows = useMemo(() => data.devices.filter((row) => {
        if (deviceList === "online") return row.since === null
        if (deviceList === "offline") return row.since !== null
        if (deviceList === "long") return row.since !== null && V_NOW - row.since > longMs
        return true
    }), [data.devices, deviceList, longMs])
    const deviceColumns: Column<DeviceRow>[] = [
        { key: "device", header: device === "camera" ? "Камера" : "Контроллер", cell: (row) => <span className="inline-flex items-center gap-2 font-medium">{device === "camera" ? <Camera className="h-4 w-4 text-muted-foreground" /> : <Gauge className="h-4 w-4 text-muted-foreground" />}{row.label}</span>, value: (row) => row.label },
        { key: "stop", header: "Остановка", cell: (row) => { const stop = stopById(row.stopId); return stop ? <StopLink stop={stop} /> : null }, value: (row) => stopById(row.stopId)?.name ?? "" },
        { key: "code", header: "№ остановки", cell: (row) => stopById(row.stopId)?.code ?? "", value: (row) => stopById(row.stopId)?.code ?? "" },
        { key: "district", header: "Микрорайон", cell: (row) => districtName(stopById(row.stopId)?.districtId ?? ""), value: (row) => districtName(stopById(row.stopId)?.districtId ?? "") },
        { key: "state", header: "Статус", cell: (row) => row.since === null ? <StatusBadge tone="success">В сети</StatusBadge> : <StatusBadge tone={V_NOW - row.since > longMs ? "high" : "attention"}>Не в сети</StatusBadge>, value: (row) => (row.since === null ? "В сети" : "Не в сети") },
        { key: "since", header: "Не в сети с", cell: (row) => <span className="whitespace-nowrap tabular-nums">{row.since === null ? "—" : fmtDateTime(row.since)}</span>, value: (row) => (row.since === null ? "" : fmtDateTime(row.since)) },
        { key: "duration", header: "Без связи", align: "right", cell: (row) => <span className="font-medium">{row.since === null ? "—" : fmtDuration(V_NOW - row.since)}</span>, value: (row) => (row.since === null ? "" : fmtDuration(V_NOW - row.since)) },
        { key: "cause", header: "Вероятная причина", cell: (row) => (row.cause ? CAUSE_LABEL[row.cause].hint : "—"), value: (row) => (row.cause ? CAUSE_LABEL[row.cause].hint : "") },
    ]

    const columns: Column<VOutage>[] = [
        { key: "device", header: "Оборудование", cell: (outage) => <span className="inline-flex items-center gap-2 font-medium">{outage.device === "camera" ? <Camera className="h-4 w-4 text-muted-foreground" /> : <Gauge className="h-4 w-4 text-muted-foreground" />}{outage.label}</span>, value: (outage) => outage.label },
        { key: "stop", header: "Остановка", cell: (outage) => { const stop = stopById(outage.stopId); return stop ? <StopLink stop={stop} /> : null }, value: (outage) => stopById(outage.stopId)?.name ?? "" },
        { key: "start", header: "Начало", cell: (outage) => <span className="whitespace-nowrap tabular-nums">{fmtDateTime(outage.startAt)}</span>, value: (outage) => outage.startAt },
        { key: "end", header: "Восстановлено", cell: (outage) => <span className="whitespace-nowrap tabular-nums">{outage.endAt ? fmtDateTime(outage.endAt) : "—"}</span>, value: (outage) => outage.endAt ?? V_NOW },
        { key: "duration", header: "Длительность", align: "right", cell: (outage) => <span className="font-medium">{fmtDuration(outageDurationMs(outage))}</span>, value: (outage) => Math.round(outageDurationMs(outage) / 60_000) },
        { key: "cause", header: "Вероятная причина", cell: (outage) => CAUSE_LABEL[outage.cause].hint, value: (outage) => CAUSE_LABEL[outage.cause].hint },
        { key: "state", header: "Статус", cell: (outage) => outage.endAt === null ? <StatusBadge tone="high">Не работает</StatusBadge> : <StatusBadge tone="muted">Восстановлено</StatusBadge>, value: (outage) => (outage.endAt === null ? 0 : 1) },
    ]

    return (
        <SectionShell
            title="Оборудование"
            titleAddon={
                    <Segmented<VDeviceType>
                        value={device}
                        onChange={setDevice}
                        options={[
                            { value: "camera", label: "Камеры" },
                            { value: "controller", label: "Датчики" },
                        ]}
                    />
            }
            actions={isLiveVisionData() && (
                        <Button asChild variant="outline" size="sm" className="h-9 gap-2">
                            {/* Статусы — на момент нажатия, отключения — за выбранный период. */}
                            <a href={`/api/equipment/status-report?from=${new Date(scope.from).toISOString()}&to=${new Date(scope.to).toISOString()}`} download>
                                <Download className="h-4 w-4" />
                                Скачать Excel
                            </a>
                        </Button>
            )}
        >
            <Insight>
                <span className="font-medium">{phrase}:</span> доступность {deviceWord} {fmtNum(data.availability)} %. Сейчас не в сети {data.open.length} из {data.total}, на {data.offlineNow.length} {plural(data.offlineNow.length, ["остановке", "остановках", "остановках"])}; {data.openLong.length} — дольше суток.
                {data.causeHours > 0 && ` Чаще всего ${data.mainCause.cause.phrase} (${fmtNum((data.mainCause.hours / data.causeHours) * 100, 0)} % времени простоя): это ${data.mainCause.cause.hint}.`}
            </Insight>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    onClick={() => setDeviceList("all")}
                    title="Доступность за период"
                    value={`${fmtNum(data.availability)} %`}
                    icon={Activity}
                    tone={data.availability < 95 ? "attention" : "success"}
                    delta={makeDelta(data.availability, data.availabilityPrev, { kind: "points", goodWhen: "up" })}
                    deltaLabel={scope.prevLabel}
                />
                <KpiCard
                    onClick={() => setDeviceList("offline")}
                    title="Не в сети сейчас"
                    value={fmtInt(data.open.length)}
                    icon={Unplug}
                    tone={data.open.length > 0 ? "attention" : "success"}
                    detail={`Из ${fmtInt(data.total)} · на ${data.offlineNow.length} ${plural(data.offlineNow.length, ["остановке", "остановках", "остановках"])}`}
                />
                <KpiCard
                    onClick={() => setDeviceList("long")}
                    title="Из них дольше суток"
                    value={fmtInt(data.openLong.length)}
                    icon={ListX}
                    tone={data.openLong.length > 0 ? "high" : "success"}
                    detail={`Допустимый простой ${V_NORMS.offlineHours} ч`}
                />
                <KpiCard
                    title="Среднее время восстановления"
                    value={data.repair ? fmtDuration(data.repair) : "—"}
                    icon={TimerReset}
                    delta={makeDelta(data.repair, data.repairPrev, { kind: "duration", goodWhen: "down" })}
                    deltaLabel={scope.prevLabel}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-7" title="Как менялась доступность?" icon={Activity} iconClassName="text-blue-500" hint="Доля оборудования на связи. Провал сразу по обеим линиям означает общую аварию.">
                    <ChartContainer config={availabilityConfig} className="h-[300px] w-full">
                        <LineChart data={data.series} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={56} domain={[data.floor, 100]} tickFormatter={(value) => `${value} %`} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Line dataKey="camera" stroke="var(--color-camera)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                            <Line dataKey="controller" stroke="var(--color-controller)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                        </LineChart>
                    </ChartContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-5" title="Почему нет связи?" icon={CircleHelp} iconClassName="text-amber-500" hint="Причина определяется по тому, что отключилось одновременно">
                    {data.causeHours <= 0 ? (
                        <EmptyNote>За период отключений не было</EmptyNote>
                    ) : (
                        <RankList
                            rows={data.causes.map((row) => ({
                                id: row.cause.id,
                                label: row.cause.label,
                                sub: row.cause.hint,
                                parts: row.parts,
                                valueText: `${row.incidents} сл. · ${fmtNum(row.hours, 0)} ч`,
                            }))}
                            colors={OUTAGE_CAUSES.map((cause) => cause.color)}
                            labelWidth="12.5rem"
                        />
                    )}
                </ChartCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-7" title="Что не работает сейчас?" icon={Cctv} iconClassName="text-red-500" hint="Сгруппировано по остановкам, самые долгие сверху">
                    {data.offlineNow.length === 0 ? (
                        <EmptyNote>Всё оборудование на связи</EmptyNote>
                    ) : (
                        <div className="space-y-2">
                            {data.offlineNow.map((row) => {
                                const long = V_NOW - row.since > V_NORMS.offlineHours * HOUR
                                return (
                                    <div key={row.stop!.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                                        <div className="w-44 shrink-0"><StopLink stop={row.stop!} /></div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">
                                                {row.whole ? `Вся остановка: ${row.list.length} ${device === "camera" ? plural(row.list.length, ["камера", "камеры", "камер"]) : "контроллер"}` : row.list.map((outage) => outage.label).join(", ")}
                                            </div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                Вероятно, {row.whole ? CAUSE_LABEL.stop.hint : CAUSE_LABEL.device.hint} · с {fmtDateTime(row.since)}
                                            </div>
                                        </div>
                                        <StatusBadge tone={long ? "high" : "attention"}>{fmtDuration(V_NOW - row.since)}</StatusBadge>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </ChartCard>

                <ChartCard className="xl:col-span-5" title="Что ломается чаще всего?" icon={Wrench} iconClassName="text-violet-500" hint="Часы простоя на остановке за период">
                    <RankList rows={data.ranking} colors={["#2563eb"]} emptyText="За период отключений не было" />
                </ChartCard>
            </div>

            <Dialog open={deviceList !== null} onOpenChange={(open) => { if (!open) setDeviceList(null) }}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
                    <DialogHeader>
                        <DialogTitle>{device === "camera" ? "Камеры" : "Контроллеры датчиков"}: {fmtInt(deviceRows.length)} из {fmtInt(data.total)}</DialogTitle>
                        <DialogDescription>Состояние на {fmtDateTime(V_NOW)}. Выгрузка берёт строки с учётом фильтра и поиска.</DialogDescription>
                    </DialogHeader>
                    {deviceList !== null && (
                        <DataTable
                            key={`${device}-${deviceList}`}
                            columns={deviceColumns}
                            rows={deviceRows}
                            rowKey={(row) => row.key}
                            search={(row) => { const stop = stopById(row.stopId); return `${stop?.name ?? ""} ${stop?.code ?? ""} ${row.label} ${districtName(stop?.districtId ?? "")}` }}
                            searchPlaceholder="Остановка, номер или устройство"
                            pageSize={12}
                            exportName={`${device === "camera" ? "kamery" : "kontrollery"}-${EXPORT_SLUG[deviceList]}`}
                            initialSort={deviceList === "online" || deviceList === "all" ? { key: "stop", dir: "asc" } : { key: "since", dir: "asc" }}
                            toolbar={<Segmented<DeviceFilter> value={deviceList} onChange={setDeviceList} options={DEVICE_FILTERS} />}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <ChartCard title="Отключения за период" icon={Unplug} iconClassName="text-sky-500">
                <DataTable
                    columns={columns}
                    rows={tableRows}
                    rowKey={(outage) => outage.id}
                    search={(outage) => `${stopById(outage.stopId)?.name ?? ""} ${outage.label} ${districtName(stopById(outage.stopId)?.districtId ?? "")}`}
                    searchPlaceholder="Остановка или номер устройства"
                    exportName="otklyucheniya"
                    initialSort={{ key: "start", dir: "desc" }}
                    toolbar={
                        <div className="flex items-center gap-2">
                            <Switch id="vision-short-outages" checked={showShort} onCheckedChange={setShowShort} />
                            <Label htmlFor="vision-short-outages" className="text-sm text-muted-foreground">
                                Кратковременные обрывы до 10 мин{hiddenShort > 0 && !showShort ? ` (скрыто ${hiddenShort})` : ""}
                            </Label>
                        </div>
                    }
                />
            </ChartCard>
        </SectionShell>
    )
}
