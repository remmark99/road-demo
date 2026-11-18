"use client"

import { useMemo, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, Copy, FileSpreadsheet, Loader2, Table2 } from "lucide-react"
import type { ChatTable } from "@/lib/assistant/table"
import { cellValue } from "@/lib/assistant/table"
import type { ReportCell } from "@/lib/reports/document"
import { cn } from "@/lib/utils"

/** Сколько строк видно в свёрнутой таблице. */
const COLLAPSED_ROWS = 6

/** Excel собирается прямо в браузере: библиотека грузится только по нажатию. */
export async function downloadTablesXlsx(tables: ChatTable[], title: string) {
    const { tablesToXlsx, xlsxFileName } = await import("@/lib/assistant/table")
    const bytes = tablesToXlsx(tables)
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
    const link = document.createElement("a")
    link.href = url
    link.download = xlsxFileName(title)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const DURATION_COLUMNS = /^(минут|простой, мин)$/i
/** Минуты показываем как «68 д 22 ч» — и заголовок по смыслу; в Excel остаются минуты. */
const DURATION_HEADERS: Record<string, string> = { "минут": "Длительность", "простой, мин": "Простой" }
const LOCAL_TIME = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}))?$/

function duration(minutes: number) {
    const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = Math.round(minutes % 60)
    if (days) return `${days} д ${hours} ч`
    if (hours) return `${hours} ч ${mins} мин`
    return `${mins} мин`
}

function sortKey(value: ReportCell): number | string {
    if (typeof value === "number") return value
    const time = LOCAL_TIME.exec(value)
    if (time) return Date.UTC(+time[3], +time[2] - 1, +time[1], +(time[4] ?? 0), +(time[5] ?? 0))
    return value === "—" ? "" : value.toLocaleLowerCase("ru")
}

const STATUS_TONES: [RegExp, string][] = [
    [/^(в сети|всё в норме|норма)$/i, "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400"],
    [/^(не в сети|нарушени|критич|плохо|два и больше)/i, "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400"],
    [/^(внимани|частично|предупрежд|одно нарушение)/i, "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400"],
    [/^(нет данных|неизвестно)$/i, "bg-muted text-muted-foreground ring-border"],
]

function Cell({ value, column }: { value: ReportCell; column: string }) {
    if (typeof value === "number") {
        if (DURATION_COLUMNS.test(column)) {
            return <span title={`${value.toLocaleString("ru-RU")} мин`} className="tabular-nums">{duration(value)}</span>
        }
        return <span className="tabular-nums">{value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}</span>
    }
    if (value === "—" || value === "") return <span className="text-muted-foreground/60">—</span>
    const tone = STATUS_TONES.find(([pattern]) => pattern.test(value))?.[1]
    if (tone && value.length <= 24) {
        return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{value}
        </span>
    }
    return <>{value}</>
}

function useCopy() {
    const [copied, setCopied] = useState(false)
    return {
        copied,
        copy: (text: string) => {
            void navigator.clipboard?.writeText(text).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
            })
        },
    }
}

export function ToolbarButton({ onClick, disabled, children, title, primary }: { onClick: () => void; disabled?: boolean; children: ReactNode; title?: string; primary?: boolean }) {
    return (
        <button
            type="button" onClick={onClick} disabled={disabled} title={title}
            className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-60",
                primary
                    ? "bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
        >
            {children}
        </button>
    )
}

function TableActions({ table }: { table: ChatTable }) {
    const { copied, copy } = useCopy()
    const [busy, setBusy] = useState(false)
    return (
        <div className="flex shrink-0 items-center gap-0.5">
            <ToolbarButton title="Скопировать для вставки в Excel или письмо" onClick={() => {
                void import("@/lib/assistant/table").then(({ tableToTsv }) => copy(tableToTsv(table)))
            }}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{copied ? "Скопировано" : "Копировать"}</span>
            </ToolbarButton>
            <ToolbarButton primary disabled={busy} title="Скачать таблицу в Excel" onClick={() => {
                setBusy(true)
                void downloadTablesXlsx([table], table.title).finally(() => setBusy(false))
            }}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                Excel
            </ToolbarButton>
        </div>
    )
}

type Sort = { column: number; dir: 1 | -1 } | null

/** Колонки, где во всех строках одно и то же («контроллер датчиков», «не в сети»): их выносим в подпись. */
function constantColumns(table: ChatTable) {
    if (table.rows.length < 3 || table.columns.length < 4) return new Set<number>()
    return new Set(table.columns.flatMap((_, c) => {
        const first = table.rows[0][c]
        return typeof first === "string" && first !== "—" && table.rows.every(row => row[c] === first) ? [c] : []
    }))
}

function displayText(value: ReportCell) {
    return typeof value === "number" ? value.toLocaleString("ru-RU") : value
}

/** Сама таблица: липкая шапка, сортировка по клику, статусы цветными метками, числа по правому краю. */
function TableView({ table, collapsible = true, hidden = new Set<number>() }: { table: ChatTable; collapsible?: boolean; hidden?: Set<number> }) {
    const [sort, setSort] = useState<Sort>(null)
    const [expanded, setExpanded] = useState(false)
    const numeric = useMemo(() => table.columns.map((_, c) => {
        const values = table.rows.map(row => row[c]).filter(value => value !== "—" && value !== "")
        return values.length > 0 && values.every(value => typeof value === "number")
    }), [table])
    const rows = useMemo(() => {
        if (!sort) return table.rows
        return [...table.rows].sort((a, b) => {
            const x = sortKey(a[sort.column] ?? ""), y = sortKey(b[sort.column] ?? "")
            if (x === "" && y !== "") return 1
            if (y === "" && x !== "") return -1
            const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ru", { numeric: true })
            return order * sort.dir
        })
    }, [table.rows, sort])
    const limited = collapsible && !expanded && rows.length > COLLAPSED_ROWS + 2
    const visible = limited ? rows.slice(0, COLLAPSED_ROWS) : rows
    // Длинный текст переносится, короткие значения, даты и числа — в одну строку.
    const wide = useMemo(() => table.columns.map((_, c) => table.rows.some(row => typeof row[c] === "string" && (row[c] as string).length > 26)), [table])
    const columns = table.columns.map((column, c) => ({ column, c })).filter(({ c }) => !hidden.has(c))
    const toggleSort = (column: number) => setSort(current =>
        current?.column !== column ? { column, dir: numeric[column] ? -1 : 1 } : current.dir === (numeric[column] ? -1 : 1) ? { column, dir: current.dir === 1 ? -1 : 1 } : null)

    return (
        <>
            <div className={cn("overflow-auto", expanded && "max-h-[480px]")}>
                <table className="w-full border-collapse text-[13px]">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                        <tr>
                            {columns.map(({ column, c }) => {
                                const active = sort?.column === c
                                const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
                                return (
                                    <th key={`${column}-${c}`} className={cn("whitespace-nowrap border-b px-3 py-2 font-medium text-muted-foreground", numeric[c] ? "text-right" : "text-left")}>
                                        <button type="button" onClick={() => toggleSort(c)}
                                            className={cn("group inline-flex items-center gap-1 hover:text-foreground", numeric[c] && "flex-row-reverse", active && "text-foreground")}>
                                            {DURATION_HEADERS[column.toLowerCase()] ?? column}
                                            <Icon className={cn("h-3 w-3 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-60")} />
                                        </button>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((row, r) => (
                            <tr key={r} className="border-b border-border/50 transition-colors last:border-0 even:bg-muted/25 hover:bg-muted/50">
                                {columns.map(({ column, c }) => (
                                    <td key={c} className={cn("px-3 py-2 align-top", numeric[c] ? "text-right" : "text-left",
                                        wide[c] ? "min-w-[200px]" : "whitespace-nowrap", /^(остановка|микрорайон)$/i.test(column) && "font-medium")}>
                                        <Cell value={row[c] ?? "—"} column={column} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {collapsible && rows.length > COLLAPSED_ROWS + 2 && (
                <button type="button" onClick={() => setExpanded(value => !value)}
                    className="flex w-full items-center justify-center gap-1.5 border-t bg-muted/20 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
                    {expanded ? "Свернуть" : `Показать все ${rows.length.toLocaleString("ru-RU")}`}
                </button>
            )}
        </>
    )
}

function rowsLabel(count: number) {
    const n = count % 100, d = count % 10
    const word = n >= 11 && n <= 14 ? "строк" : d === 1 ? "строка" : d >= 2 && d <= 4 ? "строки" : "строк"
    return `${count.toLocaleString("ru-RU")} ${word}`
}

/** Таблица данных под ответом: то, что ассистент получил из базы. */
export function DataTableCard({ table }: { table: ChatTable }) {
    const hidden = useMemo(() => constantColumns(table), [table])
    const common = [...hidden].map(c => `${table.columns[c]}: ${displayText(table.rows[0][c])}`)
    return (
        <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Table2 className="h-3.5 w-3.5" /></div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-tight">{table.title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{[rowsLabel(table.rows.length), ...common, table.note].filter(Boolean).join(" · ")}</div>
                    </div>
                </div>
                <TableActions table={table} />
            </div>
            <TableView table={table} hidden={hidden} />
        </div>
    )
}

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] }

function hastText(node: HastNode): string {
    if (node.type === "text") return node.value ?? ""
    if (node.tagName === "br") return " "
    return (node.children ?? []).map(hastText).join("")
}

function hastRows(node: HastNode, tag: "th" | "td" | "any"): string[][] {
    const rows: string[][] = []
    const walk = (n: HastNode) => {
        if (n.tagName === "tr") {
            const cells = (n.children ?? []).filter(c => c.tagName === "th" || c.tagName === "td")
            if (tag === "any" || cells.some(c => c.tagName === tag)) rows.push(cells.map(c => hastText(c).trim()))
            return
        }
        n.children?.forEach(walk)
    }
    walk(node)
    return rows
}

/** Таблица из Markdown ответа модели → та же таблица с сортировкой и Excel. */
export function tableFromHast(node: HastNode | undefined, title: string): ChatTable | null {
    if (!node) return null
    const all = hastRows(node, "any")
    const [header, ...body] = all
    if (!header?.length) return null
    return { title, columns: header, rows: body.map(row => header.map((_, c) => cellValue(row[c] ?? ""))) }
}

export function MarkdownTable({ table }: { table: ChatTable }) {
    return (
        <div className="not-prose my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-end border-b bg-muted/20 px-2 py-1">
                <TableActions table={table} />
            </div>
            <TableView table={table} collapsible={table.rows.length > 12} />
        </div>
    )
}
