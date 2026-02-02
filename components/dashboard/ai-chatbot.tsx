"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useRef, useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bot, Send, User, Loader2, RefreshCw, Database, Search, BarChart, FileText, Download, Maximize2, Plus, MessageSquare, Trash2, History, FileDown } from "lucide-react"
import { chatStorage, type ChatSession } from "@/lib/chat-storage"
import { cn } from "@/lib/utils"

const ALL_QUESTIONS = [
    "У каких подрядчиков и по каким типам инцидентов зафиксированы наиболее длительные задержки реакции за год?",
    "Какие категории дорожных проблем вызывали наибольшие сложности с оперативным реагированием в течение года?",
    "В какие часы суток чаще всего нарушаются регламенты реагирования по различным типам инцидентов?",
    "В какие дни недели наблюдается снижение дисциплины при обработке дорожных инцидентов?",
    "Насколько эффективно спецтехника справлялась с устранением выявленных проблем в течение года?",
    "Как работа спецтехники повлияла на реальное увеличение скорости движения транспорта за год?",
    "Какие камеры имели наибольшие пробелы в данных за год и требуют технического обслуживания?",
    "Как погодные условия влияли на долю нарушений регламента подрядными организациями в течение года?"
];

const STATUS_STEPS = [
    { icon: Search, text: "Анализирую запрос..." },
    { icon: Database, text: "Подключаюсь к базе данных..." },
    { icon: BarChart, text: "Обрабатываю данные..." },
    { icon: FileText, text: "Формирую ответ..." }
];

export function AIChatbot() {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const [inputValue, setInputValue] = useState("")
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
    const [statusIndex, setStatusIndex] = useState(0)
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

    const { messages, sendMessage, status, error, setMessages } = useChat({
        transport: new DefaultChatTransport({ api: "/api/chat" }),
        initialMessages: [],
    })

    // Load sessions on mount
    useEffect(() => {
        setSessions(chatStorage.getSessions());
    }, []);

    // Save current session when messages change
    useEffect(() => {
        if (messages.length > 0 && currentSessionId) {
            const firstMessage = messages[0];
            let text = "Новый чат";
            
            if (typeof firstMessage.content === 'string' && firstMessage.content.length > 0) {
                text = firstMessage.content;
            } else if (Array.isArray(firstMessage.parts)) {
                const textPart = firstMessage.parts.find(p => p.type === 'text');
                if (textPart && 'text' in textPart) {
                    text = textPart.text;
                }
            }

            const title = text.slice(0, 40) + (text.length > 40 ? "..." : "");
            
            chatStorage.saveSession({
                id: currentSessionId,
                title: title,
                messages: messages,
                createdAt: Date.now()
            });
            setSessions(chatStorage.getSessions());
        }
    }, [messages, currentSessionId]);

    const createNewChat = () => {
        const id = Date.now().toString();
        setCurrentSessionId(id);
        setMessages([]);
    };

    const loadSession = (session: ChatSession) => {
        setCurrentSessionId(session.id);
        setMessages(session.messages);
    };

    const downloadHistory = () => {
        if (messages.length === 0) return;
        const text = messages.map(m => {
            const role = m.role === 'user' ? 'Пользователь' : 'AI-ассистент';
            const content = 'content' in m ? m.content : (m as any).parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ');
            return `[${role}]:\n${content}\n`;
        }).join('\n---\n\n');
        
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-history-${currentSessionId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const deleteSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        chatStorage.deleteSession(id);
        setSessions(chatStorage.getSessions());
        if (currentSessionId === id) {
            setCurrentSessionId(null);
            setMessages([]);
        }
    };

    // Cycle through statuses when loading
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === "streaming" || status === "submitted") {
            interval = setInterval(() => {
                setStatusIndex((prev) => (prev + 1) % STATUS_STEPS.length);
            }, 2000);
        } else {
            setStatusIndex(0);
        }
        return () => clearInterval(interval);
    }, [status]);

    const refreshQuestions = useCallback(() => {
        const shuffled = [...ALL_QUESTIONS].sort(() => 0.5 - Math.random());
        setSuggestedQuestions(shuffled.slice(0, 3));
    }, []);

    useEffect(() => {
        refreshQuestions();
    }, [refreshQuestions]);

    const welcomeMessage = {
        id: "welcome",
        role: "assistant" as const,
        content: "Привет! Я AI-ассистент для анализа дорожной ситуации в Сургуте. Задайте мне вопрос о состоянии дорог, статистике или прогнозах.",
    }

    console.log(error, status, messages);

    const renderContentWithImages = (text: string) => {
        const parts = text.split(/(\/plots\/plot_\d+\.png)/g);
        return parts.map((part, i) => {
            if (part.match(/\/plots\/plot_\d+\.png/)) {
                return (
                    <div key={i} className="my-2 relative group">
                        <img 
                            src={part} 
                            alt="Road Analysis Chart" 
                            className="rounded-lg border bg-white max-w-full h-auto shadow-sm"
                        />
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                                variant="secondary" 
                                size="icon" 
                                className="h-8 w-8 bg-white/90 backdrop-blur"
                                onClick={() => window.open(part, '_blank')}
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                            <a href={part} download={`chart_${Date.now()}.png`}>
                                <Button 
                                    variant="secondary" 
                                    size="icon" 
                                    className="h-8 w-8 bg-white/90 backdrop-blur"
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                            </a>
                        </div>
                    </div>
                );
            }
            return part;
        });
    };

    // Combine welcome message with chat messages
    const allMessages = useMemo(() => [welcomeMessage, ...messages], [messages])

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

    const handleQuestionClick = async (question: string) => {
        if (isLoading) return;
        if (!currentSessionId) createNewChat();
        await sendMessage({ text: question });
    };

    return (
        <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[600px]">
            {/* Sidebar */}
            <Card className="w-64 flex flex-col shrink-0 bg-muted/30">
                <CardHeader className="p-4 border-b">
                    <Button 
                        onClick={createNewChat} 
                        className="w-full justify-start gap-2 bg-background border shadow-sm"
                        variant="ghost"
                    >
                        <Plus className="h-4 w-4" />
                        Новый чат
                    </Button>
                </CardHeader>
                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {sessions.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-xs italic">
                                Нет истории чатов
                            </div>
                        )}
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                onClick={() => loadSession(session)}
                                className={cn(
                                    "group flex items-center justify-between p-2 rounded-lg cursor-pointer text-sm transition-colors",
                                    currentSessionId === session.id 
                                        ? "bg-primary text-primary-foreground" 
                                        : "hover:bg-muted"
                                )}
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{session.title}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                                        currentSessionId === session.id ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground"
                                    )}
                                    onClick={(e) => deleteSession(e, session.id)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </Card>

            {/* Main Chat Area */}
            <Card className="flex-1 flex flex-col overflow-hidden">
                <CardHeader className="border-b shrink-0 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Bot className="h-5 w-5 text-primary" />
                            AI-ассистент
                        </CardTitle>
                        {currentSessionId && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2 py-1 rounded">
                                <History className="h-3 w-3" />
                                ID: {currentSessionId}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {messages.length > 0 && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 gap-2"
                                onClick={downloadHistory}
                            >
                                <FileDown className="h-4 w-4" />
                                <span className="hidden sm:inline">История</span>
                            </Button>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                <ScrollArea className="flex-1 p-4 min-h-0">
                    <div className="space-y-4">
                        {allMessages.map((message) => {
                            const hasContent = ("content" in message && message.content.trim().length > 0) || 
                                              (message.parts && message.parts.some((p: any) => 
                                                (p.type === 'text' && p.text.trim().length > 0) || 
                                                p.type === 'tool-invocation' || 
                                                p.type === 'tool-result'
                                              ));

                            if (!hasContent) return null;

                            return (
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
                                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${message.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted shadow-sm"
                                        }`}
                                >
                                    <div className="text-sm markdown-content">
                                        {"content" in message
                                            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderContentWithImages(message.content)}</ReactMarkdown>
                                            : message.parts?.map((part: { type: string; text?: string; toolName?: string }, i: number) => {
                                                if (part.type === "text") {
                                                    return (
                                                        <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                                                            {renderContentWithImages(part.text)}
                                                        </ReactMarkdown>
                                                    )
                                                }
                                                if (part.type === "tool-invocation") {
                                                    return (
                                                        <div key={i} className="flex items-center gap-2 text-[10px] text-blue-500/80 font-medium uppercase tracking-wider my-1 bg-blue-50/50 p-1.5 rounded border border-blue-100">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            Запуск: {part.toolName}
                                                        </div>
                                                    )
                                                }
                                                if (part.type === "tool-result") {
                                                    return (
                                                        <div key={i} className="flex items-center gap-2 text-[10px] text-green-600/80 font-medium uppercase tracking-wider my-1 bg-green-50/50 p-1.5 rounded border border-green-100">
                                                            <span>✓ Завершено: {part.toolName}</span>
                                                        </div>
                                                    )
                                                }
                                                return null
                                            })}
                                    </div>
                                </div>
                            </div>
                            );
                        })}

                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="bg-muted rounded-2xl px-4 py-3 shadow-sm border border-border/50">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                            {(() => {
                                                const Icon = STATUS_STEPS[statusIndex].icon;
                                                return <Icon className="h-2 w-2 absolute inset-0 m-auto" />
                                            })()}
                                        </div>
                                        <span className="text-sm font-medium animate-pulse text-muted-foreground">
                                            {STATUS_STEPS[statusIndex].text}
                                        </span>
                                    </div>
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

                <div className="p-4 border-t space-y-4 bg-muted/20">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Предложенные вопросы</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={refreshQuestions}
                            disabled={isLoading}
                        >
                            <RefreshCw className={`h-3 w-3 ${isLoading ? 'opacity-50' : ''}`} />
                        </Button>
                    </div>
                    <div className="grid gap-2">
                        {suggestedQuestions.map((q, i) => (
                            <button
                                key={i}
                                onClick={() => handleQuestionClick(q)}
                                disabled={isLoading}
                                className="text-left text-xs p-2 rounded-lg border bg-background hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </div>

                <form onSubmit={(e) => {
                    if (!currentSessionId) createNewChat();
                    handleFormSubmit(e);
                }} className="flex-shrink-0 p-4 border-t">
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
        </div>
    )
}
