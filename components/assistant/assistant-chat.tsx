"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
    AlertTriangle, ArrowUp, AudioLines, Bot, Check, CircleAlert, Copy, History, Loader2, MessageSquarePlus, Mic, PanelLeft, Snowflake, Square, Volume2, X,
    Thermometer, Trash2, Users, Wifi, WifiOff, Sparkles, FileBarChart2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReportCard } from "@/components/assistant/report-card"
import { VECTOR_TOOL_TITLES } from "@/lib/mcp/vector/titles"
import type { ReportDocument } from "@/lib/reports/document"
import { startRecording, type RecordingHandle } from "@/lib/speech/recorder"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
    { icon: Sparkles, text: "Сводка по остановкам на сейчас" },
    { icon: WifiOff, text: "Что сейчас не в сети и сколько уже?" },
    { icon: Snowflake, text: "Где в павильонах холоднее всего?" },
    { icon: AlertTriangle, text: "Где чаще всего были лежачие люди за неделю?" },
    { icon: Trash2, text: "Какие урны переполнены прямо сейчас?" },
    { icon: Wifi, text: "Какое оборудование чаще всего отключалось за неделю?" },
    { icon: Thermometer, text: "На каких остановках нарушены нормы температуры и влажности?" },
    { icon: Users, text: "На каких остановках больше всего людей сегодня?" },
    { icon: FileBarChart2, text: "Сделай отчёт о состоянии павильонов за неделю" },
] as const

type ToolPart = { type: string; toolName?: string; state?: string; toolCallId?: string; output?: unknown }

/** Отчёт из вывода create_report (в том числе из сохранённой истории). */
function reportOf(part: ToolPart): ReportDocument | null {
    if (toolName(part) !== "create_report" || part.state !== "output-available") return null
    const report = (part.output as { report?: ReportDocument } | null)?.report
    return report && typeof report.title === "string" && Array.isArray(report.sections) ? report : null
}

function toolFailed(part: ToolPart) {
    return part.state === "output-error" || (toolName(part) === "create_report" && part.state === "output-available" && !reportOf(part) && part.output !== null)
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

function ToolSteps({ parts }: { parts: ToolPart[] }) {
    if (!parts.length) return null
    return (
        <div className="mb-2 flex flex-wrap gap-1.5">
            {parts.map((part, index) => {
                const done = part.state === "output-available"
                const failed = toolFailed(part)
                return (
                    <span
                        key={part.toolCallId ?? index}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
                            failed ? "border-destructive/40 text-destructive" : "border-border bg-muted/50 text-muted-foreground",
                        )}
                    >
                        {failed ? <CircleAlert className="h-3 w-3" /> : done ? <Check className="h-3 w-3 text-emerald-500" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                        {VECTOR_TOOL_TITLES[toolName(part)] ?? "Запрос данных"}
                    </span>
                )
            })}
        </div>
    )
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => {
                void navigator.clipboard?.writeText(text).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                })
            }}
        >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Скопировано" : "Копировать"}
        </button>
    )
}

const MARKDOWN = "markdown-content text-[15px] leading-relaxed [&_a]:text-primary [&_a]:underline [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1.5 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1"

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
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => speech.toggle(id, text)}
        >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
            {playing ? "Остановить" : "Слушать"}
        </button>
    )
}

function AssistantMessage({ message, streaming, speech }: { message: UIMessage; streaming: boolean; speech: SpeechControls }) {
    const tools = message.parts.filter(isToolPart)
    const reports = tools.map(reportOf).filter((report): report is ReportDocument => report !== null)
    const text = messageText(message)
    return (
        <div className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
                <ToolSteps parts={tools} />
                {text ? (
                    <div className={MARKDOWN}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noopener noreferrer" />, table: props => <div className="overflow-x-auto"><table {...props} /></div> }}>{text}</ReactMarkdown>
                    </div>
                ) : streaming && !reports.length ? (
                    <div className="flex h-6 items-center gap-1" aria-label="Ассистент думает">
                        {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 150}ms` }} />)}
                    </div>
                ) : null}
                {reports.map((report, index) => <ReportCard key={`${report.generatedAt}-${index}`} report={report} />)}
                {text && !streaming && (
                    <div className="mt-1 flex items-center gap-1">
                        <CopyButton text={text} />
                        {speech.enabled && <ListenButton id={message.id} text={text} speech={speech} />}
                    </div>
                )}
            </div>
        </div>
    )
}

interface ChatPanelProps {
    conversationId: string
    initialMessages: UIMessage[]
    onNewChat: () => void
    onAnswered: () => void
    onToggleHistory: () => void
}

function ChatPanel({ conversationId, initialMessages, onNewChat, onAnswered, onToggleHistory }: ChatPanelProps) {
    const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", body: { mode: "stops" } }), [])
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

    const send = (text: string) => {
        const question = text.trim()
        if (!question || busy) return
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
        fetch("/api/assistant/speech").then(r => r.ok ? r.json() : { enabled: false })
            .then((body: { enabled?: boolean }) => { if (!cancelled) setSpeechEnabled(Boolean(body.enabled)) })
            .catch(() => {})
        return () => { cancelled = true }
    }, [])

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
            <div className="flex items-center justify-between border-b px-4 py-2.5 md:px-6">
                <div className="flex min-w-0 items-center gap-2.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onToggleHistory} aria-label="История диалогов">
                        <PanelLeft className="h-4 w-4" />
                    </Button>
                    <div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary md:flex"><Bot className="h-4 w-4" /></div>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold leading-tight">ИИ-ассистент</div>
                        <div className="truncate text-xs text-muted-foreground">Вектор города · данные остановочных павильонов Сургута</div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
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
                            <AudioLines className="h-3.5 w-3.5" />{conversation ? "Разговор включён" : "Разговор"}
                        </Button>
                    )}
                    {messages.length > 0 && (
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { stop(); stopAudio(); onNewChat() }}>
                            <MessageSquarePlus className="h-3.5 w-3.5" />Новый диалог
                        </Button>
                    )}
                </div>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-4 py-10">
                        <div className="mb-8 text-center">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-6 w-6" /></div>
                            <h1 className="text-2xl font-semibold tracking-tight">Чем помочь?</h1>
                            <p className="mt-2 text-sm text-muted-foreground">Спросите о связи оборудования, событиях, климате в павильонах, урнах или пассажиропотоке.</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {SUGGESTIONS.map(({ icon: Icon, text }) => (
                                <button key={text} type="button" onClick={() => send(text)}
                                    className="flex items-start gap-3 rounded-xl border bg-card p-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
                                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
                        {messages.map((message, index) => message.role === "user" ? (
                            <div key={message.id} className="flex justify-end">
                                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">{messageText(message)}</div>
                            </div>
                        ) : (
                            <AssistantMessage key={message.id} message={message} streaming={busy && index === messages.length - 1} speech={speech} />
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

            <div className="border-t bg-background/80 px-4 pb-4 pt-3 backdrop-blur md:px-6">
                <form className="mx-auto max-w-3xl" onSubmit={event => { event.preventDefault(); send(input) }}>
                    <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-colors focus-within:border-primary/50">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={event => setInput(event.target.value)}
                            onKeyDown={onKeyDown}
                            rows={1}
                            placeholder="Спросите про остановки, оборудование, события…"
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
                            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-xl" disabled={!input.trim()} aria-label="Отправить">
                                <ArrowUp className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    {(voiceNotice || listening !== "idle") && (
                        <p role="status" className={cn("mt-2 text-center text-xs", voiceNotice ? "text-destructive" : "text-muted-foreground")}>
                            {voiceNotice ?? (listening === "recording" ? "Говорите — запись остановится после паузы" : "Распознаю…")}
                        </p>
                    )}
                    <p className="mt-2 text-center text-xs text-muted-foreground">Ассистент отвечает по данным системы и может ошибаться — важное проверяйте в разделах сайта.</p>
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

function HistorySidebar({ items, error, activeId, onOpen, onDelete, onNew, onClose, className }: {
    items: ConversationSummary[] | null
    error: boolean
    activeId: string
    onOpen: (id: string) => void
    onDelete: (id: string) => void
    onNew: () => void
    onClose?: () => void
    className?: string
}) {
    const [now] = useState(() => Date.now())
    const groups = useMemo(() => {
        const result: { label: string; items: ConversationSummary[] }[] = []
        for (const item of items ?? []) {
            const label = dayGroup(item.updated_at, now)
            const group = result.at(-1)?.label === label ? result.at(-1)! : (result.push({ label, items: [] }), result.at(-1)!)
            group.items.push(item)
        }
        return result
    }, [items, now])
    return (
        <aside className={cn("flex h-full w-72 shrink-0 flex-col border-r bg-muted/20", className)}>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4 text-muted-foreground" />История</div>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onNew}><MessageSquarePlus className="h-3.5 w-3.5" />Новый</Button>
                    {onClose && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Закрыть историю"><X className="h-4 w-4" /></Button>}
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {error ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">История сейчас недоступна.</p>
                ) : items === null ? (
                    <div className="space-y-2 px-2 py-2">{[0, 1, 2].map(i => <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />)}</div>
                ) : items.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">Здесь появятся ваши диалоги.</p>
                ) : groups.map(group => (
                    <div key={group.label} className="mt-2">
                        <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</div>
                        {group.items.map(item => (
                            <div key={item.id} className={cn("group flex items-center rounded-lg", item.id === activeId ? "bg-muted" : "hover:bg-muted/60")}>
                                <button type="button" className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm" title={item.title} onClick={() => onOpen(item.id)}>
                                    {item.title}
                                </button>
                                <button
                                    type="button"
                                    className="mr-1 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
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

export function AssistantChat() {
    const [session, setSession] = useState<{ id: string; messages: UIMessage[] }>(() => ({ id: crypto.randomUUID(), messages: [] }))
    const [items, setItems] = useState<ConversationSummary[] | null>(null)
    const [historyError, setHistoryError] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)

    const refresh = useCallback(async () => {
        try {
            const response = await fetch("/api/assistant/conversations", { cache: "no-store" })
            if (!response.ok) throw new Error()
            const body = await response.json() as { conversations: ConversationSummary[] }
            setItems(body.conversations)
            setHistoryError(false)
        } catch {
            setHistoryError(true)
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        fetch("/api/assistant/conversations", { cache: "no-store" })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then((body: { conversations: ConversationSummary[] }) => { if (!cancelled) setItems(body.conversations) })
            .catch(() => { if (!cancelled) setHistoryError(true) })
        return () => { cancelled = true }
    }, [])

    const newChat = useCallback(() => { setSession({ id: crypto.randomUUID(), messages: [] }); setHistoryOpen(false) }, [])

    const open = useCallback(async (id: string) => {
        setHistoryOpen(false)
        if (id === session.id) return
        try {
            const response = await fetch(`/api/assistant/conversations/${id}`, { cache: "no-store" })
            if (!response.ok) throw new Error()
            const body = await response.json() as { id: string; messages: UIMessage[] }
            setSession({ id: body.id, messages: Array.isArray(body.messages) ? body.messages : [] })
        } catch {
            setHistoryError(true)
        }
    }, [session.id])

    const remove = useCallback(async (id: string) => {
        if (!window.confirm("Удалить этот диалог из истории?")) return
        const response = await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" }).catch(() => null)
        if (!response?.ok) { setHistoryError(true); return }
        setItems(current => current?.filter(item => item.id !== id) ?? current)
        if (id === session.id) newChat()
    }, [newChat, session.id])

    // Сервер сохраняет диалог в конце потока; список перечитываем чуть позже.
    const onAnswered = useCallback(() => { setTimeout(() => { void refresh() }, 1200) }, [refresh])

    const sidebar = (extra?: { onClose: () => void; className: string }) => (
        <HistorySidebar items={items} error={historyError} activeId={session.id} onOpen={id => void open(id)} onDelete={id => void remove(id)} onNew={newChat}
            onClose={extra?.onClose} className={extra?.className} />
    )

    return (
        <div className="relative flex h-full min-h-0">
            {sidebar({ onClose: () => setHistoryOpen(false), className: "hidden md:flex" })}
            {historyOpen && (
                <div className="absolute inset-0 z-30 flex md:hidden">
                    {sidebar({ onClose: () => setHistoryOpen(false), className: "bg-background shadow-xl" })}
                    <button type="button" aria-label="Закрыть историю" className="flex-1 bg-black/30" onClick={() => setHistoryOpen(false)} />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <ChatPanel key={session.id} conversationId={session.id} initialMessages={session.messages}
                    onNewChat={newChat} onAnswered={onAnswered} onToggleHistory={() => setHistoryOpen(v => !v)} />
            </div>
        </div>
    )
}

