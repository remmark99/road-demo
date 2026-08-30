"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
    Activity,
    AlertTriangle,
    Clock3,
    Database,
    Droplets,
    Gauge,
    RefreshCw,
    Thermometer,
    Zap,
} from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
    SENSOR_HISTORY_PERIODS,
    fetchStopSensorHistory,
    type SensorHistoryHours,
    type StopSensorHistoryResponse,
    type StopSensorSeriesPoint,
} from "@/lib/api/stop-sensor-history"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PERIOD_LABELS: Record<SensorHistoryHours, string> = {
    1: "1 час",
    6: "6 часов",
    24: "24 часа",
    168: "7 дней",
}

const CATEGORY_META = {
    temperature: { label: "Температура", unit: "°C", color: "hsl(24, 95%, 53%)", icon: Thermometer },
    humidity: { label: "Влажность", unit: "%", color: "hsl(199, 89%, 48%)", icon: Droplets },
    "voltage input": { label: "Напряжение", unit: "В", color: "hsl(262, 83%, 58%)", icon: Zap },
    "digital input": { label: "Цифровые входы", unit: "", color: "hsl(142, 71%, 45%)", icon: Activity },
} as const

type KnownCategory = keyof typeof CATEGORY_META

const CHART_CATEGORIES: KnownCategory[] = [
    "temperature",
    "humidity",
    "voltage input",
    "digital input",
]

const SERIES_COLORS = [
    "hsl(24, 95%, 53%)",
    "hsl(199, 89%, 48%)",
    "hsl(262, 83%, 58%)",
    "hsl(142, 71%, 45%)",
    "hsl(346, 77%, 50%)",
]

function formatDateTime(value: string | null) {
    if (!value) return "—"
    return new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Asia/Yekaterinburg",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value))
}

function formatChartTime(value: string, hours: SensorHistoryHours) {
    return new Intl.DateTimeFormat("ru-RU", hours > 24
        ? { timeZone: "Asia/Yekaterinburg", day: "2-digit", month: "2-digit", hour: "2-digit" }
        : { timeZone: "Asia/Yekaterinburg", hour: "2-digit", minute: "2-digit" }
    ).format(new Date(value))
}

function categoryLabel(category: string) {
    return CATEGORY_META[category as KnownCategory]?.label ?? category
}

function categoryUnit(category: string) {
    return CATEGORY_META[category as KnownCategory]?.unit ?? ""
}

function sensorDisplayName(sensor: {
    element: number
    category: string
    name?: string
}) {
    if (sensor.element === 1 && sensor.category === "digital input") return "Датчик разбития стекла"
    if (sensor.element >= 2 && sensor.element <= 5 && sensor.category === "digital input") {
        return `Цифровой вход № ${sensor.element}`
    }
    if (sensor.element === 9 && sensor.category === "voltage input") return "Датчик напряжения № 1"
    if (sensor.element === 10 && sensor.category === "voltage input") return "Датчик напряжения № 2"
    if (sensor.element === 13) return "Датчик № 1"
    if (sensor.element === 14) return "Датчик № 2"
    return sensor.name?.trim() && !/[A-Za-z]/.test(sensor.name)
        ? sensor.name
        : `Датчик № ${sensor.element}`
}

function alarmLabel(alarm: string | null | undefined) {
    switch (alarm?.toLowerCase()) {
        case "critical": return "Критично"
        case "alarm": return "Тревога"
        case "warning": return "Предупреждение"
        default: return "Норма"
    }
}

function deviceCountLabel(count: number) {
    if (count % 10 === 1 && count % 100 !== 11) return `${count} настоящий датчик`
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
        return `${count} настоящих датчика`
    }
    return `${count} настоящих датчиков`
}

function formatValue(category: string, value: number | null) {
    if (value === null) return "—"
    if (category === "digital input") return value >= 0.5 ? "Включён" : "Выключен"
    const unit = categoryUnit(category)
    return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`
}

function isAlarm(value: string | null | undefined) {
    return Boolean(value && !["normal", "ok"].includes(value.toLowerCase()))
}

function sensorKey(point: Pick<StopSensorSeriesPoint, "busStopId" | "element" | "address" | "category">) {
    return `${point.busStopId}:${point.element}:${point.address}:${point.category}`
}

function dataKey(point: Pick<StopSensorSeriesPoint, "busStopId" | "element" | "address" | "category">) {
    return `s_${point.busStopId}_${point.element}_${point.address}_${point.category.replace(/\W+/g, "_")}`
}

function SensorChart({
    category,
    points,
    hours,
}: {
    category: KnownCategory
    points: StopSensorSeriesPoint[]
    hours: SensorHistoryHours
}) {
    const meta = CATEGORY_META[category]
    const Icon = meta.icon
    const sensors = useMemo(() => {
        const map = new Map<string, StopSensorSeriesPoint>()
        points.filter((point) => point.category === category).forEach((point) => map.set(sensorKey(point), point))
        return Array.from(map.values())
    }, [category, points])

    const chartData = useMemo(() => {
        const rows = new Map<string, Record<string, string | number | null>>()
        points.filter((point) => point.category === category).forEach((point) => {
            const current = rows.get(point.bucket) ?? {
                bucket: point.bucket,
                time: formatChartTime(point.bucket, hours),
            }
            current[dataKey(point)] = point.average
            rows.set(point.bucket, current)
        })
        return Array.from(rows.values()).sort((left, right) => String(left.bucket).localeCompare(String(right.bucket)))
    }, [category, hours, points])

    const config = useMemo(() => sensors.reduce<ChartConfig>((result, sensor, index) => {
        result[dataKey(sensor)] = {
            label: sensorDisplayName(sensor),
            color: SERIES_COLORS[index % SERIES_COLORS.length] ?? meta.color,
        }
        return result
    }, {}), [meta.color, sensors])

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5" style={{ color: meta.color }} />
                    {meta.label}
                </CardTitle>
                <CardDescription>
                    Среднее значение за временной интервал{meta.unit ? `, ${meta.unit}` : ""}.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {chartData.length === 0 ? (
                    <div className="flex h-[250px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                        Нет показаний за выбранный период
                    </div>
                ) : (
                    <ChartContainer config={config} className="h-[250px] w-full">
                        <LineChart data={chartData} margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                domain={category === "digital input" ? [0, 1] : ["auto", "auto"]}
                                allowDecimals={category !== "digital input"}
                                tickFormatter={category === "digital input" ? (value) => value ? "Вкл" : "Выкл" : undefined}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            {sensors.map((sensor, index) => (
                                <Line
                                    key={sensorKey(sensor)}
                                    type={category === "digital input" ? "stepAfter" : "monotone"}
                                    dataKey={dataKey(sensor)}
                                    stroke={SERIES_COLORS[index % SERIES_COLORS.length] ?? meta.color}
                                    strokeWidth={2.25}
                                    dot={false}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    )
}

function DigitalInputsCard({
    rows,
}: {
    rows: StopSensorHistoryResponse["recent"]
}) {
    const groups = useMemo(() => {
        const grouped = new Map<string, typeof rows>()

        rows.filter((row) => row.category === "digital input").forEach((row) => {
            const key = `${row.busStopId}:${row.element}:${row.address}:${row.category}`
            const current = grouped.get(key) ?? []
            current.push(row)
            grouped.set(key, current)
        })

        return Array.from(grouped.values())
            .map((history) => {
                const latest = history[0]
                let changes = 0
                for (let index = 1; index < history.length; index += 1) {
                    if (history[index - 1]?.value !== history[index]?.value
                        || history[index - 1]?.alarm !== history[index]?.alarm) {
                        changes += 1
                    }
                }
                return { latest, changes }
            })
            .filter((item): item is { latest: NonNullable<typeof item.latest>; changes: number } => Boolean(item.latest))
            .sort((left, right) => left.latest.element - right.latest.element)
    }, [rows])

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-5 w-5 text-emerald-500" />
                    Цифровые входы
                </CardTitle>
                <CardDescription>
                    Последнее состояние каждого входа вместо малоинформативного графика.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {groups.length === 0 ? (
                    <div className="flex h-[250px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                        Нет показаний за выбранный период
                    </div>
                ) : (
                    <div className="space-y-2">
                        {groups.map(({ latest, changes }) => (
                            <div key={`${latest.busStopId}:${latest.element}:${latest.address}`} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{sensorDisplayName(latest)}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        Срабатывание: {isAlarm(latest.alarm) ? "зафиксировано" : "не зафиксировано"} · {formatDateTime(latest.recordedAt)} по Сургуту
                                    </div>
                                </div>
                                <div className="text-right">
                                    <Badge variant={isAlarm(latest.alarm) ? "destructive" : "secondary"}>{alarmLabel(latest.alarm)}</Badge>
                                    <div className="mt-1 text-[11px] text-muted-foreground">Изменений: {changes}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export function StopSensorAnalytics() {
    const [hours, setHours] = useState<SensorHistoryHours>(24)
    const [selectedStop, setSelectedStop] = useState("all")
    const [selectedCategory, setSelectedCategory] = useState("all")
    const [selectedTableSensor, setSelectedTableSensor] = useState("all")
    const [tableLimit, setTableLimit] = useState("20")
    const [data, setData] = useState<StopSensorHistoryResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await fetchStopSensorHistory({ hours }))
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить историю")
        } finally {
            setLoading(false)
        }
    }, [hours])

    useEffect(() => {
        const timer = window.setTimeout(() => void loadData(), 0)
        return () => window.clearTimeout(timer)
    }, [loadData])

    const stopId = selectedStop === "all" ? null : Number(selectedStop)
    const filteredSeries = useMemo(() => (data?.series ?? []).filter((point) =>
        (stopId === null || point.busStopId === stopId)
        && (selectedCategory === "all" || point.category === selectedCategory)
    ), [data?.series, selectedCategory, stopId])
    const filteredRecent = useMemo(() => (data?.recent ?? []).filter((row) =>
        (stopId === null || row.busStopId === stopId)
        && (selectedCategory === "all" || row.category === selectedCategory)
    ), [data?.recent, selectedCategory, stopId])
    const filteredSensors = useMemo(() => (data?.sensors ?? []).filter((sensor) =>
        (stopId === null || sensor.busStopId === stopId)
        && (selectedCategory === "all" || sensor.category === selectedCategory)
    ), [data?.sensors, selectedCategory, stopId])
    const latestBySensor = useMemo(() => {
        const latest = new Map<string, (typeof filteredRecent)[number]>()
        filteredRecent.forEach((row) => {
            const key = `${row.busStopId}:${row.element}:${row.address}:${row.category}`
            if (!latest.has(key)) latest.set(key, row)
        })
        return Array.from(latest.values())
    }, [filteredRecent])
    const alarmCount = latestBySensor.filter((row) => isAlarm(row.alarm)).length
    const filteredRowCount = filteredSeries.reduce((total, point) => total + point.samples, 0)
    const physicalDeviceCount = new Set(filteredSensors.map((sensor) => `${sensor.busStopId}:${sensor.element}`)).size
    const effectiveTableSensor = filteredSensors.some((sensor) => sensor.key === selectedTableSensor)
        ? selectedTableSensor
        : "all"
    const tableRows = filteredRecent
        .filter((row) => effectiveTableSensor === "all" || sensorKey(row) === effectiveTableSensor)
        .slice(0, Number(tableLimit))
    const isStale = data?.lastRecordedAt
        ? Date.parse(data.range.to) - Date.parse(data.lastRecordedAt) > 3 * 60 * 1000
        : true

    if (loading && !data) {
        return (
            <div className="space-y-5 p-4 md:p-6">
                <Skeleton className="h-20 w-full" />
                <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div>
                <div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
            </div>
        )
    }

    return (
        <div className="space-y-5 p-4 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">История датчиков</h2>
                        <Badge variant={isStale ? "destructive" : "secondary"}>
                            {isStale ? "Нет свежих данных" : "Данные поступают"}
                        </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Минутные показания контроллеров остановочных павильонов. Время — сургутское (UTC+5).
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={String(hours)} onValueChange={(value) => setHours(Number(value) as SensorHistoryHours)}>
                        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {SENSOR_HISTORY_PERIODS.map((period) => <SelectItem key={period} value={String(period)}>{PERIOD_LABELS[period]}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedStop} onValueChange={setSelectedStop}>
                        <SelectTrigger className="w-[210px]"><SelectValue placeholder="Все остановки" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Все остановки</SelectItem>
                            {(data?.stops ?? []).map((stop) => <SelectItem key={stop.id} value={String(stop.id)}>{stop.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Все датчики" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Все датчики</SelectItem>
                            {CHART_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{CATEGORY_META[category].label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={() => void loadData()} disabled={loading} aria-label="Обновить данные">
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Gauge className="h-4 w-4 text-primary" />Подтверждённые показатели</div><div className="mt-3 text-3xl font-semibold tabular-nums">{filteredSensors.length}</div><p className="mt-1 text-xs text-muted-foreground">{deviceCountLabel(physicalDeviceCount)}; датчик № 1 передаёт температуру и влажность</p></CardContent></Card>
                <Card><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Database className="h-4 w-4 text-sky-500" />Записей</div><div className="mt-3 text-3xl font-semibold tabular-nums">{filteredRowCount.toLocaleString("ru-RU")}</div><p className="mt-1 text-xs text-muted-foreground">В выбранном периоде</p></CardContent></Card>
                <Card className={alarmCount ? "border-amber-500/30 bg-amber-500/[0.04]" : ""}><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className={`h-4 w-4 ${alarmCount ? "text-amber-500" : "text-emerald-500"}`} />Предупреждения контроллера</div><div className="mt-3 text-3xl font-semibold tabular-nums">{alarmCount}</div><p className="mt-1 text-xs text-muted-foreground">Каналы, где контроллер вернул статус «Предупреждение» или «Тревога»</p></CardContent></Card>
                <Card><CardContent className="pt-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4 text-violet-500" />Последняя запись</div><div className="mt-3 text-xl font-semibold tabular-nums">{formatDateTime(data?.lastRecordedAt ?? null)}</div><p className="mt-1 text-xs text-muted-foreground">Сургутское время · снимок раз в минуту</p></CardContent></Card>
            </div>

            {data?.truncated && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                    Период содержит больше 60 000 строк. На графиках показана последняя доступная часть диапазона.
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
                {CHART_CATEGORIES
                    .filter((category) => category !== "digital input")
                    .filter((category) => selectedCategory === "all" || selectedCategory === category)
                    .map((category) => <SensorChart key={category} category={category} points={filteredSeries} hours={hours} />)}
                {(selectedCategory === "all" || selectedCategory === "digital input") && (
                    <DigitalInputsCard rows={filteredRecent} />
                )}
            </div>

            <Card>
                <CardHeader className="gap-3 pb-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <CardTitle className="text-base">Последние показания</CardTitle>
                        <CardDescription>Выберите конкретный датчик и количество строк истории.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Select value={effectiveTableSensor} onValueChange={setSelectedTableSensor}>
                            <SelectTrigger className="w-[250px]"><SelectValue placeholder="Все датчики" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все датчики</SelectItem>
                                {filteredSensors.map((sensor) => (
                                    <SelectItem key={sensor.key} value={sensor.key}>{sensorDisplayName(sensor)} · {categoryLabel(sensor.category)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={tableLimit} onValueChange={setTableLimit}>
                            <SelectTrigger className="w-[135px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {[20, 50, 100].map((limit) => <SelectItem key={limit} value={String(limit)}>{limit} показаний</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader><TableRow><TableHead>Время (Сургут)</TableHead><TableHead>Остановка</TableHead><TableHead>Датчик</TableHead><TableHead>Тип</TableHead><TableHead className="text-right">Значение</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {tableRows.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Нет данных за выбранный период</TableCell></TableRow>
                                ) : tableRows.map((row) => {
                                    const stop = data?.stops.find((item) => item.id === row.busStopId)
                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(row.recordedAt)}</TableCell>
                                            <TableCell>{stop?.label ?? `Остановка ${row.busStopId}`}</TableCell>
                                            <TableCell><div className="font-medium">{sensorDisplayName(row)}</div></TableCell>
                                            <TableCell>{categoryLabel(row.category)}</TableCell>
                                            <TableCell className="text-right font-medium tabular-nums">{formatValue(row.category, row.value)}</TableCell>
                                            <TableCell><Badge variant={isAlarm(row.alarm) ? "destructive" : "secondary"}>{alarmLabel(row.alarm)}</Badge></TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
