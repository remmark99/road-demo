"use client"

import { useMemo, useState } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    XAxis,
    YAxis,
} from "recharts"
import { CloudRain, ListFilter, Umbrella, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    ROAD_CONTRACTORS,
    ROAD_PRECIPITATION_CATEGORIES,
    ROAD_SEASONS,
    getRoadSeasonLabel,
    roadPrecipitationContractorRows,
    roadPrecipitationRows,
    type RoadContractorId,
    type PrecipitationCategoryId,
    type RoadSeasonFilter,
} from "@/lib/mock/road-analytics-mock-data"

const precipitationConfig = {
    incidents: { label: "Количество инцидентов", color: "hsl(210, 89%, 54%)" },
} satisfies ChartConfig

const precipitationColors = [
    "hsl(160, 72%, 38%)",
    "hsl(210, 89%, 54%)",
    "hsl(35, 92%, 52%)",
    "hsl(0, 84%, 60%)",
]

const weatherComparisonConfig = ROAD_PRECIPITATION_CATEGORIES.reduce((acc, category, index) => {
    acc[category.id] = { label: category.label, color: precipitationColors[index] }
    return acc
}, {} as ChartConfig)

type ContractorWeatherRow = {
    contractorId: RoadContractorId
    contractorName: string
    contractorShortName: string
} & Record<string, number | string>

function WeatherOverdueTooltip({
    active,
    payload,
}: {
    active?: boolean
    payload?: Array<{
        color?: string
        dataKey?: string | number
        value?: number | string
        payload?: ContractorWeatherRow
    }>
}) {
    const row = payload?.[0]?.payload

    if (!active || !row || !payload?.length) return null

    return (
        <div className="min-w-64 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
            <div className="font-semibold">{row.contractorName}</div>
            <div className="mt-1 text-muted-foreground">Погодные просрочки и устойчивость по уровню осадков</div>
            <div className="mt-3 grid gap-2">
                {payload.map((item) => {
                    const categoryId = String(item.dataKey) as PrecipitationCategoryId
                    const category = ROAD_PRECIPITATION_CATEGORIES.find((candidate) => candidate.id === categoryId)
                    const resilience = row[`${categoryId}Resilience`]

                    if (!category || typeof item.value !== "number" || typeof resilience !== "number") return null

                    return (
                        <div key={categoryId} className="grid gap-1">
                            <div className="flex items-center justify-between gap-4">
                                <span className="inline-flex items-center gap-2 font-medium">
                                    <span
                                        className="h-2.5 w-2.5 rounded-sm"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    {category.label}
                                </span>
                                <span className="font-mono text-foreground">{item.value}</span>
                            </div>
                            <div className="text-muted-foreground">
                                устойчивость: <span className="font-mono text-foreground">{resilience}%</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function getSelectedContractorsLabel(selectedContractors: RoadContractorId[]) {
    if (selectedContractors.length === ROAD_CONTRACTORS.length) return "Все подрядчики"
    if (selectedContractors.length === 0) return "Не выбрано"
    if (selectedContractors.length === 1) {
        return ROAD_CONTRACTORS.find((contractor) => contractor.id === selectedContractors[0])?.shortName ?? "1 подрядчик"
    }
    return `${selectedContractors.length} из ${ROAD_CONTRACTORS.length}`
}

export function RoadPrecipitationAnalytics() {
    const [season, setSeason] = useState<RoadSeasonFilter>("all")
    const [selectedContractors, setSelectedContractors] = useState<RoadContractorId[]>(
        ROAD_CONTRACTORS.map((contractor) => contractor.id)
    )
    const visibleContractors = useMemo(() => {
        return ROAD_CONTRACTORS.filter((item) => selectedContractors.includes(item.id))
    }, [selectedContractors])

    const precipitationRows = useMemo(() => {
        return ROAD_PRECIPITATION_CATEGORIES.map((category) => {
            const rows = roadPrecipitationRows.filter((row) => (
                row.categoryId === category.id &&
                (season === "all" || row.season === season)
            ))

            return {
                categoryId: category.id,
                label: category.label,
                description: category.description,
                incidents: rows.reduce((sum, row) => sum + row.incidents, 0),
            }
        })
    }, [season])

    const weatherRows = useMemo<ContractorWeatherRow[]>(() => {
        return visibleContractors.map((contractor) => {
            const result: ContractorWeatherRow = {
                contractorId: contractor.id,
                contractorName: contractor.name,
                contractorShortName: contractor.shortName,
            }

            for (const category of ROAD_PRECIPITATION_CATEGORIES) {
                const rows = roadPrecipitationContractorRows.filter((row) => (
                    row.categoryId === category.id &&
                    row.contractorId === contractor.id &&
                    (season === "all" || row.season === season)
                ))
                const avgResilience = rows.length === 0
                    ? 0
                    : Math.round(rows.reduce((sum, row) => sum + row.resiliencePct, 0) / rows.length)

                result[category.id] = rows.reduce((sum, row) => sum + row.weatherOverdue, 0)
                result[`${category.id}Resilience`] = avgResilience
            }

            return result
        }).sort((left, right) => {
            const leftOverdue = ROAD_PRECIPITATION_CATEGORIES.reduce((sum, category) => sum + Number(left[category.id] ?? 0), 0)
            const rightOverdue = ROAD_PRECIPITATION_CATEGORIES.reduce((sum, category) => sum + Number(right[category.id] ?? 0), 0)
            return rightOverdue - leftOverdue
        })
    }, [season, visibleContractors])

    const toggleContractor = (contractorId: RoadContractorId) => {
        setSelectedContractors((current) =>
            current.includes(contractorId)
                ? current.filter((item) => item !== contractorId)
                : [...current, contractorId]
        )
    }

    const toggleAllContractors = () => {
        setSelectedContractors((current) =>
            current.length === ROAD_CONTRACTORS.length
                ? []
                : ROAD_CONTRACTORS.map((item) => item.id)
        )
    }

    const totals = useMemo(() => {
        const incidentCount = precipitationRows.reduce((sum, row) => sum + row.incidents, 0)
        const weatherOverdue = weatherRows.reduce((sum, row) => (
            sum + ROAD_PRECIPITATION_CATEGORIES.reduce((categorySum, category) => categorySum + Number(row[category.id] ?? 0), 0)
        ), 0)
        const hardestCategory = precipitationRows.slice().sort((left, right) => right.incidents - left.incidents)[0]
        const weakest = weatherRows.flatMap((row) => (
            ROAD_PRECIPITATION_CATEGORIES.map((category) => ({
                contractorName: String(row.contractorName),
                contractorShortName: String(row.contractorShortName),
                category: category.label,
                resiliencePct: Number(row[`${category.id}Resilience`] ?? 0),
                weatherOverdue: Number(row[category.id] ?? 0),
            }))
        )).sort((left, right) => left.resiliencePct - right.resiliencePct || right.weatherOverdue - left.weatherOverdue)[0]

        return {
            incidentCount,
            weatherOverdue,
            hardestCategory,
            weakest,
        }
    }, [precipitationRows, weatherRows])

    const selectedContractorsLabel = getSelectedContractorsLabel(selectedContractors)

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <ListFilter className="h-4 w-4 text-muted-foreground" />
                <Select value={season} onValueChange={(value) => setSeason(value as RoadSeasonFilter)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Сезон" />
                    </SelectTrigger>
                    <SelectContent>
                        {ROAD_SEASONS.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Users className="h-4 w-4" />
                            {selectedContractorsLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="precipitation-all-contractors"
                                    checked={selectedContractors.length === ROAD_CONTRACTORS.length}
                                    onCheckedChange={toggleAllContractors}
                                />
                                <Label htmlFor="precipitation-all-contractors" className="font-medium">
                                    Все подрядчики
                                </Label>
                            </div>
                            <div className="border-t pt-2 space-y-2">
                                {ROAD_CONTRACTORS.map((item) => (
                                    <div key={item.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`precipitation-contractor-${item.id}`}
                                            checked={selectedContractors.includes(item.id)}
                                            onCheckedChange={() => toggleContractor(item.id)}
                                        />
                                        <Label htmlFor={`precipitation-contractor-${item.id}`} className="text-sm">
                                            {item.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CloudRain className="h-4 w-4 text-sky-500" />
                            Инциденты при осадках
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.incidentCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Umbrella className="h-4 w-4 text-amber-500" />
                            Просрочки из-за погоды
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.weatherOverdue}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4 text-primary" />
                            Активный разрез
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                            {selectedContractorsLabel}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-5">
                <Card className="xl:col-span-2">
                    <CardHeader>
                        <CardTitle>Инциденты по уровню осадков</CardTitle>
                        <CardDescription>
                            Ось X - 4 категории осадков, ось Y - количество дорожных инцидентов.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={precipitationConfig} className="h-[340px] w-full">
                            <BarChart data={precipitationRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} />
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            formatter={(value) => [`${value}`, "Инцидентов"]}
                                        />
                                    }
                                />
                                <Bar dataKey="incidents" radius={[6, 6, 0, 0]}>
                                    {precipitationRows.map((row, index) => (
                                        <Cell key={row.categoryId} fill={precipitationColors[index]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            {precipitationRows.map((row) => (
                                <div key={row.categoryId} className="rounded-lg border bg-muted/20 px-3 py-2">
                                    <span className="font-medium text-foreground">{row.label}</span> - {row.description}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-3">
                    <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <CardTitle>Устойчивость подрядчиков к осадкам</CardTitle>
                                <CardDescription>
                                    Сравнение по 4 уровням осадков: выше процент - меньше погодных срывов регламента.
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-background">
                                {getRoadSeasonLabel(season)}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {weatherRows.length > 0 ? (
                            <ChartContainer config={weatherComparisonConfig} className="h-[380px] w-full">
                                <BarChart data={weatherRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="contractorShortName" tickLine={false} axisLine={false} tickMargin={8} />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                        label={{ value: "Просрочки", angle: -90, position: "insideLeft" }}
                                    />
                                    <ChartTooltip content={<WeatherOverdueTooltip />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    {ROAD_PRECIPITATION_CATEGORIES.map((category) => (
                                        <Bar
                                            key={category.id}
                                            dataKey={category.id}
                                            fill={`var(--color-${category.id})`}
                                            radius={[5, 5, 0, 0]}
                                            maxBarSize={34}
                                        />
                                    ))}
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-[380px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
                                Выберите хотя бы одного подрядчика, чтобы сравнить погодные просрочки.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {totals.hardestCategory && (
                <Card className="border-amber-500/20 bg-amber-500/[0.06]">
                    <CardContent className="grid gap-3 p-5 text-sm md:grid-cols-2">
                        <div>
                            Максимальная нагрузка в выбранном разрезе приходится на категорию{" "}
                            <span className="font-semibold">{totals.hardestCategory.label.toLowerCase()}</span>:{" "}
                            <span className="font-mono">{totals.hardestCategory.incidents}</span> инцидентов.
                        </div>
                        {totals.weakest && (
                            <div>
                                Самая слабая устойчивость:{" "}
                                <span className="font-semibold">{totals.weakest.contractorShortName}</span>,{" "}
                                {totals.weakest.category.toLowerCase()} -{" "}
                                <span className="font-mono">{totals.weakest.resiliencePct}%</span>, просрочек{" "}
                                <span className="font-mono">{totals.weakest.weatherOverdue}</span>.
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
