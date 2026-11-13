"use client"

import { useState } from "react"
import { CircleAlert, FileBarChart2, FileSpreadsheet, FileText, FileType2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { displayTime, type ReportDocument, type ReportFormat } from "@/lib/reports/document"
import { cn } from "@/lib/utils"

const FORMATS: { format: ReportFormat; label: string; icon: typeof FileText }[] = [
    { format: "pdf", label: "PDF", icon: FileText },
    { format: "xlsx", label: "Excel", icon: FileSpreadsheet },
    { format: "docx", label: "Word", icon: FileType2 },
]

function fileName(disposition: string | null, format: ReportFormat) {
    const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    if (encoded) {
        try { return decodeURIComponent(encoded) } catch { /* запасное имя ниже */ }
    }
    return `Отчёт.${format}`
}

/** Файл отчёта: сервер собирает PDF, Excel или Word из уже готового отчёта. */
export async function downloadReport(report: ReportDocument, format: ReportFormat) {
    const response = await fetch("/api/assistant/reports/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, report }),
    })
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? "Не удалось скачать отчёт")
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement("a")
    link.href = url
    link.download = fileName(response.headers.get("Content-Disposition"), format)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function ReportDownloadButtons({ report, className }: { report: ReportDocument; className?: string }) {
    const [busy, setBusy] = useState<ReportFormat | null>(null)
    const [error, setError] = useState("")
    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {FORMATS.map(({ format, label, icon: Icon }) => (
                <Button
                    key={format}
                    type="button"
                    size="sm"
                    variant={format === "pdf" ? "default" : "outline"}
                    className="gap-1.5"
                    disabled={busy !== null}
                    onClick={async () => {
                        setBusy(format)
                        setError("")
                        try {
                            await downloadReport(report, format)
                        } catch (downloadError) {
                            setError(downloadError instanceof Error ? downloadError.message : "Не удалось скачать отчёт")
                        } finally {
                            setBusy(null)
                        }
                    }}
                >
                    {busy === format ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                    {label}
                </Button>
            ))}
            {error && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <CircleAlert className="h-3.5 w-3.5" />
                    {error}
                </span>
            )}
        </div>
    )
}

/** Карточка отчёта в чате: заголовок, главные цифры и выводы, кнопки скачивания. */
export function ReportCard({ report }: { report: ReportDocument }) {
    const headings = report.sections.map(section => section.heading).filter(Boolean)
    return (
        <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-start gap-3 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <FileBarChart2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <div className="font-semibold leading-snug">{report.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                        {report.subtitle ? `${report.subtitle} · ` : ""}сформирован {displayTime(report.generatedAt)}
                    </div>
                </div>
            </div>
            {report.metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2 px-4 pt-3 sm:grid-cols-3">
                    {report.metrics.slice(0, 6).map(metric => (
                        <div key={metric.label} className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                            <div className="text-lg font-semibold tabular-nums text-primary">{metric.value}</div>
                            <div className="text-xs leading-snug text-muted-foreground">{metric.label}</div>
                        </div>
                    ))}
                </div>
            )}
            {report.summary.length > 0 && (
                <ul className="space-y-1.5 px-4 pt-3 text-sm">
                    {report.summary.map(item => (
                        <li key={item} className="flex gap-2">
                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            )}
            {headings.length > 0 && (
                <div className="px-4 pt-2 text-xs text-muted-foreground">
                    Разделы: {headings.map((heading, index) => `${index + 1}. ${heading}`).join(" · ")}
                </div>
            )}
            <ReportDownloadButtons report={report} className="px-4 py-3" />
        </div>
    )
}
