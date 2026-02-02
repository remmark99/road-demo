"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useRef, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bot, Send, User, Loader2 } from "lucide-react"

export function AIChatbot() {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const [inputValue, setInputValue] = useState("")

    const welcomeMessage = {
        id: "welcome",
        role: "assistant" as const,
        content: "Привет! Я AI-ассистент для анализа дорожной ситуации в Сургуте. Задайте мне вопрос о состоянии дорог, статистике или прогнозах.",
    }

    const { messages, sendMessage, status, error } = useChat({
        transport: new DefaultChatTransport({ api: "/api/chat" }),
    })
    console.log(error, status, messages);

    // Combine welcome message with chat messages
    const allMessages = [welcomeMessage, ...messages]

    const isLoading = status === "streaming" || status === "submitted"

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [allMessages, isLoading])

    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!inputValue.trim() || isLoading) return

        const message = inputValue.trim()
        setInputValue("")

        await sendMessage({ text: message })
    }

    return (
        <Card className="flex flex-col h-[600px]">
            <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="h-5 w-5 text-primary" />
                    AI-ассистент
                </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                <ScrollArea className="flex-1 p-4 min-h-0">
                    <div className="space-y-4">
                        {allMessages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                                <div
                                    className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${message.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted"
                                        }`}
                                >
                                    {message.role === "user" ? (
                                        <User className="h-4 w-4" />
                                    ) : (
                                        <Bot className="h-4 w-4" />
                                    )}
                                </div>
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${message.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted"
                                        }`}
                                >
                                    <div className="text-sm whitespace-pre-wrap">
                                        {"content" in message
                                            ? message.content
                                            : message.parts?.map((part: any, i: number) => {
                                                if (part.type === "text") {
                                                    return <span key={i}>{part.text}</span>
                                                }
                                                if (part.type === "tool-invocation") {
                                                    return (
                                                        <div key={i} className="flex items-center gap-2 text-xs text-blue-500/80 font-medium italic my-1 bg-blue-50/50 p-1.5 rounded">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            Использую: {part.toolName}
                                                        </div>
                                                    )
                                                }
                                                if (part.type === "tool-result") {
                                                    return (
                                                        <div key={i} className="flex items-center gap-2 text-xs text-green-600/80 font-medium italic my-1 bg-green-50/50 p-1.5 rounded">
                                                            <span>✓ Готово: {part.toolName}</span>
                                                        </div>
                                                    )
                                                }
                                                return null
                                            })}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="bg-muted rounded-2xl px-4 py-3">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="text-sm text-destructive text-center p-2">
                                Ошибка: {error.message}
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </ScrollArea>

                <form onSubmit={handleFormSubmit} className="flex-shrink-0 p-4 border-t">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Задайте вопрос..."
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 rounded-full border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!inputValue.trim() || isLoading}
                            className="rounded-full h-10 w-10"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
