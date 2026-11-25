"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type ChatTransport, type UIMessage } from "ai"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import {
    AlertTriangle, ArrowUp, AudioLines, Check, CircleAlert, Copy, CornerDownRight, Database, FileSpreadsheet, Loader2, Mic, PanelLeft, PanelLeftClose, Search, Snowflake, Square, SquarePen, Volume2, X,
    Trash2, WifiOff, Sparkles, FileBarChart2, LineChart as LineChartIcon, Lock, PenLine,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChartCard } from "@/components/assistant/chart-view"
import { DataTableCard, MarkdownTable, ToolbarButton, downloadTablesXlsx, tableFromHast } from "@/components/assistant/data-table"
import { OverviewCard } from "@/components/assistant/overview-card"
import { ReportCard } from "@/components/assistant/report-card"
import { UsageMeter } from "@/components/assistant/usage-meter"
import { followUps, isOverviewSummary, type OverviewSummary } from "@/lib/assistant/overview"
import type { ChatTable } from "@/lib/assistant/table"
import { budgetExhausted, exhaustedMessage, formatTokens, type AssistantMessageMetadata, type AssistantUsageSummary } from "@/lib/assistant/usage-shared"
import { VECTOR_TOOL_TITLES } from "@/lib/mcp/vector/titles"
import type { ReportChart } from "@/lib/reports/chart"
import type { ReportDocument } from "@/lib/reports/document"
import { startRecording, type RecordingHandle } from "@/lib/speech/recorder"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
    { icon: Sparkles, text: "Сводка по остановкам на сейчас" },
    { icon: WifiOff, text: "Что сейчас не в сети и сколько уже?" },
    { icon: Snowflake, text: "Где в павильонах холоднее всего?" },
    { icon: Trash2, text: "Какие урны переполнены прямо сейчас?" },
    { icon: FileSpreadsheet, text: "Выгрузи в Excel всё оборудование, которое сейчас не в сети" },
    { icon: LineChartIcon, text: "Нарисуй график событий безопасности по дням за неделю" },
    { icon: FileBarChart2, text: "Сделай отчёт о состоянии павильонов за неделю" },
    { icon: PenLine, text: "Напиши поручение подрядчику по уборке" },
] as const

type ToolPart = { type: string; toolName?: string; state?: string; toolCallId?: string; output?: unknown }

/** Отчёт из вывода create_report (в том числе из сохранённой истории). */
function reportOf(part: ToolPart): ReportDocument | null {
    if (toolName(part) !== "create_report" || part.state !== "output-available") return null
    const report = (part.output as { report?: ReportDocument } | null)?.report
    return report && typeof report.title === "string" && Array.isArray(report.sections) ? report : null
}

/** График из вывода create_chart. */
function chartOf(part: ToolPart): ReportChart | null {
    if (toolName(part) !== "create_chart" || part.state !== "output-available") return null
    const chart = (part.output as { chart?: ReportChart | null } | null)?.chart
    return chart && Array.isArray(chart.labels) && Array.isArray(chart.series) ? chart : null
}

/** Таблица данных из вывода инструмента (сервер кладёт её рядом с текстом для модели). */
function tableOf(part: ToolPart): ChatTable | null {
    if (part.state !== "output-available" || !part.output || typeof part.output !== "object") return null
    const table = (part.output as { table?: ChatTable | null }).table
    return table && Array.isArray(table.columns) && Array.isArray(table.rows) && table.rows.length ? table : null
}

/** Карточка сводки из вывода system_overview. */
function overviewOf(part: ToolPart): OverviewSummary | null {
    if (part.state !== "output-available" || !part.output || typeof part.output !== "object") return null
    const overview = (part.output as { overview?: unknown }).overview
    return isOverviewSummary(overview) ? overview : null
}

function toolFailed(part: ToolPart) {
    if (part.state === "output-error") return true
    if (part.state !== "output-available" || !part.output) return false
    if (toolName(part) === "create_report") return !reportOf(part)
    if (toolName(part) === "create_chart") return Boolean((part.output as { error?: string }).error)
    const text = (part.output as { text?: unknown }).text
    return typeof text === "string" && text.startsWith("Ошибка")
}

function toolName(part: ToolPart) {
    return part.type === "dynamic-tool" ? part.toolName ?? "" : part.type.slice("tool-".length)
}

function isToolPart(part: { type: string }): part is ToolPart {
    return part.type.startsWith("tool-") || part.type === "dynamic-tool"
}

function messageText(message: UIMessage) {
    return message.parts.filter(part => part.type === "text").map(part => (part as { text: string }).text).join("")
}

/** Какие данные ассистент взял: одна строка источников, пока грузится — со спиннером. */
function ToolSteps({ parts: all }: { parts: ToolPart[] }) {
    // Неудачную попытку, которую модель потом повторила успешно, не показываем: ответ от неё не пострадал.
    const parts = all.filter((part, index) => !toolFailed(part)
        || !all.slice(index + 1).some(later => toolName(later) === toolName(part) && !toolFailed(later)))
    if (!parts.length) return null
    const pending = parts.some(part => part.state !== "output-available" && part.state !== "output-error")
    return (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium">
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                {pending ? "Смотрю данные:" : "Данные:"}
            </span>
            {parts.map((part, index) => {
                const done = part.state === "output-available"
                const failed = toolFailed(part)
                return (
                    <span
                        key={part.toolCallId ?? index}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ring-inset",
                            failed ? "bg-destructive/5 text-destructive ring-destructive/25"
                                : done ? "bg-muted/60 ring-border/60" : "animate-pulse bg-muted ring-border",
                        )}
                    >
                        {failed ? <CircleAlert className="h-3 w-3" /> : done ? <Check className="h-3 w-3 text-emerald-500" /> : null}
                        {VECTOR_TOOL_TITLES[toolName(part)] ?? "Запрос данных"}
                    </span>
                )
            })}
        </div>
    )
}

function AssistantAvatar({ className }: { className?: string }) {
    return (
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground", className)}>
            <Sparkles className="h-3.5 w-3.5" />
        </div>
    )
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <ToolbarButton onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
            })
        }}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Скопировано" : "Копировать"}
        </ToolbarButton>
    )
}

function ExcelAllButton({ tables, title }: { tables: ChatTable[]; title: string }) {
    const [busy, setBusy] = useState(false)
    return (
        <ToolbarButton primary disabled={busy} title="Все таблицы ответа — по листу на таблицу" onClick={() => {
            setBusy(true)
            void downloadTablesXlsx(tables, title).finally(() => setBusy(false))
        }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            {tables.length > 1 ? `Все таблицы в Excel (${tables.length})` : "Excel"}
        </ToolbarButton>
    )
}

const MARKDOWN = "markdown-content text-[15px] leading-7 text-foreground/90 [&_a]:text-primary [&_a]:underline [&_li]:my-1 [&_li]:pl-0.5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_li::marker]:text-muted-foreground/60 [&_p]:my-2 first:[&_p]:mt-0 [&_strong]:font-semibold [&_strong]:text-foreground [&_h1]:mb-1 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[13px] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"

interface SpeechControls {
    enabled: boolean
    speakingId: string | null
    loadingId: string | null
    toggle: (id: string, text: string) => void
}

function ListenButton({ id, text, speech }: { id: string; text: string; speech: SpeechControls }) {
    const playing = speech.speakingId === id, loading = speech.loadingId === id
    return (
        <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => speech.toggle(id, text)}
        >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
            {playing ? "Остановить" : "Слушать"}
        </button>
    )
}

/** Таблицы из Markdown ответа — для общей кнопки Excel. */
function markdownTables(text: string): ChatTable[] {
    const tables: ChatTable[] = []
    const lines = text.split("\n")
    for (let i = 0; i + 1 < lines.length; i++) {
        if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue
        const split = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.replace(/\*\*/g, "").trim())
        const columns = split(lines[i])
        const rows: string[][] = []
        let j = i + 2
        for (; j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]); j++) rows.push(split(lines[j]))
        const heading = lines.slice(0, i).reverse().find(line => /^#{1,4}\s/.test(line))?.replace(/^#+\s*/, "")
        tables.push({ title: heading || `Таблица ${tables.length + 1}`, columns, rows: rows.map(row => columns.map((_, c) => row[c] ?? "")) })
        i = j
    }
    return tables
}

/** Компоненты Markdown — постоянные, иначе таблицы теряли бы сортировку при каждом рендере. */
const REMARK_PLUGINS = [remarkGfm]
const MARKDOWN_COMPONENTS: Components = {
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ node, ...props }) => {
        const table = tableFromHast(node as never, "Таблица из ответа")
        return table ? <MarkdownTable table={table} /> : <div className="overflow-x-auto"><table {...props} /></div>
    },
}

/** Что спросить дальше: кнопки под последним ответом. */
function FollowUps({ questions, onAsk }: { questions: string[]; onAsk: (question: string) => void }) {
    if (!questions.length) return null
    return (
        <div className="mt-3 flex flex-wrap gap-1.5">
            {questions.map(question => (
                <button key={question} type="button" onClick={() => onAsk(question)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] leading-snug text-foreground/80 transition-colors hover:border-foreground/25 hover:bg-muted/60 hover:text-foreground">
                    <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {question}
                </button>
            ))}
        </div>
    )
}

/** Таблицу просили прямо — показываем её раскрытой; иначе она свёрнута под ответом. */
const WANTS_TABLE = /выгруз|excel|эксел|таблиц|списо?к|перечен|перечисл/i

interface AssistantMessageProps {
    message: UIMessage
    streaming: boolean
    speech: SpeechControls
    /** Вопрос, на который это ответ, — чтобы не предлагать его же. */
    asked?: string
    /** Задать следующий вопрос: плитки сводки и кнопки под последним ответом. */
    onAsk?: (question: string) => void
    /** Последний ответ диалога: под ним — что спросить дальше. */
    last?: boolean
}

function AssistantMessage({ message, streaming, speech, asked = "", onAsk, last = false }: AssistantMessageProps) {
    const tools = message.parts.filter(isToolPart)
    const overviews = tools.map(overviewOf).filter((overview): overview is OverviewSummary => overview !== null)
    const nextQuestions = last && !streaming && onAsk ? followUps(tools.filter(part => !toolFailed(part)).map(toolName), asked) : []
    const reports = tools.map(reportOf).filter((report): report is ReportDocument => report !== null)
    const charts = tools.map(chartOf).filter((chart): chart is ReportChart => chart !== null)
    const dataTables = tools.map(tableOf).filter((table): table is ChatTable => table !== null)
    const text = messageText(message)
    // В отчёте свои таблицы и цифры: под ним остаются только его графики и карточка с файлами.
    const reportCharts = reports.flatMap(report => report.sections.flatMap(section => section.chart ? [section.chart] : []))
    // Таблицы данных — только когда их просили; иначе ответ — слова и графики, а данные скачиваются кнопкой Excel.
    const showTables = WANTS_TABLE.test(asked) && !reports.length
    const tokens = (message.metadata as AssistantMessageMetadata | undefined)?.tokens
    const allTables = streaming ? [] : [...markdownTables(text), ...dataTables]
    return (
        <div className="group/message flex gap-3">
            <AssistantAvatar className="mt-0.5" />
            <div className="min-w-0 flex-1">
                <ToolSteps parts={tools} />
                {charts.map((chart, index) => <ChartCard key={`${chart.title}-${index}`} chart={chart} />)}
                {text ? (
                    <div className={MARKDOWN}>
                        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
                    </div>
                ) : streaming ? (
                    <div className="flex h-7 items-center gap-1" aria-label="Ассистент думает">
                        {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: `${i * 150}ms` }} />)}
                        {tools.length > 0 && <span className="ml-2 text-[13px] text-muted-foreground">Собираю данные и готовлю ответ…</span>}
                    </div>
                ) : null}
                {!streaming && !reports.length && overviews.slice(-1).map(overview => <OverviewCard key={overview.asOf} overview={overview} onAsk={onAsk} />)}
                {showTables && dataTables.map((table, index) => <DataTableCard key={`${table.title}-${index}`} table={table} defaultOpen />)}
                {reportCharts.map((chart, index) => <ChartCard key={`report-${chart.title}-${index}`} chart={chart} />)}
                {reports.map((report, index) => <ReportCard key={`${report.generatedAt}-${index}`} report={report} withSummary={!text} />)}
                {text && !streaming && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
                        <CopyButton text={text} />
                        {allTables.length > (showTables || !dataTables.length ? 1 : 0) && <ExcelAllButton tables={allTables} title={allTables[0].title} />}
                        {speech.enabled && <ListenButton id={message.id} text={text} speech={speech} />}
                        {typeof tokens === "number" && tokens > 0 && (
                            <span className="ml-auto pl-2 text-[11px] tabular-nums text-muted-foreground/70 opacity-0 transition-opacity group-hover/message:opacity-100" title="Токены модели на этот ответ: вопрос, данные и сам ответ">
                                {formatTokens(tokens)} токенов
                            </span>
                        )}
                    </div>
                )}
                {onAsk && <FollowUps questions={nextQuestions} onAsk={onAsk} />}
            </div>
        </div>
    )
}

/** Откуда окно чата берёт ответы, историю и бюджет: сайт или прототип на условных данных. */
export interface AssistantBackend {
    transport: ChatTransport<UIMessage>
    listConversations: () => Promise<ConversationSummary[]>
    loadConversation: (id: string) => Promise<UIMessage[]>
    deleteConversation: (id: string) => Promise<void>
    speechEnabled: () => Promise<boolean>
    usage: () => Promise<AssistantUsageSummary | null>
    saveLimit: (limitTokens: number) => Promise<AssistantUsageSummary>
}

async function json<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => null) as (T & { error?: string }) | null
    if (!response.ok || !body) throw new Error(body?.error || "Сервер не ответил")
    return body
}

function httpBackend(): AssistantBackend {
    return {
        transport: new DefaultChatTransport({ api: "/api/chat", body: { mode: "stops" } }),
        listConversations: async () => (await json<{ conversations: ConversationSummary[] }>(await fetch("/api/assistant/conversations", { cache: "no-store" }))).conversations,
        loadConversation: async id => {
            const body = await json<{ messages: UIMessage[] }>(await fetch(`/api/assistant/conversations/${id}`, { cache: "no-store" }))
            return Array.isArray(body.messages) ? body.messages : []
        },
        deleteConversation: async id => { await json(await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" })) },
        speechEnabled: async () => {
            const response = await fetch("/api/assistant/speech").catch(() => null)
            return Boolean(response?.ok && (await response.json() as { enabled?: boolean }).enabled)
        },
        usage: async () => {
            const response = await fetch("/api/assistant/usage", { cache: "no-store" }).catch(() => null)
            return response?.ok ? await response.json() as AssistantUsageSummary : null
        },
        saveLimit: async limitTokens => json<AssistantUsageSummary>(await fetch("/api/assistant/usage", {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limitTokens }),
        })),
    }
}

interface ChatPanelProps {
    backend: AssistantBackend
    conversationId: string
    initialMessages: UIMessage[]
    usage: AssistantUsageSummary | null
    onSaveLimit: (limitTokens: number) => Promise<void>
    onNewChat: () => void
    onAnswered: () => void
    onToggleHistory: () => void
    /** История свёрнута на широком экране — кнопка её открытия видна и там. */
    historyHidden: boolean
    notice?: ReactNode
}

function ChatPanel({ backend, conversationId, initialMessages, usage, onSaveLimit, onNewChat, onAnswered, onToggleHistory, historyHidden, notice }: ChatPanelProps) {
    const transport = backend.transport
    // Ответ дописан: если вопрос был голосом, его озвучит обработчик ниже (через ref, он объявлен позже).
    const onAnswerRef = useRef<(message: UIMessage) => void>(() => {})
    // id диалога уходит на сервер вместе с сообщениями: по нему ответ сохраняется в историю.
    const { messages, sendMessage, status, stop, error, regenerate } = useChat({
        id: conversationId,
        messages: initialMessages,
        transport,
        onFinish: ({ message }) => { onAnswerRef.current(message); onAnswered() },
    })
    const [input, setInput] = useState("")
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const busy = status === "submitted" || status === "streaming"

    useEffect(() => {
        const node = scrollRef.current
        if (node) node.scrollTo({ top: node.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" })
    }, [messages, status])

    useEffect(() => {
        const node = inputRef.current
        if (!node) return
        node.style.height = "auto"
        node.style.height = `${Math.min(node.scrollHeight, 200)}px`
    }, [input])

    const exhausted = usage !== null && budgetExhausted(usage)
    const share = usage && usage.limitTokens > 0 ? usage.spentTokens / usage.limitTokens : 0

    const send = (text: string) => {
        const question = text.trim()
        if (!question || busy || exhausted) return
        void sendMessage({ text: question })
        setInput("")
        inputRef.current?.focus()
    }

    // ── Голос: SaluteSpeech через сервер. Без ключа в окружении кнопки не показываются. ──
    const [speechEnabled, setSpeechEnabled] = useState(false)
    const [listening, setListening] = useState<"idle" | "recording" | "transcribing">("idle")
    const [level, setLevel] = useState(0)
    const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
    const [conversation, setConversation] = useState(false)
    const [speakingId, setSpeakingId] = useState<string | null>(null)
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const recordingRef = useRef<RecordingHandle | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const answerByVoiceRef = useRef(false)
    const conversationRef = useRef(false)
    const listenRef = useRef<() => void>(() => {})
    const finishRef = useRef<() => void>(() => {})

    useEffect(() => {
        let cancelled = false
        backend.speechEnabled().then(enabled => { if (!cancelled) setSpeechEnabled(enabled) }).catch(() => {})
        return () => { cancelled = true }
    }, [backend])

    const stopAudio = useCallback(() => {
        audioRef.current?.pause()
        if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src)
        audioRef.current = null
        setSpeakingId(null)
    }, [])

    const speak = useCallback(async (id: string, text: string) => {
        stopAudio()
        setLoadingId(id)
        try {
            const response = await fetch("/api/assistant/speech/synthesize", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
            })
            if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Не удалось озвучить ответ")
            const audio = new Audio(URL.createObjectURL(await response.blob()))
            audioRef.current = audio
            audio.onended = () => {
                stopAudio()
                // Режим разговора: после ответа снова слушаем.
                if (conversationRef.current) listenRef.current()
            }
            setSpeakingId(id)
            await audio.play()
        } catch (error) {
            setVoiceNotice((error as Error).message)
            stopAudio()
        } finally {
            setLoadingId(null)
        }
    }, [stopAudio])

    const finishListening = useCallback(async () => {
        const handle = recordingRef.current
        if (!handle) return
        recordingRef.current = null
        setListening("transcribing")
        setLevel(0)
        try {
            const pcm = await handle.stop()
            if (!pcm.byteLength) { setVoiceNotice("Не расслышал. Попробуйте ещё раз."); return }
            const response = await fetch("/api/assistant/speech/recognize", {
                method: "POST", headers: { "Content-Type": "audio/x-pcm;bit=16;rate=16000" }, body: pcm,
            })
            const body = await response.json().catch(() => null) as { text?: string; error?: string } | null
            if (!response.ok) throw new Error(body?.error || "Не удалось распознать речь")
            if (!body?.text) { setVoiceNotice("Не расслышал. Попробуйте ещё раз."); return }
            answerByVoiceRef.current = true
            send(body.text)
        } catch (error) {
            setVoiceNotice((error as Error).message)
        } finally {
            setListening("idle")
        }
    // send меняется каждый рендер; вызываем актуальный через ref ниже
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busy])

    const startListening = useCallback(async () => {
        if (recordingRef.current || busy) return
        stopAudio()
        setVoiceNotice(null)
        try {
            recordingRef.current = await startRecording({ onLevel: setLevel, onAutoStop: () => finishRef.current() })
            setListening("recording")
        } catch {
            setVoiceNotice("Нет доступа к микрофону. Разрешите его в настройках браузера.")
            setConversation(false)
        }
    }, [busy, stopAudio])

    useEffect(() => { listenRef.current = () => { void startListening() } }, [startListening])
    useEffect(() => { finishRef.current = () => { void finishListening() } }, [finishListening])
    useEffect(() => { conversationRef.current = conversation }, [conversation])
    useEffect(() => () => { recordingRef.current?.cancel(); stopAudio() }, [stopAudio])

    // Вопрос задан голосом — ответ тоже голосом, когда он допишется.
    useEffect(() => {
        onAnswerRef.current = (answer) => {
            if (!answerByVoiceRef.current || answer.role !== "assistant") return
            answerByVoiceRef.current = false
            const text = messageText(answer)
            if (text) void speak(answer.id, text)
        }
    }, [speak])

    const speech: SpeechControls = {
        enabled: speechEnabled, speakingId, loadingId,
        toggle: (id, text) => { if (speakingId === id) stopAudio(); else void speak(id, text) },
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            send(input)
        }
    }

    const last = messages.at(-1)
    const waitingForFirstToken = status === "submitted" && last?.role === "user"

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 md:px-4">
                <div className="flex items-center">
                    <Button variant="ghost" size="icon" className={cn("h-8 w-8 text-muted-foreground", !historyHidden && "md:hidden")} onClick={onToggleHistory} aria-label="История диалогов" title="История диалогов">
                        <PanelLeft className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex items-center gap-1.5">
                    <UsageMeter summary={usage} onSaveLimit={onSaveLimit} />
                    {speechEnabled && (
                        <Button
                            variant={conversation ? "default" : "ghost"} size="sm" className="gap-1.5"
                            title="Разговор голосом: после ответа микрофон включается сам"
                            onClick={() => {
                                const next = !conversation
                                setConversation(next)
                                if (next && listening === "idle" && !busy && !speakingId) void startListening()
                                if (!next) { recordingRef.current?.cancel(); recordingRef.current = null; setListening("idle"); stopAudio() }
                            }}
                        >
                            <AudioLines className="h-3.5 w-3.5" /><span className="hidden sm:inline">{conversation ? "Разговор включён" : "Разговор"}</span>
                        </Button>
                    )}
                    {messages.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Новый диалог" aria-label="Новый диалог" onClick={() => { stop(); stopAudio(); onNewChat() }}>
                            <SquarePen className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="relative mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-10">
                        <div className="relative mb-8 text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">Чем помочь?</h1>
                        </div>
                        <div className="relative grid gap-2 sm:grid-cols-2">
                            {SUGGESTIONS.map(({ icon: Icon, text }) => (
                                <button key={text} type="button" onClick={() => send(text)} disabled={exhausted}
                                    className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50">
                                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="leading-snug">{text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto max-w-3xl space-y-7 px-4 py-6">
                        {messages.map((message, index) => message.role === "user" ? (
                            <div key={message.id} className="flex justify-end">
                                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-relaxed">{messageText(message)}</div>
                            </div>
                        ) : (
                            <AssistantMessage key={message.id} message={message} streaming={busy && index === messages.length - 1} speech={speech}
                                asked={index > 0 && messages[index - 1].role === "user" ? messageText(messages[index - 1]) : ""}
                                onAsk={busy || exhausted ? undefined : send} last={index === messages.length - 1} />
                        ))}
                        {waitingForFirstToken && <AssistantMessage message={{ id: "pending", role: "assistant", parts: [] }} streaming speech={speech} />}
                        {error && !busy && (
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                                <span className="text-destructive">Не удалось получить ответ. Проверьте связь и попробуйте ещё раз.</span>
                                <Button size="sm" variant="outline" onClick={() => void regenerate()}>Повторить</Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-gradient-to-t from-background via-background to-background/0 px-4 pb-4 pt-2 md:px-6">
                <form className="mx-auto max-w-3xl" onSubmit={event => { event.preventDefault(); send(input) }}>
                    {notice}
                    {usage && (exhausted || share >= 0.9) && (
                        <div className={cn("mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                            exhausted ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400")}>
                            {exhausted ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                            <span>{exhausted ? exhaustedMessage(usage) : `Израсходовано ${Math.round(share * 100)} % месячного лимита — осталось ${formatTokens(Math.max(0, usage.limitTokens - usage.spentTokens))} токенов.`}</span>
                        </div>
                    )}
                    <div className={cn("flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-colors focus-within:border-foreground/25",
                        exhausted && "opacity-60")}>
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={event => setInput(event.target.value)}
                            onKeyDown={onKeyDown}
                            rows={1}
                            placeholder={exhausted ? "Месячный лимит исчерпан" : "Спросите про остановки…"}
                            disabled={exhausted}
                            aria-label="Вопрос ассистенту"
                            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
                        />
                        {speechEnabled && (
                            <Button
                                type="button" size="icon" variant={listening === "recording" ? "destructive" : "ghost"}
                                className="relative h-10 w-10 shrink-0 rounded-xl"
                                disabled={busy || listening === "transcribing"}
                                onClick={() => listening === "recording" ? void finishListening() : void startListening()}
                                aria-label={listening === "recording" ? "Закончить запись" : "Спросить голосом"}
                                title={listening === "recording" ? "Закончить запись" : "Спросить голосом"}
                            >
                                {listening === "recording" && (
                                    <span className="pointer-events-none absolute inset-0 rounded-xl bg-destructive/40" style={{ transform: `scale(${1 + Math.min(level * 6, 0.45)})`, transition: "transform 80ms linear" }} />
                                )}
                                {listening === "transcribing" ? <Loader2 className="relative h-4 w-4 animate-spin" /> : <Mic className="relative h-4 w-4" />}
                            </Button>
                        )}
                        {busy ? (
                            <Button type="button" size="icon" variant="secondary" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => stop()} aria-label="Остановить">
                                <Square className="h-4 w-4 fill-current" />
                            </Button>
                        ) : (
                            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-xl shadow-sm" disabled={!input.trim() || exhausted} aria-label="Отправить">
                                <ArrowUp className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    {(voiceNotice || listening !== "idle") && (
                        <p role="status" className={cn("mt-2 text-center text-xs", voiceNotice ? "text-destructive" : "text-muted-foreground")}>
                            {voiceNotice ?? (listening === "recording" ? "Говорите — запись остановится после паузы" : "Распознаю…")}
                        </p>
                    )}
                    <p className="mt-2 text-center text-[11px] text-muted-foreground/80">Ассистент может ошибаться — важное проверяйте на сайте.</p>
                </form>
            </div>
        </div>
    )
}

interface ConversationSummary { id: string; title: string; updated_at: string }

const DAY_MS = 86_400_000

function dayGroup(iso: string, now: number) {
    const day = (ms: number) => new Date(ms + 5 * 3_600_000).toISOString().slice(0, 10) // по Сургуту
    const today = day(now), value = day(Date.parse(iso))
    if (value === today) return "Сегодня"
    if (value === day(now - DAY_MS)) return "Вчера"
    if (now - Date.parse(iso) < 7 * DAY_MS) return "Последние 7 дней"
    return "Ранее"
}

function HistorySidebar({ items, error, activeId, onOpen, onDelete, onNew, onClose, closeLabel, className }: {
    items: ConversationSummary[] | null
    error: boolean
    activeId: string
    onOpen: (id: string) => void
    onDelete: (id: string) => void
    onNew: () => void
    onClose: () => void
    closeLabel: "collapse" | "close"
    className?: string
}) {
    const [now] = useState(() => Date.now())
    const [query, setQuery] = useState("")
    const groups = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase("ru")
        const result: { label: string; items: ConversationSummary[] }[] = []
        for (const item of items ?? []) {
            if (needle && !item.title.toLocaleLowerCase("ru").includes(needle)) continue
            const label = dayGroup(item.updated_at, now)
            const group = result.at(-1)?.label === label ? result.at(-1)! : (result.push({ label, items: [] }), result.at(-1)!)
            group.items.push(item)
        }
        return result
    }, [items, now, query])
    const CloseIcon = closeLabel === "collapse" ? PanelLeftClose : X
    return (
        <aside className={cn("flex h-full w-64 shrink-0 flex-col border-r bg-muted/20", className)}>
            <div className="flex items-center gap-1 p-2">
                <button type="button" onClick={onNew}
                    className="flex h-9 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-muted">
                    <SquarePen className="h-4 w-4 text-muted-foreground" />Новый диалог
                </button>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={onClose}
                    aria-label={closeLabel === "collapse" ? "Свернуть историю" : "Закрыть историю"} title={closeLabel === "collapse" ? "Свернуть историю" : "Закрыть"}>
                    <CloseIcon className="h-4 w-4" />
                </Button>
            </div>
            {(items?.length ?? 0) > 5 && (
                <div className="relative mx-2 mb-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск" aria-label="Поиск по истории"
                        className="h-8 w-full rounded-lg bg-muted/60 pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus:bg-muted" />
                </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {error ? (
                    <p className="px-2.5 py-3 text-xs text-muted-foreground">История сейчас недоступна.</p>
                ) : items === null ? (
                    <div className="space-y-1.5 px-1 py-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-7 animate-pulse rounded-lg bg-muted/70" />)}</div>
                ) : items.length === 0 ? (
                    <p className="px-2.5 py-3 text-xs text-muted-foreground">Здесь появятся ваши диалоги.</p>
                ) : groups.length === 0 ? (
                    <p className="px-2.5 py-3 text-xs text-muted-foreground">Ничего не нашлось.</p>
                ) : groups.map(group => (
                    <div key={group.label} className="pt-3">
                        <div className="px-2.5 pb-1 text-xs text-muted-foreground">{group.label}</div>
                        {group.items.map(item => (
                            <div key={item.id} className={cn("group relative flex items-center rounded-lg transition-colors",
                                item.id === activeId ? "bg-muted text-foreground" : "text-foreground/75 hover:bg-muted/60 hover:text-foreground")}>
                                <button type="button" className="h-8 min-w-0 flex-1 truncate px-2.5 text-left text-[13px]" title={item.title} onClick={() => onOpen(item.id)}>
                                    {item.title}
                                </button>
                                <button
                                    type="button"
                                    className="absolute right-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                                    onClick={() => onDelete(item.id)}
                                    aria-label={`Удалить диалог «${item.title}»`}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </aside>
    )
}

export interface AssistantChatProps {
    /** По умолчанию — API сайта; прототип подставляет свои условные данные. */
    backend?: AssistantBackend
    initialSession?: { id: string; messages: UIMessage[] }
    /** Плашка над полем ввода (например, «прототип на условных данных»). */
    notice?: ReactNode
}

export function AssistantChat({ backend: customBackend, initialSession, notice }: AssistantChatProps = {}) {
    const backend = useMemo(() => customBackend ?? httpBackend(), [customBackend])
    const [session, setSession] = useState<{ id: string; messages: UIMessage[] }>(() => initialSession ?? { id: crypto.randomUUID(), messages: [] })
    const [items, setItems] = useState<ConversationSummary[] | null>(null)
    const [historyError, setHistoryError] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [historyCollapsed, setHistoryCollapsed] = useState(false)
    const [usage, setUsage] = useState<AssistantUsageSummary | null>(null)

    const refresh = useCallback(async () => {
        try {
            setItems(await backend.listConversations())
            setHistoryError(false)
        } catch {
            setHistoryError(true)
        }
    }, [backend])

    const refreshUsage = useCallback(async () => {
        const next = await backend.usage().catch(() => null)
        if (next) setUsage(next)
    }, [backend])

    useEffect(() => {
        let cancelled = false
        backend.listConversations()
            .then(list => { if (!cancelled) setItems(list) })
            .catch(() => { if (!cancelled) setHistoryError(true) })
        backend.usage().then(next => { if (!cancelled && next) setUsage(next) }).catch(() => {})
        return () => { cancelled = true }
    }, [backend])

    const newChat = useCallback(() => { setSession({ id: crypto.randomUUID(), messages: [] }); setHistoryOpen(false) }, [])

    const open = useCallback(async (id: string) => {
        setHistoryOpen(false)
        if (id === session.id) return
        try {
            setSession({ id, messages: await backend.loadConversation(id) })
        } catch {
            setHistoryError(true)
        }
    }, [backend, session.id])

    const remove = useCallback(async (id: string) => {
        if (!window.confirm("Удалить этот диалог из истории?")) return
        try {
            await backend.deleteConversation(id)
        } catch {
            setHistoryError(true)
            return
        }
        setItems(current => current?.filter(item => item.id !== id) ?? current)
        if (id === session.id) newChat()
    }, [backend, newChat, session.id])

    // Сервер сохраняет диалог и расход в конце потока; список и бюджет перечитываем чуть позже.
    const onAnswered = useCallback(() => { setTimeout(() => { void refresh(); void refreshUsage() }, 1200) }, [refresh, refreshUsage])

    const saveLimit = useCallback(async (limitTokens: number) => { setUsage(await backend.saveLimit(limitTokens)) }, [backend])

    const sidebar = (extra: { onClose: () => void; closeLabel: "collapse" | "close"; className: string }) => (
        <HistorySidebar items={items} error={historyError} activeId={session.id} onOpen={id => void open(id)} onDelete={id => void remove(id)} onNew={newChat} {...extra} />
    )
    // Узкий экран: история выезжает поверх чата. Широкий: колонка, которую можно свернуть.
    const toggleHistory = () => {
        if (window.matchMedia("(min-width: 768px)").matches) setHistoryCollapsed(value => !value)
        else setHistoryOpen(value => !value)
    }

    return (
        <div className="relative flex h-full min-h-0">
            {!historyCollapsed && sidebar({ onClose: () => setHistoryCollapsed(true), closeLabel: "collapse", className: "hidden md:flex" })}
            {historyOpen && (
                <div className="absolute inset-0 z-30 flex md:hidden">
                    {sidebar({ onClose: () => setHistoryOpen(false), closeLabel: "close", className: "bg-background shadow-xl" })}
                    <button type="button" aria-label="Закрыть историю" className="flex-1 bg-black/30" onClick={() => setHistoryOpen(false)} />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <ChatPanel key={session.id} backend={backend} conversationId={session.id} initialMessages={session.messages}
                    usage={usage} onSaveLimit={saveLimit} notice={notice}
                    onNewChat={newChat} onAnswered={onAnswered} onToggleHistory={toggleHistory} historyHidden={historyCollapsed} />
            </div>
        </div>
    )
}
