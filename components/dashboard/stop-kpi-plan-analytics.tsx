"use client"

import {
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import {
    BusFront,
    CheckCircle2,
    MapPin,
    Target,
    Video,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    STOP_CITY_TOTAL,
    STOP_DISTRICT_COVERAGE_ESTIMATES,
    STOP_EQUIPPED_COUNT,
    STOP_EQUIPMENT_PLAN_TARGET,
    STOP_LIVE_CAMERA_COUNT,
    STOP_OPERATIONAL_COUNT,
} from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "success" | "attention"

const planConfig = {
    value: { label: "Остановки", color: "hsl(221, 83%, 53%)" },
} satisfies ChartConfig

const districtPlanConfig = {
    connectedStops: { label: "Подключено", color: "hsl(160, 84%, 39%)" },
    remainingMin: { label: "Минимум осталось", color: "hsl(38, 92%, 50%)" },
} satisfies ChartConfig

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function KpiCard({
    title,
    value,
    caption,
    detail,
    icon: Icon,
    tone = "normal",
}: {
    title: string
    value: string
    caption: string
    detail: string
    icon: typeof BusFront
    tone?: KpiTone
}) {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardDescription>{title}</CardDescription>
                    <CardTitle
                        className={cn(
                            "text-3xl font-semibold tabular-nums",
                            tone === "success" && "text-emerald-600 dark:text-emerald-400",
                            tone === "attention" && "text-amber-600 dark:text-amber-400",
                        )}
                    >
                        {value}
                    </CardTitle>
                </div>
                <div
                    className={cn(
                        "rounded-md border p-2",
                        tone === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                        tone === "attention" && "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
                        tone === "normal" && "border-primary/20 bg-primary/10 text-primary",
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>
            <CardContent className="space-y-1">
                <p className="text-sm text-muted-foreground">{caption}</p>
                <p className="text-xs font-medium text-foreground">{detail}</p>
            </CardContent>
        </Card>
    )
}

function ProgressRow({
    label,
    value,
    pct,
    tone = "normal",
}: {
    label: string
    value: string
    pct: number
    tone?: KpiTone
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
                <div
                    className={cn(
                        "h-full rounded-full",
                        tone === "success" && "bg-emerald-500",
                        tone === "attention" && "bg-amber-500",
                        tone === "normal" && "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
            </div>
        </div>
    )
}

export function StopKpiPlanAnalytics() {
    const cityPlanPct = Math.round((STOP_EQUIPMENT_PLAN_TARGET / STOP_CITY_TOTAL) * 100)
    const readyPct = Math.round((STOP_EQUIPPED_COUNT / STOP_EQUIPMENT_PLAN_TARGET) * 100)
    const remainingStops = STOP_EQUIPMENT_PLAN_TARGET - STOP_EQUIPPED_COUNT
    const operationalPct = Math.round((STOP_OPERATIONAL_COUNT / STOP_EQUIPPED_COUNT) * 100)
    const planRows = [
        { label: "Городской реестр", value: STOP_CITY_TOTAL },
        { label: "План оснащения", value: STOP_EQUIPMENT_PLAN_TARGET },
        { label: "Оснащено сейчас", value: STOP_EQUIPPED_COUNT },
        { label: "Осталось", value: remainingStops },
    ]
    const districtRows = STOP_DISTRICT_COVERAGE_ESTIMATES.map((district) => ({
        ...district,
        remainingMin: Math.max(0, district.estimatedTotalMin - district.connectedStops),
    }))

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">Показатели остановок</h2>
                        <Badge variant="outline" className="gap-1">
                            <Target className="h-3 w-3" />
                            план оснащения
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Плановый контур оснащения остановок видеонаблюдением и контроль остатка до целевого объема.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="План оснащения"
                    value={integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)}
                    caption="остановок в целевом контуре"
                    detail={`${integerFormat.format(cityPlanPct)}% городского справочника`}
                    icon={Target}
                    tone="attention"
                />
                <KpiCard
                    title="Готово сейчас"
                    value={integerFormat.format(STOP_EQUIPPED_COUNT)}
                    caption="остановок уже подключено"
                    detail={`${integerFormat.format(readyPct)}% от планового объема`}
                    icon={CheckCircle2}
                    tone="success"
                />
                <KpiCard
                    title="Осталось"
                    value={integerFormat.format(remainingStops)}
                    caption="до полного планового контура"
                    detail="приоритет задается районным покрытием"
                    icon={MapPin}
                    tone="attention"
                />
                <KpiCard
                    title="Камер в системе"
                    value={integerFormat.format(STOP_LIVE_CAMERA_COUNT)}
                    caption="на оснащенных остановках"
                    detail={`${integerFormat.format(operationalPct)}% оснащенных остановок в строю`}
                    icon={Video}
                    tone="success"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <Card className="xl:col-span-5">
                    <CardHeader>
                        <CardTitle className="text-base">Статус выполнения плана</CardTitle>
                        <CardDescription>
                            Городской реестр, плановый объем и фактическая готовность
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ProgressRow
                            label="План от городского реестра"
                            value={`${integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)} из ${integerFormat.format(STOP_CITY_TOTAL)}`}
                            pct={cityPlanPct}
                            tone="attention"
                        />
                        <ProgressRow
                            label="Оснащено от плана"
                            value={`${integerFormat.format(STOP_EQUIPPED_COUNT)} из ${integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)}`}
                            pct={readyPct}
                            tone="success"
                        />
                        <ProgressRow
                            label="Исправность оснащенных"
                            value={`${integerFormat.format(STOP_OPERATIONAL_COUNT)} из ${integerFormat.format(STOP_EQUIPPED_COUNT)}`}
                            pct={operationalPct}
                            tone="success"
                        />
                    </CardContent>
                </Card>

                <Card className="xl:col-span-7">
                    <CardHeader>
                        <CardTitle className="text-base">Плановый объем</CardTitle>
                        <CardDescription>
                            Сравнение городского справочника, целевого контура и текущей готовности
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={planConfig} className="h-[290px] w-full">
                            <BarChart data={planRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="value" fill="var(--color-value)" radius={[5, 5, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Районная база плана</CardTitle>
                    <CardDescription>
                        Подключенные остановки и минимальный остаток до нижней оценки районного покрытия
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ChartContainer config={districtPlanConfig} className="h-[280px] w-full">
                        <BarChart
                            data={districtRows}
                            margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="districtName" tickLine={false} axisLine={false} tickMargin={8} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="connectedStops" stackId="plan" fill="var(--color-connectedStops)" radius={[5, 5, 0, 0]} />
                            <Bar dataKey="remainingMin" stackId="plan" fill="var(--color-remainingMin)" radius={[5, 5, 0, 0]} />
                        </BarChart>
                    </ChartContainer>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Район</TableHead>
                                <TableHead className="text-right">Подключено</TableHead>
                                <TableHead className="text-right">Всего примерно</TableHead>
                                <TableHead className="text-right">Покрытие</TableHead>
                                <TableHead>Подключенные остановки</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {districtRows.map((district) => (
                                <TableRow key={district.districtName}>
                                    <TableCell className="font-medium">{district.districtName}</TableCell>
                                    <TableCell className="text-right tabular-nums">{integerFormat.format(district.connectedStops)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{district.estimatedTotalLabel}</TableCell>
                                    <TableCell className="text-right tabular-nums">{district.coverageLabel}</TableCell>
                                    <TableCell className="text-muted-foreground">{district.connectedStopNames.join(", ")}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
