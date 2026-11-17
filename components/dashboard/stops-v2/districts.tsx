"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"
import { ArrowRight, Building2, Scale, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { V_DISTRICTS, V_STOPS, fmtNum, median } from "@/lib/mock/stop-analytics-vision-data"
import { districtRows, relativeTone, type DistrictRow } from "@/components/dashboard/stops-v2/selectors"
import { ChartCard, Insight, Legend, SectionShell, useScope, useVision } from "@/components/dashboard/stops-v2/kit"

const coverageConfig = {
    equipped: { label: "С оборудованием", color: "#2563eb" },
    missing: { label: "Без оборудования", color: "#cbd5e1" },
} satisfies ChartConfig

interface Metric {
    key: keyof Pick<DistrictRow, "availability" | "binHoursPerStop" | "safetyPerStop" | "climateHoursPerStop" | "avgLoad">
    header: string
    hint: string
    unit: string
    worseWhen: "higher" | "lower" | "none"
}

const METRICS: Metric[] = [
    { key: "availability", header: "Связь", hint: "Доступность оборудования", unit: " %", worseWhen: "lower" },
    { key: "binHoursPerStop", header: "Урны", hint: "Часов переполнения на остановку", unit: " ч", worseWhen: "higher" },
    { key: "safetyPerStop", header: "События", hint: "Событий безопасности на остановку", unit: "", worseWhen: "higher" },
    { key: "climateHoursPerStop", header: "Климат", hint: "Часов вне нормы на остановку", unit: " ч", worseWhen: "higher" },
    { key: "avgLoad", header: "Загруженность", hint: "Людей на остановке в среднем", unit: " чел.", worseWhen: "none" },
]

function cellTone(tone: "success" | "attention" | "high" | null) {
    return cn(
        "rounded-md px-2 py-1 tabular-nums",
        tone === "success" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "attention" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "high" && "bg-red-500/15 text-red-700 dark:text-red-300",
    )
}

export function StopsDistricts() {
    const scope = useScope()
    const { setDistrictId, setView } = useVision()
    const [selected, setSelected] = useState<string | null>(null)

    const data = useMemo(() => {
        const rows = districtRows(V_DISTRICTS, V_STOPS, scope.from, scope.to)
        const tones = new Map<string, number>()
        for (const row of rows) {
            let score = 0
            for (const metric of METRICS) {
                if (metric.worseWhen === "none") continue
                const tone = relativeTone(row[metric.key], rows.map((item) => item[metric.key]), metric.worseWhen)
                score += tone === "high" ? 2 : tone === "attention" ? 1 : 0
            }
            tones.set(row.id, score)
        }
        const worst = rows.slice().sort((a, b) => (tones.get(b.id) ?? 0) - (tones.get(a.id) ?? 0))[0]
        const leastCovered = rows.slice().sort((a, b) => a.coveragePct - b.coveragePct)[0]
        const medians = Object.fromEntries(METRICS.map((metric) => [metric.key, median(rows.map((row) => row[metric.key]))])) as Record<Metric["key"], number>
        return { rows, worst, leastCovered, medians }
    }, [scope.from, scope.to])

    const current = data.rows.find((row) => row.id === selected) ?? data.worst
    const worstMetric = METRICS.filter((metric) => metric.worseWhen !== "none")
        .map((metric) => ({ metric, tone: relativeTone(data.worst[metric.key], data.rows.map((row) => row[metric.key]), metric.worseWhen as "higher" | "lower") }))
        .find((item) => item.tone === "high")?.metric

    const openDistrict = (id: string) => {
        setDistrictId(id)
        setView("overview")
    }

    return (
        <SectionShell title="Микрорайоны" district={false} stop={false}>
            <Insight>
                Больше всего замечаний к микрорайону «{data.worst.name}»{worstMetric ? `: хуже города показатель «${worstMetric.hint.toLowerCase()}»` : ""}.
                {" "}Меньше всего оснащён «{data.leastCovered.name}»: {data.leastCovered.equipped} из {data.leastCovered.cityStops} остановок.
                {" "}Все показатели посчитаны на одну оснащённую остановку, поэтому районы с разным числом камер сравниваются честно.
            </Insight>

            <ChartCard
                title="Чем микрорайоны отличаются друг от друга?"
                icon={Table2}
                iconClassName="text-violet-500"
                hint="Цвет ячейки показывает отклонение от медианы по городу. Название открывает сводку по микрорайону."
                action={<Legend items={[{ label: "лучше или на уровне города", color: "#10b981" }, { label: "хуже", color: "#f59e0b" }, { label: "заметно хуже", color: "#ef4444" }]} />}
            >
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Микрорайон</TableHead>
                                <TableHead className="text-right">Оснащено</TableHead>
                                {METRICS.map((metric) => <TableHead key={metric.key} className="text-right" title={metric.hint}>{metric.header}</TableHead>)}
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <button type="button" className="text-left font-medium underline-offset-4 hover:underline" onClick={() => openDistrict(row.id)}>
                                            {row.name}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.equipped} из {row.cityStops}
                                        <span className="ml-2 text-muted-foreground">{fmtNum(row.coveragePct, 0)} %</span>
                                    </TableCell>
                                    {METRICS.map((metric) => {
                                        const tone = metric.worseWhen === "none" ? null : relativeTone(row[metric.key], data.rows.map((item) => item[metric.key]), metric.worseWhen)
                                        return (
                                            <TableCell key={metric.key} className="text-right">
                                                <span className={cellTone(tone)}>{fmtNum(row[metric.key])}{metric.unit}</span>
                                            </TableCell>
                                        )
                                    })}
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openDistrict(row.id)}>
                                            Открыть
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell className="font-medium text-muted-foreground">Медиана по городу</TableCell>
                                <TableCell />
                                {METRICS.map((metric) => (
                                    <TableCell key={metric.key} className="text-right tabular-nums text-muted-foreground">
                                        <span className="px-2">{fmtNum(data.medians[metric.key])}{metric.unit}</span>
                                    </TableCell>
                                ))}
                                <TableCell />
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </ChartCard>

            <div className="grid gap-6 xl:grid-cols-12">
                <ChartCard className="xl:col-span-6" title="Где не хватает оснащения?" icon={Building2} iconClassName="text-blue-500">
                    {/* Микрорайонов больше полусотни: на графике — 12, где больше всего неоснащённых остановок.
                        Столбец — все остановки микрорайона: синим оснащённые, серым без оборудования. */}
                    <Legend items={[{ label: "С оборудованием", color: "#2563eb" }, { label: "Без оборудования", color: "#cbd5e1" }]} />
                    <ChartContainer config={coverageConfig} className="mt-3 h-[360px] w-full">
                        <BarChart
                            data={data.rows
                                .map((row) => ({ ...row, missing: Math.max(0, row.cityStops - row.equipped) }))
                                .sort((a, b) => b.missing - a.missing || a.coveragePct - b.coveragePct)
                                .slice(0, 12)}
                            layout="vertical"
                            margin={{ left: 0, right: 72, top: 8, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} tickFormatter={(value) => `${value}`} />
                            <YAxis type="category" dataKey="name" width={190} tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 12 }} />
                            <ChartTooltip content={<ChartTooltipContent formatter={(_value, _name, item) => `${item.payload.equipped} из ${item.payload.cityStops} ост. оснащены · ${fmtNum(item.payload.coveragePct, 0)} %`} />} />
                            <Bar dataKey="equipped" stackId="stops" fill="var(--color-equipped)" maxBarSize={22} isAnimationActive={false} />
                            <Bar dataKey="missing" stackId="stops" fill="var(--color-missing)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                                <LabelList dataKey="coveragePct" position="right" className="fill-muted-foreground text-[11px]" formatter={(value: unknown) => `${fmtNum(Number(value), 0)} %`} />
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </ChartCard>

                <ChartCard
                    className="xl:col-span-6"
                    title="Как микрорайон выглядит на фоне города?"
                    icon={Scale}
                    iconClassName="text-emerald-500"
                    hint="Показатели микрорайона рядом с медианой по городу"
                    action={
                        <Select value={current.id} onValueChange={setSelected}>
                            <SelectTrigger className="w-[190px]" aria-label="Микрорайон для сравнения">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {data.rows.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    }
                >
                    <div className="space-y-4">
                        <Legend items={[{ label: current.name, color: "#2563eb" }, { label: "Медиана по городу", color: "#94a3b8" }]} />
                        {METRICS.map((metric) => {
                            const value = current[metric.key]
                            const mid = data.medians[metric.key]
                            // Доступность сравнивается по недостающим процентам: иначе столбцы 97 и 99 % неотличимы.
                            const shownValue = metric.key === "availability" ? 100 - value : value
                            const shownMid = metric.key === "availability" ? 100 - mid : mid
                            const max = Math.max(shownValue, shownMid, 0.0001)
                            const tone = metric.worseWhen === "none" ? null : relativeTone(value, data.rows.map((row) => row[metric.key]), metric.worseWhen)
                            return (
                                <div key={metric.key} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_5.5rem] items-center gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{metric.header}</div>
                                        <div className="truncate text-xs text-muted-foreground">{metric.key === "availability" ? "Недоступность оборудования" : metric.hint}</div>
                                    </div>
                                    <div className="space-y-[3px]">
                                        <div className="h-3 rounded-[3px] bg-[#2563eb]" style={{ width: `max(3px, ${(shownValue / max) * 100}%)` }} />
                                        <div className="h-3 rounded-[3px] bg-slate-400" style={{ width: `max(3px, ${(shownMid / max) * 100}%)` }} />
                                    </div>
                                    <div className="text-right text-sm tabular-nums">
                                        <div><span className={cellTone(tone)}>{fmtNum(shownValue)}{metric.unit}</span></div>
                                        <div className="px-2 text-xs text-muted-foreground">{fmtNum(shownMid)}{metric.unit}</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ChartCard>
            </div>
        </SectionShell>
    )
}
