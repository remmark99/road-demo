"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import jsPDF from "jspdf"
import * as htmlToImage from 'html-to-image'
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bot, Send, User, Loader2, RefreshCw, Database, Search, BarChart, FileText, Download, Maximize2, Plus, MessageSquare, Trash2, FileDown, ChevronDown, ChevronUp } from "lucide-react"
import { chatStorage, type ChatSession } from "@/lib/chat-storage"
import { cn } from "@/lib/utils"

type SuggestedQuestionOption = {
    question: string
    category: string
    tool?: string
}

// Стартовые вопросы по платформе. Часть из них явно привязана к MCP-инструментам.
const SUGGESTED_QUESTION_OPTIONS: SuggestedQuestionOption[] = [
    {
        category: "Дороги",
        question: "У каких подрядчиков и по каким типам инцидентов зафиксированы наиболее длительные задержки реакции за год?",
        tool: "analyze_reaction_tails"
    },
    {
        category: "Дороги",
        question: "Как погодные условия влияли на долю нарушений регламента подрядными организациями в течение года?",
        tool: "analyze_sla_weather_dependency"
    },
    {
        category: "Остановки",
        question: "Какие показатели есть в модуле «Состояние остановок» и как их правильно интерпретировать?"
    },
    {
        category: "Остановки",
        question: "Что можно понять по аналитике «Тёплая остановка» без доступа к сырым данным?"
    },
    {
        category: "Остановки",
        question: "Чем отличаются аналитики остановок: пассажиропоток, безопасность, вандализм и состояние?"
    },
    {
        category: "Парк и берег",
        question: "Какие индикаторы доступны в модулях «Безопасный парк» и «Безопасный берег»?"
    },
    {
        category: "Транспорт",
        question: "Как интерпретировать показатели модуля «Маршрутная дисциплина»?"
    },
    {
        category: "Платформа",
        question: "Какие модули аналитики есть на платформе и за что отвечает каждый?"
    }
];

const STATUS_STEPS = [
    { icon: Search, text: "Анализирую запрос..." },
    { icon: Database, text: "Подключаюсь к базе данных..." },
    { icon: BarChart, text: "Обрабатываю данные..." },
    { icon: FileText, text: "Формирую ответ..." }
];

const TOOL_TAG_PATTERN = /\[ИСПОЛЬЗУЙ:\s*[\w-]+\]\s*\n*/g;

const cleanChatText = (text: string) => text.replace(TOOL_TAG_PATTERN, "").trim();

type ChatMessagePart = {
    type: string;
    text?: string;
    toolName?: string;
};

type RenderableChatMessage = {
    id: string;
    role: "system" | "user" | "assistant";
    content?: string;
    parts?: ChatMessagePart[];
};

const isChatMessagePart = (part: unknown): part is ChatMessagePart => {
    if (typeof part !== "object" || part === null) {
        return false;
    }

    const candidate = part as {
        type?: unknown;
        text?: unknown;
        toolName?: unknown;
    };

    return (
        typeof candidate.type === "string" &&
        (candidate.text === undefined || typeof candidate.text === "string") &&
        (candidate.toolName === undefined || typeof candidate.toolName === "string")
    );
};

const getMessageParts = (message: RenderableChatMessage): ChatMessagePart[] =>
    Array.isArray(message.parts) ? message.parts.filter(isChatMessagePart) : [];

const getMessageText = (message: RenderableChatMessage, separator = "\n") =>
    typeof message.content === "string"
        ? message.content
        : getMessageParts(message)
            .filter((part) => part.type === "text" && typeof part.text === "string")
            .map((part) => part.text ?? "")
            .join(separator);

const hasMessageContent = (message: RenderableChatMessage) =>
    (typeof message.content === "string" && message.content.trim().length > 0) ||
    getMessageParts(message).some((part) =>
        (part.type === "text" && (part.text ?? "").trim().length > 0) ||
        part.type === "tool-invocation" ||
        part.type === "tool-result" ||
        part.type === "dynamic-tool" ||
        part.type.startsWith("tool-")
    );

const WELCOME_MESSAGE: RenderableChatMessage = {
    id: "welcome",
    role: "assistant",
    content: "Привет! Я ИИ-Ассистент платформы городского мониторинга. Могу помочь по дорогам, остановкам, берегу, паркам, транспорту и объяснить, какие показатели есть в аналитике каждого модуля.",
};

interface AIChatbotProps {
    fullHeight?: boolean;
}

export function AIChatbot({ fullHeight = false }: AIChatbotProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const chatRef = useRef<HTMLDivElement>(null)
    const [inputValue, setInputValue] = useState("")
    const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestionOption[]>([])
    const [statusIndex, setStatusIndex] = useState(0)
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
    const [isExporting, setIsExporting] = useState(false)
    const [isQuestionsCollapsed, setIsQuestionsCollapsed] = useState(false)

    // Создаём sessionId сразу при монтировании, чтобы useChat всегда работал с валидным id
    const [sessionId] = useState(() => Date.now().toString());

    // Используем currentSessionId если есть (загрузка существующей сессии), иначе новый sessionId
    const activeSessionId = currentSessionId || sessionId;

    const { messages, sendMessage, status, error, setMessages } = useChat({
        id: activeSessionId,
        transport: new DefaultChatTransport({ api: "/api/chat" }),
    })

    // Load sessions on mount
    useEffect(() => {
        setSessions(chatStorage.getSessions());
    }, []);

    useEffect(() => {
        if (!currentSessionId) {
            setCurrentSessionId(sessionId);
        }
    }, [currentSessionId, sessionId]);

    // Загружаем сообщения при смене сессии
    useEffect(() => {
        if (currentSessionId) {
            const sessions = chatStorage.getSessions();
            const session = sessions.find(s => s.id === currentSessionId);
            if (session && session.messages.length > 0) {
                setMessages(session.messages);
            }
        }
    }, [currentSessionId, setMessages]);

    // Убираем служебные теги [ИСПОЛЬЗУЙ: ...] из текста
    const cleanDisplayText = (text: string) => cleanChatText(text);

    // Save current session when messages change
    useEffect(() => {
        if (messages.length > 0 && currentSessionId) {
            const firstMessage = messages[0] as RenderableChatMessage;
            const rawTitleText = getMessageText(firstMessage, " ");
            const text = rawTitleText.length > 0 ? rawTitleText : "Новый чат";

            // Очищаем текст от служебных тегов перед сохранением заголовка
            const cleanedText = cleanDisplayText(text);
            const title = cleanedText.slice(0, 40) + (cleanedText.length > 40 ? "..." : "");

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
            const role = m.role === 'user' ? 'Пользователь' : 'ИИ-Ассистент';
            const content = getMessageText(m as RenderableChatMessage, ' ');
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

    const downloadPDF = async () => {
        if (messages.length === 0) return;

        try {
            setIsExporting(true);
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const contentWidth = pdfWidth - (margin * 2);
            let currentY = margin;

            // Helper function to add image slice to PDF with proper page breaks
            const addImageToPDF = (canvas: HTMLCanvasElement, imgWidth: number) => {
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                const pageContentHeight = pdfHeight - (margin * 2);

                // If image fits on current page, add it directly
                if (currentY + imgHeight <= pdfHeight - margin) {
                    const imgData = canvas.toDataURL('image/jpeg', 0.85);
                    pdf.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
                    currentY += imgHeight + 2;
                    return;
                }

                // If image fits on a single page but not on current, start new page
                if (imgHeight <= pageContentHeight) {
                    pdf.addPage();
                    currentY = margin;
                    const imgData = canvas.toDataURL('image/jpeg', 0.85);
                    pdf.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
                    currentY += imgHeight + 2;
                    return;
                }

                // Image is taller than one page - need to slice it
                const sourceWidth = canvas.width;
                const sourceHeight = canvas.height;
                const pixelsPerMM = sourceHeight / imgHeight;

                let remainingSourceHeight = sourceHeight;
                let sourceY = 0;

                while (remainingSourceHeight > 0) {
                    // Calculate how much vertical space is available on current page
                    const availablePageHeight = pdfHeight - margin - currentY;
                    const availablePixels = availablePageHeight * pixelsPerMM;

                    // Determine slice height (in pixels)
                    const slicePixelHeight = Math.min(remainingSourceHeight, availablePixels);
                    const sliceMMHeight = slicePixelHeight / pixelsPerMM;

                    // Create a temporary canvas for this slice
                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = sourceWidth;
                    sliceCanvas.height = slicePixelHeight;
                    const sliceCtx = sliceCanvas.getContext('2d');

                    if (sliceCtx) {
                        sliceCtx.drawImage(
                            canvas,
                            0, sourceY, sourceWidth, slicePixelHeight,  // source rect
                            0, 0, sourceWidth, slicePixelHeight          // dest rect
                        );

                        const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.85);
                        pdf.addImage(sliceImgData, 'JPEG', margin, currentY, imgWidth, sliceMMHeight);
                    }

                    sourceY += slicePixelHeight;
                    remainingSourceHeight -= slicePixelHeight;
                    currentY += sliceMMHeight;

                    // If there's more content, add a new page
                    if (remainingSourceHeight > 0) {
                        pdf.addPage();
                        currentY = margin;
                    }
                }

                currentY += 2; // Small gap after the image
            };

            // Temporary container to render messages one by one
            const tempContainer = document.createElement('div');
            tempContainer.style.width = `800px`; // Wider for better text flow
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.style.background = 'white';
            tempContainer.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            document.body.appendChild(tempContainer);

            // Render header as HTML too (to support Cyrillic)
            const headerDiv = document.createElement('div');
            headerDiv.style.padding = '12px 16px';
            headerDiv.style.background = '#f8fafc';
            headerDiv.style.borderBottom = '1px solid #e2e8f0';
            headerDiv.innerHTML = `
                <h1 style="font-size: 18px; font-weight: bold; color: #1e293b; margin: 0 0 4px 0;">
                    История анализа по платформе
                </h1>
                <p style="font-size: 10px; color: #64748b; margin: 0;">
                    Дата экспорта: ${new Date().toLocaleString('ru-RU')}
                </p>
            `;
            tempContainer.appendChild(headerDiv);

            // Capture header
            const headerCanvas = await htmlToImage.toCanvas(headerDiv, {
                backgroundColor: '#f8fafc',
                pixelRatio: 2,
                skipFonts: true,
            });
            addImageToPDF(headerCanvas, contentWidth);
            tempContainer.removeChild(headerDiv);

            // Process each message
            for (const message of allMessages) {
                // Skip empty messages
                const rawContentText = getMessageText(message, '\n');
                const contentText = cleanChatText(rawContentText || '');

                if (!contentText || !contentText.trim()) continue;

                const parts = contentText.split(/(\/plots\/plot_\d+\.png)/g);

                // Process each part of the message separately (text blocks and images)
                let isFirstPart = true;

                for (const part of parts) {
                    if (!part.trim()) continue;

                    if (part.match(/\/plots\/plot_\d+\.png/)) {
                        // This is an image - fetch it as base64 first to avoid CORS issues
                        try {
                            // Use API proxy to fetch image as base64
                            const proxyUrl = `/api${part}`;
                            const response = await fetch(proxyUrl);
                            if (!response.ok) {
                                console.warn('Failed to fetch image:', proxyUrl);
                                continue;
                            }
                            const blob = await response.blob();
                            const base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });

                            // Create image element with base64 data
                            const imgDiv = document.createElement('div');
                            imgDiv.style.padding = '8px';
                            imgDiv.style.background = '#f9fafb';
                            imgDiv.style.border = '1px solid #e5e7eb';
                            imgDiv.style.borderRadius = '6px';
                            imgDiv.style.textAlign = 'center';

                            const img = document.createElement('img');
                            img.src = base64;
                            img.style.maxWidth = '100%';
                            img.style.height = 'auto';
                            img.style.borderRadius = '8px';

                            imgDiv.appendChild(img);
                            tempContainer.appendChild(imgDiv);

                            // Wait for image to load
                            await new Promise<void>((resolve) => {
                                if (img.complete) {
                                    resolve();
                                } else {
                                    img.onload = () => resolve();
                                    img.onerror = () => resolve();
                                    setTimeout(() => resolve(), 2000);
                                }
                            });

                            await new Promise(resolve => setTimeout(resolve, 50));

                            const imgCanvas = await htmlToImage.toCanvas(imgDiv, {
                                backgroundColor: '#ffffff',
                                pixelRatio: 2,
                                skipFonts: true,
                            });

                            addImageToPDF(imgCanvas, contentWidth);
                            tempContainer.removeChild(imgDiv);
                            isFirstPart = false;
                        } catch (imgErr) {
                            console.warn('Error processing image for PDF:', imgErr);
                            // Skip this image and continue
                        }

                    } else {
                        // This is a text block
                        const textDiv = document.createElement('div');
                        textDiv.style.padding = '10px 12px';
                        textDiv.style.marginBottom = '2px';
                        textDiv.style.borderRadius = '6px';
                        textDiv.style.background = message.role === 'user' ? '#eff6ff' : '#f9fafb';
                        textDiv.style.border = message.role === 'user' ? '1px solid #bfdbfe' : '1px solid #e5e7eb';
                        textDiv.style.fontFamily = 'system-ui, -apple-system, sans-serif';
                        textDiv.style.fontSize = '12px';
                        textDiv.style.lineHeight = '1.5';
                        textDiv.style.color = '#1f2937';

                        // Add role label only for the first part of the message
                        if (isFirstPart) {
                            const roleLabel = document.createElement('div');
                            roleLabel.style.fontWeight = '600';
                            roleLabel.style.marginBottom = '4px';
                            roleLabel.style.fontSize = '10px';
                            roleLabel.style.textTransform = 'uppercase';
                            roleLabel.style.letterSpacing = '0.5px';
                            roleLabel.style.color = message.role === 'user' ? '#2563eb' : '#6b7280';
                            roleLabel.innerText = message.role === 'user' ? 'Пользователь' : 'ИИ-Ассистент';
                            textDiv.appendChild(roleLabel);
                        }

                        const textContent = document.createElement('div');
                        textContent.style.whiteSpace = 'pre-wrap';
                        textContent.style.wordBreak = 'break-word';
                        textContent.innerText = part.trim();
                        textDiv.appendChild(textContent);

                        tempContainer.appendChild(textDiv);
                        await new Promise(resolve => setTimeout(resolve, 50));

                        const textCanvas = await htmlToImage.toCanvas(textDiv, {
                            backgroundColor: '#ffffff',
                            pixelRatio: 2,
                            skipFonts: true,
                        });

                        addImageToPDF(textCanvas, contentWidth);
                        tempContainer.removeChild(textDiv);
                        isFirstPart = false;
                    }
                }
            }

            document.body.removeChild(tempContainer);
            pdf.save(`chat-${currentSessionId || 'export'}.pdf`);
        } catch (err) {
            console.error('PDF Export error:', err);
        } finally {
            setIsExporting(false);
        }
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
        const shuffled = [...SUGGESTED_QUESTION_OPTIONS].sort(() => 0.5 - Math.random());
        setSuggestedQuestions(shuffled.slice(0, 3));
    }, []);

    useEffect(() => {
        refreshQuestions();
    }, [refreshQuestions]);

    const renderContentWithImages = (text: string) => {
        // Очищаем текст от служебных тегов перед рендерингом
        const cleanedText = cleanDisplayText(text);
        // Используем API-прокси для решения проблемы Mixed Content (HTTPS -> HTTP)
        const parts = cleanedText.split(/(\/plots\/plot_\d+\.png)/g);

        return parts.map((part, i) => {
            if (part.match(/\/plots\/plot_\d+\.png/)) {
                // Проксируем через /api/plots для HTTPS
                const fullUrl = `/api${part}`;
                return (
                    <div key={i} className="my-2 relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={fullUrl}
                            alt="Analytics chart"
                            className="rounded-lg border bg-white max-w-full h-auto shadow-sm"
                            crossOrigin="anonymous"
                        />
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-white/90 backdrop-blur"
                                onClick={() => window.open(fullUrl, '_blank')}
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-white/90 backdrop-blur"
                                onClick={async () => {
                                    try {
                                        const response = await fetch(fullUrl);
                                        const blob = await response.blob();
                                        const blobUrl = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = blobUrl;
                                        a.download = `chart_${Date.now()}.png`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(blobUrl);
                                    } catch (err) {
                                        console.error('Download failed:', err);
                                        window.open(fullUrl, '_blank');
                                    }
                                }}
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                );
            }
            return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part}</ReactMarkdown>;
        });
    };

    // Combine welcome message with chat messages
    const allMessages = useMemo<RenderableChatMessage[]>(() => [WELCOME_MESSAGE, ...messages], [messages])

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

        // Создаём сессию ПЕРЕД отправкой, если её нет
        if (!currentSessionId) {
            const newId = Date.now().toString();
            setCurrentSessionId(newId);
            // Даём React обработать setState перед отправкой
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        await sendMessage({ text: message })
    }

    const handleQuestionClick = async (question: string) => {
        if (isLoading) return;

        // Создаём сессию ПЕРЕД отправкой, если её нет
        if (!currentSessionId) {
            const newId = Date.now().toString();
            setCurrentSessionId(newId);
            // Даём React обработать setState перед отправкой
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Находим соответствующий инструмент для этого вопроса, если он задан
        const questionOption = SUGGESTED_QUESTION_OPTIONS.find((item) => item.question === question);

        // Формируем сообщение с явной инструкцией, только если вопрос привязан к инструменту
        const messageText = questionOption?.tool
            ? `[ИСПОЛЬЗУЙ: ${questionOption.tool}]\n\n${question}`
            : question;

        await sendMessage({ text: messageText });
    };

    const heightClass = fullHeight ? "h-full min-h-0" : "h-[calc(100vh-280px)] min-h-[600px]";

    return (
        <div className={`flex flex-col gap-4 xl:flex-row ${heightClass}`}>
            {/* Sidebar */}
            <Card className="flex w-full shrink-0 flex-col overflow-hidden border-border/60 bg-muted/30 pt-0 shadow-sm xl:w-72 xl:max-w-72">
                <CardHeader className="gap-4 border-b px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                Сессии
                            </p>
                            <p className="mt-2 text-sm leading-5 text-muted-foreground">
                                История запросов и быстрый доступ к предыдущим разборам.
                            </p>
                        </div>
                        <Badge variant="outline" className="rounded-full border-border/60 bg-background/80 px-2.5 py-0.5 text-xs">
                            {sessions.length}
                        </Badge>
                    </div>
                    <Button
                        onClick={createNewChat}
                        className="w-full justify-center gap-2 border bg-background shadow-sm"
                        variant="ghost"
                        disabled={isLoading}
                    >
                        <Plus className="h-4 w-4 flex-shrink-0" />
                        <span>Новый чат</span>
                    </Button>
                </CardHeader>
                <ScrollArea className="max-h-[240px] w-full xl:max-h-none xl:flex-1">
                    <div className="space-y-2 p-3">
                        {sessions.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-8 text-center text-xs italic text-muted-foreground">
                                Нет сохранённых диалогов
                            </div>
                        )}
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                onClick={() => !isLoading && loadSession(session)}
                                className={cn(
                                    "group flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm transition-all",
                                    currentSessionId === session.id
                                        ? "border-primary/20 bg-primary/10 text-foreground shadow-sm"
                                        : "border-transparent bg-background/70 hover:border-border/70 hover:bg-muted/60",
                                    isLoading
                                        ? "cursor-not-allowed opacity-50"
                                        : "cursor-pointer"
                                )}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                                    <span className="max-w-[180px] truncate text-ellipsis overflow-hidden whitespace-nowrap">
                                        {session.title}
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        "h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                                        currentSessionId === session.id
                                            ? "text-foreground hover:bg-primary/10"
                                            : "text-muted-foreground"
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
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/60 shadow-sm">
                <CardHeader className="shrink-0 gap-4 border-b px-5 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Bot className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <CardTitle className="text-lg">ИИ-Ассистент</CardTitle>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 self-start">
                            {messages.length > 0 && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-2"
                                        onClick={downloadPDF}
                                        disabled={isExporting}
                                    >
                                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                                        <span className="hidden sm:inline">PDF</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-2 text-muted-foreground"
                                        onClick={downloadHistory}
                                    >
                                        <FileText className="h-4 w-4" />
                                        <span className="hidden sm:inline">TXT</span>
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                    <ScrollArea className="min-h-0 flex-1 bg-muted/10 p-4">
                        <div ref={chatRef} className="space-y-4 rounded-2xl border border-border/60 bg-background/90 p-4 shadow-sm md:p-5">
                            {allMessages.map((message) => {
                                const hasContent = hasMessageContent(message);

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
                                                {typeof message.content === "string"
                                                    ? renderContentWithImages(message.content)
                                                    : getMessageParts(message).map((part, i: number) => {
                                                        if (part.type === "text") {
                                                            return (
                                                                <div key={i}>
                                                                    {renderContentWithImages(part.text || "")}
                                                                </div>
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

                    <div className="border-t bg-muted/20 p-4">
                        <div
                            className="flex cursor-pointer items-start justify-between gap-3"
                            onClick={() => setIsQuestionsCollapsed(!isQuestionsCollapsed)}
                        >
                            <div>
                                <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                    Быстрый старт
                                </span>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Готовые вопросы по модулям платформы и дорожным инструментам.
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        refreshQuestions();
                                    }}
                                    disabled={isLoading}
                                >
                                    <RefreshCw className={`h-3 w-3 ${isLoading ? 'opacity-50' : ''}`} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                >
                                    {isQuestionsCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                                </Button>
                            </div>
                        </div>
                        {!isQuestionsCollapsed && (
                            <div className="mt-3 grid gap-2 md:grid-cols-3">
                                {suggestedQuestions.map((item, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleQuestionClick(item.question)}
                                        disabled={isLoading}
                                        className="rounded-xl border border-border/60 bg-background px-3 py-3 text-left transition-all hover:border-primary/25 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <Badge
                                                variant="outline"
                                                className="rounded-full border-border/60 bg-background px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                            >
                                                {item.category}
                                            </Badge>
                                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                {item.tool ? "Инструмент" : "Пояснение"}
                                            </span>
                                        </div>
                                        <div className="text-sm leading-5">
                                            {item.question}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleFormSubmit} className="shrink-0 border-t bg-background/95 p-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Спросите про модуль, метрики или данные..."
                                disabled={isLoading}
                                className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={!inputValue.trim() || isLoading}
                                className="h-10 w-10 rounded-xl"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Можно спросить про модуль, значение метрики, интерпретацию показателей или прислать данные для разбора.
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
