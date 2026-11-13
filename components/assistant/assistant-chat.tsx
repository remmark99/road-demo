"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
    AlertTriangle, ArrowUp, Bot, Check, CircleAlert, Copy, Loader2, RotateCcw, Snowflake, Square,
    Thermometer, Trash2, Users, Wifi, WifiOff, Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { VECTOR_TOOL_TITLES } from "@/lib/mcp/vector/titles"
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
] as const

type ToolPart = { type: string; toolName?: string; state?: string; toolCallId?: string }

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
                const failed = part.state === "output-error"
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

function AssistantMessage({ message, streaming }: { message: UIMessage; streaming: boolean }) {
    const tools = message.parts.filter(isToolPart)
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
                ) : streaming ? (
                    <div className="flex h-6 items-center gap-1" aria-label="Ассистент думает">
                        {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 150}ms` }} />)}
                    </div>
                ) : null}
                {text && !streaming && <div className="mt-1"><CopyButton text={text} /></div>}
            </div>
        </div>
    )
}

export function AssistantChat() {
    const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", body: { mode: "stops" } }), [])
    const { messages, sendMessage, status, stop, setMessages, error, regenerate } = useChat({ transport })
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
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold leading-tight">ИИ-ассистент</div>
                        <div className="truncate text-xs text-muted-foreground">Вектор города · данные остановочных павильонов Сургута</div>
                    </div>
                </div>
                {messages.length > 0 && (
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { stop(); setMessages([]) }}>
                        <RotateCcw className="h-3.5 w-3.5" />Новый диалог
                    </Button>
                )}
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
                            <AssistantMessage key={message.id} message={message} streaming={busy && index === messages.length - 1} />
                        ))}
                        {waitingForFirstToken && <AssistantMessage message={{ id: "pending", role: "assistant", parts: [] }} streaming />}
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
                    <p className="mt-2 text-center text-xs text-muted-foreground">Ассистент отвечает по данным системы и может ошибаться — важное проверяйте в разделах сайта.</p>
                </form>
            </div>
        </div>
    )
}
