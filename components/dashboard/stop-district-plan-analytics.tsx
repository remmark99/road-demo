"use client"

import {
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import {
    BarChart3,
    CheckCircle2,
    Map,
    MapPin,
    Target,
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
import { STOP_DISTRICT_COVERAGE_ESTIMATES } from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "success" | "attention"

const districtCoverageConfig = {
    coverageMidPct: { label: "Покрытие", color: "hsl(221, 83%, 53%)" },
} satisfies ChartConfig

const districtStopsConfig = {
    connectedStops: { label: "Подключено", color: "hsl(160, 84%, 39%)" },
    estimatedRemainingMin: { label: "Осталось минимум", color: "hsl(38, 92%, 50%)" },
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
    icon: typeof Map
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

export function StopDistrictPlanAnalytics() {
    const districtRows = STOP_DISTRICT_COVERAGE_ESTIMATES
        .map((district) => ({
            ...district,
            estimatedRemainingMin: Math.max(0, district.estimatedTotalMin - district.connectedStops),
        }))
        .sort((a, b) => a.coverageMidPct - b.coverageMidPct || a.districtName.localeCompare(b.districtName, "ru"))
    const districtCount = districtRows.length
    const connectedStops = districtRows.reduce((sum, district) => sum + district.connectedStops, 0)
    const estimatedMin = districtRows.reduce((sum, district) => sum + district.estimatedTotalMin, 0)
    const estimatedMax = districtRows.reduce((sum, district) => sum + district.estimatedTotalMax, 0)
    const estimatedLabel = estimatedMin === estimatedMax
        ? integerFormat.format(estimatedMin)
        : `${integerFormat.format(estimatedMin)}-${integerFormat.format(estimatedMax)}`
    const minCoverage = Math.floor((connectedStops / estimatedMax) * 100)
    const maxCoverage = Math.round((connectedStops / estimatedMin) * 100)
    const weakestDistrict = districtRows[0]

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">Районы</h2>
                        <Badge variant="outline" className="gap-1">
                            <Map className="h-3 w-3" />
                            план покрытия
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Районная оценка покрытия остановок видеонаблюдением и приоритеты дальнейшего оснащения.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="Районов в плане"
                    value={integerFormat.format(districtCount)}
                    caption="районная витрина остановок"
                    detail="по текущему контуру оснащения"
                    icon={Map}
                />
                <KpiCard
                    title="Подключено"
                    value={integerFormat.format(connectedStops)}
                    caption="остановок с видеонаблюдением"
                    detail={`${estimatedLabel} всего примерно`}
                    icon={CheckCircle2}
                    tone="success"
                />
                <KpiCard
                    title="Оценка покрытия"
                    value={`${minCoverage}-${maxCoverage}%`}
                    caption="по районам из текущего контура"
                    detail="диапазон от нижней и верхней оценки"
                    icon={BarChart3}
                    tone="attention"
                />
                <KpiCard
                    title="Главный приоритет"
                    value={weakestDistrict?.districtName ?? "Нет данных"}
                    caption="минимальная средняя оценка покрытия"
                    detail={weakestDistrict ? `${weakestDistrict.coverageLabel} сейчас` : "нет районной оценки"}
                    icon={Target}
                    tone="attention"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <Card className="xl:col-span-7">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3 className="h-5 w-5 text-blue-500" />
                            Покрытие по районам
                        </CardTitle>
                        <CardDescription>
                            Средняя точка диапазона покрытия; точные значения показаны в таблице
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={districtCoverageConfig} className="h-[320px] w-full">
                            <BarChart
                                data={districtRows}
                                layout="vertical"
                                margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis
                                    type="number"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    domain={[0, 100]}
                                    unit="%"
                                />
                                <YAxis
                                    type="category"
                                    dataKey="districtName"
                                    width={118}
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    interval={0}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="coverageMidPct" fill="var(--color-coverageMidPct)" radius={[0, 5, 5, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MapPin className="h-5 w-5 text-emerald-500" />
                            Остаток до нижней оценки
                        </CardTitle>
                        <CardDescription>
                            Сколько остановок нужно добавить минимум по каждому району
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={districtStopsConfig} className="h-[320px] w-full">
                            <BarChart
                                data={districtRows}
                                margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="districtName" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="connectedStops" stackId="district" fill="var(--color-connectedStops)" radius={[5, 5, 0, 0]} />
                                <Bar dataKey="estimatedRemainingMin" stackId="district" fill="var(--color-estimatedRemainingMin)" radius={[5, 5, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Районная таблица покрытия</CardTitle>
                    <CardDescription>
                        Подключенные остановки, примерный общий объем района и диапазон покрытия
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
