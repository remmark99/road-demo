"use client"

import { useMemo, useState } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
} from "recharts"
import { Building2, Camera, ListFilter, Map, ShieldAlert } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { roadCityDistrictRows } from "@/lib/mock/road-analytics-mock-data"

type SortMode = "risk" | "incidents" | "coverage"

const districtLoadConfig = {
    openIncidents: { label: "Открытые инциденты", color: "hsl(35, 92%, 52%)" },
    overdueIncidents: { label: "Просрочено", color: "hsl(0, 84%, 60%)" },
} satisfies ChartConfig

const districtCoverageConfig = {
    cameras: { label: "Камеры", color: "hsl(210, 89%, 54%)" },
    onlinePct: { label: "Онлайн, %", color: "hsl(160, 72%, 38%)" },
} satisfies ChartConfig

const riskConfig = {
    winterRiskPct: { label: "Зимний риск", color: "hsl(262, 83%, 58%)" },
    servicedKm: { label: "Км дорог", color: "hsl(190, 91%, 41%)" },
} satisfies ChartConfig

function getSortLabel(sortMode: SortMode) {
    if (sortMode === "risk") return "По зимнему риску"
    if (sortMode === "coverage") return "По онлайн-покрытию"
    return "По инцидентам"
}

export function RoadCityAnalytics() {
    const [sortMode, setSortMode] = useState<SortMode>("risk")
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>(
        roadCityDistrictRows.map((row) => row.districtName)
    )

    const toggleDistrict = (districtName: string) => {
        setSelectedDistricts((current) =>
            current.includes(districtName)
                ? current.filter((item) => item !== districtName)
                : [...current, districtName]
        )
    }

    const toggleAll = () => {
        setSelectedDistricts((current) =>
            current.length === roadCityDistrictRows.length
                ? []
                : roadCityDistrictRows.map((row) => row.districtName)
        )
    }

    const filteredRows = useMemo(() => {
        const rows = roadCityDistrictRows.filter((row) => selectedDistricts.includes(row.districtName))

        return rows.sort((left, right) => {
            if (sortMode === "coverage") {
                return right.onlinePct - left.onlinePct || right.cameras - left.cameras
            }
            if (sortMode === "incidents") {
                return right.openIncidents - left.openIncidents
            }
            return right.winterRiskPct - left.winterRiskPct
        })
    }, [selectedDistricts, sortMode])

    const chartRows = filteredRows.slice(0, 10)
    const totals = useMemo(() => {
        const intersections = filteredRows.reduce((sum, row) => sum + row.intersections, 0)
        const cameras = filteredRows.reduce((sum, row) => sum + row.cameras, 0)
        const openIncidents = filteredRows.reduce((sum, row) => sum + row.openIncidents, 0)
        const overdueIncidents = filteredRows.reduce((sum, row) => sum + row.overdueIncidents, 0)
        const avgOnline =
            filteredRows.length === 0
                ? 0
                : Math.round(filteredRows.reduce((sum, row) => sum + row.onlinePct, 0) / filteredRows.length)

        return {
            intersections,
            cameras,
            openIncidents,
            overdueIncidents,
            avgOnline,
        }
    }, [filteredRows])

    const selectedLabel =
        selectedDistricts.length === roadCityDistrictRows.length
            ? "Все микрорайоны"
            : selectedDistricts.length === 0
                ? "Не выбрано"
                : `${selectedDistricts.length} из ${roadCityDistrictRows.length}`

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <ListFilter className="h-4 w-4 text-muted-foreground" />
                <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                    <SelectTrigger className="w-[210px]">
                        <SelectValue placeholder="Сортировка" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="risk">По зимнему риску</SelectItem>
                        <SelectItem value="incidents">По инцидентам</SelectItem>
                        <SelectItem value="coverage">По онлайн-покрытию</SelectItem>
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Map className="h-4 w-4" />
                            {selectedLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="road-city-all-districts"
                                    checked={selectedDistricts.length === roadCityDistrictRows.length}
                                    onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="road-city-all-districts" className="font-medium">
                                    Все микрорайоны
                                </Label>
                            </div>
                            <div className="max-h-72 space-y-2 overflow-auto border-t pt-2">
                                {roadCityDistrictRows.map((row) => (
                                    <div key={row.districtName} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`road-city-${row.districtName}`}
                                            checked={selectedDistricts.includes(row.districtName)}
                                            onCheckedChange={() => toggleDistrict(row.districtName)}
                                        />
                                        <Label htmlFor={`road-city-${row.districtName}`} className="text-sm">
                                            {row.districtName}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                <Badge variant="outline" className="bg-background">
                    {getSortLabel(sortMode)}
                </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="h-4 w-4 text-primary" />
                            Микрорайоны
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{filteredRows.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Camera className="h-4 w-4 text-sky-500" />
                            Камеры
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.cameras}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                            Открытые инциденты
                        </div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.openIncidents}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="text-sm text-muted-foreground">Средний онлайн</div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{totals.avgOnline}%</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Инциденты по микрорайонам</CardTitle>
                        <CardDescription>
                            Открытые и просроченные дорожные события в выбранном городском разрезе.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={districtLoadConfig} className="h-[340px] w-full">
                            <BarChart data={chartRows} layout="vertical" margin={{ left: 18, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} />
                                <YAxis
                                    type="category"
                                    dataKey="districtName"
                                    tickLine={false}
                                    axisLine={false}
                                    width={120}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="openIncidents" fill="var(--color-openIncidents)" radius={[0, 6, 6, 0]} />
                                <Bar dataKey="overdueIncidents" fill="var(--color-overdueIncidents)" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Камеры и доступность сигнала</CardTitle>
                        <CardDescription>
                            Количество камер и средняя доля онлайн-сигнала по микрорайонам.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={districtCoverageConfig} className="h-[340px] w-full">
                            <ComposedChart data={chartRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="districtName" tickLine={false} axisLine={false} minTickGap={18} />
                                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar yAxisId="left" dataKey="cameras" fill="var(--color-cameras)" radius={[6, 6, 0, 0]} />
                                <Line yAxisId="right" type="monotone" dataKey="onlinePct" stroke="var(--color-onlinePct)" strokeWidth={2} dot={{ r: 3 }} />
                            </ComposedChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Зимний риск и протяженность дорог</CardTitle>
                    <CardDescription>
                        Сопоставление зоны ответственности и риска накопления зимних инцидентов.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={riskConfig} className="h-[320px] w-full">
                        <ComposedChart data={chartRows} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="districtName" tickLine={false} axisLine={false} minTickGap={18} />
                            <YAxis yAxisId="left" tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickFormatter={(value) => `${value} км`} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar yAxisId="left" dataKey="winterRiskPct" fill="var(--color-winterRiskPct)" radius={[6, 6, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="servicedKm" stroke="var(--color-servicedKm)" strokeWidth={2} dot={{ r: 3 }} />
                        </ComposedChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Микрорайоны: операционная таблица</CardTitle>
                    <CardDescription>
                        Табличный дубль графиков для сравнения значений без наведения.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Микрорайон</TableHead>
                                <TableHead className="text-right">Км дорог</TableHead>
                                <TableHead className="text-right">Перекрестки</TableHead>
                                <TableHead className="text-right">Камеры</TableHead>
                                <TableHead className="text-right">Онлайн</TableHead>
                                <TableHead className="text-right">Открыто</TableHead>
                                <TableHead className="text-right">Просрочено</TableHead>
                                <TableHead className="text-right">Реакция</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRows.map((row) => (
                                <TableRow key={row.districtName}>
                                    <TableCell className="font-medium">{row.districtName}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.servicedKm}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.intersections}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.cameras}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.onlinePct}%</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.openIncidents}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.overdueIncidents}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.avgReactionMinutes} мин</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
