"use client"

import { useMemo, useState } from "react"
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { BarChart3, Table2 } from "lucide-react"
import { chartNumber, type ReportChart } from "@/lib/reports/chart"
import { cn } from "@/lib/utils"

/** Цвета серий — CSS-переменные .chart-view (globals.css): свои шаги для светлой и тёмной темы. */
const seriesColor = (index: number) => `var(--series-${(index % 8) + 1})`
const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" }
const TOOLTIP = {
    contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--popover-foreground))" },
    labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 2 },
    cursor: { fill: "hsl(var(--muted) / 0.4)" },
}

const short = (label: string, max: number) => label.length > max ? `${label.slice(0, max - 1)}…` : label

function colorFor(chart: ReportChart, seriesIndex: number, labelIndex: number) {
    const byLabel = chart.labelColors?.[labelIndex]
    if (chart.type === "pie" || chart.type === "donut") return byLabel ?? seriesColor(labelIndex)
    if (chart.series.length === 1 && byLabel) return byLabel
    return seriesColor(seriesIndex)
}

function DataTable({ chart }: { chart: ReportChart }) {
    return (
        <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                        <th className="px-2 py-1.5 text-left font-medium" />
                        {chart.series.map(s => <th key={s.name} className="px-2 py-1.5 text-right font-medium">{s.name}{chart.unit ? `, ${chart.unit}` : ""}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {chart.labels.map((label, i) => (
                        <tr key={`${label}-${i}`} className="border-t border-border/60">
                            <td className="px-2 py-1">{label}</td>
                            {chart.series.map(s => <td key={s.name} className="px-2 py-1 text-right tabular-nums">{chartNumber(s.values[i])}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function Plot({ chart }: { chart: ReportChart }) {
    const rows = useMemo(() => chart.labels.map((label, i) => {
        const row: Record<string, string | number | null> = { label }
        chart.series.forEach((s, k) => { row[`s${k}`] = s.values[i] })
        return row
    }), [chart])
    const format = (value: unknown) => `${chartNumber(typeof value === "number" ? value : null)}${chart.unit ? ` ${chart.unit}` : ""}`
    const legend = chart.series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} /> : null
    const grid = <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />

    if (chart.type === "pie" || chart.type === "donut") {
        const values = chart.series[0].values.map(v => v ?? 0)
        const total = values.reduce((a, b) => a + b, 0)
        const slices = chart.labels.map((label, i) => ({ label, value: values[i] })).filter(slice => slice.value > 0)
        return (
            <div className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="relative h-56 w-full sm:w-1/2">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={chart.type === "donut" ? "58%" : 0} outerRadius="88%" paddingAngle={slices.length > 1 ? 1.5 : 0} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
                                {slices.map(slice => <Cell key={slice.label} fill={colorFor(chart, 0, chart.labels.indexOf(slice.label))} />)}
                            </Pie>
                            <Tooltip {...TOOLTIP} formatter={(value: unknown) => format(value)} />
                        </PieChart>
                    </ResponsiveContainer>
                    {chart.type === "donut" && (
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-semibold tabular-nums">{chartNumber(total)}</span>
                            {chart.unit && <span className="text-xs text-muted-foreground">{chart.unit}</span>}
                        </div>
                    )}
                </div>
                <ul className="w-full space-y-1.5 text-sm sm:w-1/2">
                    {chart.labels.map((label, i) => values[i] > 0 && (
                        <li key={label} className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(chart, 0, i) }} />
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            <span className="tabular-nums">{chartNumber(values[i])}</span>
                            <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{total ? `${Math.round(100 * values[i] / total)}%` : ""}</span>
                        </li>
                    ))}
                </ul>
            </div>
        )
    }

    if (chart.type === "hbar") {
        const height = Math.max(180, chart.labels.length * (chart.series.length > 1 ? 40 : 30) + 40)
        return (
            <div style={{ height }}>
                <ResponsiveContainer>
                    <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="22%">
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => chartNumber(v)} />
                        <YAxis type="category" dataKey="label" width={170} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => short(String(v), 28)} interval={0} />
                        <Tooltip {...TOOLTIP} formatter={(value: unknown) => format(value)} />
                        {legend}
                        {chart.series.map((s, k) => (
                            <Bar key={s.name} dataKey={`s${k}`} name={s.name} fill={seriesColor(k)} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                                {chart.series.length === 1 && chart.labelColors && rows.map((_, i) => <Cell key={i} fill={colorFor(chart, k, i)} />)}
                            </Bar>
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )
    }

    const xAxis = <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={8} tickFormatter={v => short(String(v), 14)} />
    const yAxis = <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} tickFormatter={v => chartNumber(v)} />
    return (
        <div className="h-64">
            <ResponsiveContainer>
                {chart.type === "line" ? (
                    <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                        {grid}{xAxis}{yAxis}
                        <Tooltip {...TOOLTIP} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }} formatter={(value: unknown) => format(value)} />
                        {legend}
                        {chart.series.map((s, k) => <Line key={s.name} type="monotone" dataKey={`s${k}`} name={s.name} stroke={seriesColor(k)} strokeWidth={2} dot={chart.labels.length <= 31 ? { r: 3, strokeWidth: 0, fill: seriesColor(k) } : false} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />)}
                    </LineChart>
                ) : chart.type === "area" ? (
                    <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                        {grid}{xAxis}{yAxis}
                        <Tooltip {...TOOLTIP} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }} formatter={(value: unknown) => format(value)} />
                        {legend}
                        {chart.series.map((s, k) => <Area key={s.name} type="monotone" dataKey={`s${k}`} name={s.name} stroke={seriesColor(k)} strokeWidth={2} fill={seriesColor(k)} fillOpacity={0.15} connectNulls isAnimationActive={false} />)}
                    </AreaChart>
                ) : (
                    <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
                        {grid}{xAxis}{yAxis}
                        <Tooltip {...TOOLTIP} formatter={(value: unknown) => format(value)} />
                        {legend}
                        {chart.series.map((s, k) => (
                            <Bar key={s.name} dataKey={`s${k}`} name={s.name} fill={seriesColor(k)} stackId={chart.type === "stacked" ? "stack" : undefined}
                                radius={chart.type !== "stacked" || k === chart.series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={40} isAnimationActive={false}>
                                {chart.series.length === 1 && chart.labelColors && rows.map((_, i) => <Cell key={i} fill={colorFor(chart, k, i)} />)}
                            </Bar>
                        ))}
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    )
}

/** График в чате: заголовок, сам график и та же таблица по кнопке. */
export function ChartCard({ chart }: { chart: ReportChart }) {
    const [asTable, setAsTable] = useState(false)
    return (
        <div className="chart-view my-3 rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="font-semibold leading-snug">{chart.title}</div>
                    {(chart.unit || chart.note) && <div className="mt-0.5 text-xs text-muted-foreground">{[chart.unit, chart.note].filter(Boolean).join(" · ")}</div>}
                </div>
                <button
                    type="button"
                    onClick={() => setAsTable(value => !value)}
                    className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground")}
                >
                    {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                    {asTable ? "График" : "Таблица"}
                </button>
            </div>
            {asTable ? <DataTable chart={chart} /> : <Plot chart={chart} />}
        </div>
    )
}
