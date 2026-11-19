"use client"

import { useMemo } from "react"
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai"
import { FlaskConical } from "lucide-react"
import { AssistantChat, type AssistantBackend } from "@/components/assistant/assistant-chat"
import type { OverviewSummary } from "@/lib/assistant/overview"
import type { ChatTable } from "@/lib/assistant/table"
import { monthWindow, type AssistantUsageSummary } from "@/lib/assistant/usage-shared"
import type { ReportChart } from "@/lib/reports/chart"

/**
 * Прототип окна ассистента на условных данных: без базы и модели.
 * Открывается только при ASSISTANT_PREVIEW=1 (app/landing/assistant-preview).
 */

const NOW = Date.parse("2026-11-18T07:00:00Z") // 12:00 по Сургуту
const CONTROLLER = "контроллер датчиков"

const OFFLINE: [string, string, string, number][] = [
    ["93", "Ул. Юности (в сторону Тюменьэнерго)", "10.09.2026 13:41", 99_259],
    ["41", "ул. Ивана Захарова (в сторону ул. И. Каролинского)", "10.09.2026 13:42", 99_258],
    ["17", "Сибпромстрой (в сторону центра)", "10.09.2026 13:42", 99_258],
    ["58", "ДК Энергетиков", "10.09.2026 13:43", 99_257],
    ["62", "Университетская (из центра)", "10.09.2026 13:44", 99_256],
    ["63", "Университетская (в центр)", "10.09.2026 13:44", 99_256],
    ["70", "Нефтеюганское шоссе", "10.09.2026 13:46", 99_254],
    ["74", "Бульвар Свободы", "10.09.2026 13:47", 99_253],
    ["81", "Автовокзал (в сторону ж/д вокзала)", "10.09.2026 13:51", 99_249],
    ["84", "Центральный рынок", "10.09.2026 13:52", 99_248],
    ["88", "Проспект Мира, 31", "10.09.2026 13:58", 99_242],
    ["12", "Комсомольский проспект (конечная)", "04.11.2026 15:35", 20_185],
    ["29", "пос. Таежный (из центра)", "04.11.2026 15:35", 20_185],
    ["30", "пос. Таежный (в центр)", "04.11.2026 15:36", 20_184],
    ["47", "ТЦ Славянский (в сторону пр. Пролетарский)", "04.11.2026 15:38", 20_182],
    ["52", "Лесная (в сторону Югорского тракта)", "04.11.2026 15:41", 20_179],
    ["36", "Медучилище", "17.11.2026 22:10", 830],
]

const offlineTable: ChatTable = {
    title: "Оборудование: статус связи",
    columns: ["Оборудование", "Номер", "Статус", "Остановка", "С какого времени", "Минут"],
    rows: OFFLINE.map(([id, stop, since, minutes]) => [CONTROLLER, id, "не в сети", stop, since, minutes]),
}

const novemberOutages: ChatTable = {
    title: "Отключения оборудования за период",
    columns: ["Оборудование", "Номер", "Остановка", "Отключений", "Простой, мин", "Не в сети сейчас"],
    rows: [
        [CONTROLLER, "12", "Комсомольский проспект (конечная)", 1, 20_185, "да"],
        [CONTROLLER, "29", "пос. Таежный (из центра)", 1, 20_185, "да"],
        [CONTROLLER, "30", "пос. Таежный (в центр)", 2, 20_191, "да"],
        [CONTROLLER, "47", "ТЦ Славянский (в сторону пр. Пролетарский)", 3, 20_204, "да"],
        [CONTROLLER, "52", "Лесная (в сторону Югорского тракта)", 1, 20_179, "да"],
        [CONTROLLER, "36", "Медучилище", 14, 1_342, "да"],
        [CONTROLLER, "21", "Аэропорт", 19, 412, "нет"],
        [CONTROLLER, "08", "Ж/д вокзал", 22, 388, "нет"],
        [CONTROLLER, "66", "Сургутский госуниверситет", 17, 301, "нет"],
        [CONTROLLER, "77", "ТРЦ Аура", 11, 248, "нет"],
        [CONTROLLER, "90", "Энергетиков, 4", 9, 197, "нет"],
        [CONTROLLER, "15", "Губкина", 8, 164, "нет"],
    ],
    note: "Показаны первые 12 из 41.",
}

const recentOutages: ChatTable = {
    title: "Отключения оборудования за период",
    columns: ["Оборудование", "Номер", "Остановка", "Отключений", "Простой, мин", "Не в сети сейчас"],
    rows: [
        [CONTROLLER, "36", "Медучилище", 6, 838, "да"],
        [CONTROLLER, "08", "Ж/д вокзал", 12, 141, "нет"],
        [CONTROLLER, "21", "Аэропорт", 9, 118, "нет"],
        [CONTROLLER, "66", "Сургутский госуниверситет", 8, 96, "нет"],
        [CONTROLLER, "77", "ТРЦ Аура", 7, 74, "нет"],
        [CONTROLLER, "90", "Энергетиков, 4", 6, 51, "нет"],
        [CONTROLLER, "15", "Губкина", 5, 44, "нет"],
        [CONTROLLER, "54", "Профсоюзов", 5, 38, "нет"],
        [CONTROLLER, "71", "Чехова", 4, 29, "нет"],
        [CONTROLLER, "45", "30 лет Победы", 4, 22, "нет"],
    ],
}

const climateTable: ChatTable = {
    title: "Температура и влажность в павильонах",
    columns: ["Остановка", "Температура, °C", "Влажность, %", "Температура вне нормы", "Обновлено"],
    rows: [
        ["Нефтеюганское шоссе", -9.4, 71, "да", "18.11.2026 11:50"],
        ["Аэропорт", -7.8, 68, "да", "18.11.2026 11:55"],
        ["Губкина", -6.1, 74, "да", "18.11.2026 11:52"],
        ["Профсоюзов", -3.2, 66, "да", "18.11.2026 11:54"],
        ["Ж/д вокзал", 2.5, 58, "нет", "18.11.2026 11:56"],
        ["ТРЦ Аура", 4.1, 52, "нет", "18.11.2026 11:51"],
        ["Энергетиков, 4", 5.8, 49, "нет", "18.11.2026 11:57"],
        ["Чехова", 6.3, 47, "нет", "18.11.2026 11:50"],
    ],
}

const novemberChart: ReportChart = {
    type: "bar",
    title: "Отключения контроллеров датчиков по дням ноября",
    unit: "отключений",
    labels: Array.from({ length: 18 }, (_, i) => `${String(i + 1).padStart(2, "0")}.11`),
    series: [{ name: "Отключений", values: [4, 6, 3, 23, 7, 5, 2, 4, 12, 6, 3, 5, 18, 7, 4, 3, 31, 42] }],
}

const previewOverview: OverviewSummary = {
    asOf: "2026-11-18 12:00",
    stops: { withCameras: 112, withSensors: 107 },
    cameras: { online: 228, total: 230 },
    controllers: { online: 77, total: 94 },
    events: [{ label: "Курение", count: 6 }, { label: "Оставленный предмет", count: 5 }, { label: "Лежачий человек", count: 3 }],
    binsFull: 3,
    conditions: { ok: 71, warn: 6, bad: 1, unknown: 434 },
}

let counter = 0
const id = (prefix: string) => `${prefix}-${++counter}`
const user = (text: string): UIMessage => ({ id: id("u"), role: "user", parts: [{ type: "text", text }] })
const tool = (name: string, output: unknown) => ({ type: `tool-${name}`, toolCallId: id("call"), state: "output-available", input: {}, output }) as unknown as UIMessage["parts"][number]
const answer = (parts: UIMessage["parts"], tokens: number): UIMessage => ({ id: id("a"), role: "assistant", parts, metadata: { tokens } })
const text = (value: string) => ({ type: "text", text: value }) as UIMessage["parts"][number]

const A1 = `Сейчас на связи **77 из 94** контроллеров датчиков, **17** — нет. Большая часть пропала одной волной **10 сентября около 13:40** — 11 контроллеров за 20 минут, так обычно выглядит общая причина: питание или канал связи.

### Когда отключились
- **10 сентября** — 11 контроллеров, не в сети уже 69 дней
- **4 ноября, 15:35–15:41** — ещё 5, в том числе «Комсомольский проспект (конечная)» и оба направления «пос. Таежный»
- **17 ноября, 22:10** — «Медучилище», это свежее

Причину система не фиксирует — в данных только момент, когда пропала связь. Полный список ниже.`

const A2 = `В ноябре **164 отключения** контроллеров, но почти все короткие — связь пропадает на 5–30 минут и возвращается сама. Долгое одно событие: **4 ноября в 15:35** за шесть минут пропали 5 контроллеров, и с тех пор они не в сети — **14 суток**.

Пики коротких отключений — **17 и 18 ноября** (31 и 42), это вчера и сегодня.`

const A3 = `За **17–18 ноября** — **73 отключения**, из них новое долгое только одно: **«Медучилище»** не в сети с 17.11 22:10, почти 14 часов. Остальные — короткие, связь вернулась сама.

### Сегодня и вчера
| Показатель | 17 ноября | 18 ноября |
|---|---|---|
| Отключений | 31 | 42 |
| Контроллеров затронуто | 14 | 19 |
| Средняя длительность, мин | 18 | 11 |
| Не вернулись | 1 | 0 |

Чаще всего моргает связь на «Ж/д вокзале» и в «Аэропорту» — по 9–12 раз за двое суток, стоит проверить канал связи там.`

const MAIN_ID = "preview-main"
const EXPORT_ID = "preview-export"

function mainConversation(): UIMessage[] {
    return [
        user("Когда отвалились датчики? Почему сейчас 77 в сети"),
        answer([tool("equipment_status", { text: "", table: offlineTable }), text(A1)], 41_800),
        user("Ну когда в ноябре все отключились?"),
        answer([tool("create_chart", { chart: novemberChart }), tool("equipment_outages", { text: "", table: novemberOutages }), text(A2)], 72_400),
        user("Ну вот я про сегодняшние либо вчерашние отключения говорю"),
        answer([tool("equipment_outages", { text: "", table: recentOutages }), text(A3)], 57_100),
    ]
}

function exportConversation(): UIMessage[] {
    return [
        user("Выгрузи в Excel всё оборудование, которое сейчас не в сети"),
        answer([tool("equipment_status", { text: "", table: offlineTable }),
            text("Готово: не в сети **17 контроллеров датчиков**, камеры все на связи. Таблица ниже — кнопка «Excel» над ней скачает файл с фильтрами.")], 22_300),
    ]
}

const CONVERSATIONS = [
    { id: MAIN_ID, title: "Когда отвалились датчики? Почему сейчас 77 в сети", updated_at: new Date(NOW - 10 * 60_000).toISOString() },
    { id: EXPORT_ID, title: "Выгрузи в Excel всё оборудование, которое сейчас не в сети", updated_at: new Date(NOW - 3 * 3_600_000).toISOString() },
    { id: "preview-cold", title: "Где в павильонах холоднее всего?", updated_at: new Date(NOW - 26 * 3_600_000).toISOString() },
    { id: "preview-report", title: "Сделай отчёт о состоянии павильонов за неделю", updated_at: new Date(NOW - 4 * 86_400_000).toISOString() },
]

/** Ответы прототипа на новые вопросы: по ключевым словам. */
function scenario(question: string): { tools: { name: string; output: unknown }[]; text: string; tokens: number } {
    const q = question.toLowerCase()
    if (/холод|тепл|темпер|влажн|климат/.test(q)) {
        return {
            tools: [{ name: "stop_climate", output: { text: "", table: climateTable } }],
            text: "Холоднее всего сейчас на **«Нефтеюганском шоссе» (−9,4 °C)** и в **«Аэропорту» (−7,8 °C)**. Ниже нормы температура в **4 павильонах** из 8 с датчиками на связи — похоже, там не работает обогрев.",
            tokens: 35_200,
        }
    }
    if (/excel|эксел|выгруз|список|таблиц|не в сети|отключ|датчик/.test(q)) {
        return {
            tools: [{ name: "equipment_status", output: { text: "", table: offlineTable } }],
            text: "Не в сети **17 контроллеров датчиков**, камеры все на связи. 11 из них молчат с **10 сентября**. Таблица ниже — её можно отсортировать и скачать кнопкой «Excel».",
            tokens: 27_400,
        }
    }
    return {
        tools: [{ name: "system_overview", output: { text: "", overview: previewOverview } }],
        text: "Камеры почти все на связи, главная проблема — **17 контроллеров датчиков не в сети**, из них 11 молчат с **10 сентября**. На **7 остановках** нарушена норма влажности, переполнены **3 урны**. Это прототип: ответы здесь заготовлены.",
        tokens: 19_600,
    }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

class PreviewTransport implements ChatTransport<UIMessage> {
    constructor(private onTokens: (tokens: number) => void) {}

    async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]) {
        const last = messages.at(-1)
        const question = last?.parts.filter(part => part.type === "text").map(part => (part as { text: string }).text).join(" ") ?? ""
        const plan = scenario(question)
        const onTokens = this.onTokens
        return new ReadableStream<UIMessageChunk>({
            async start(controller) {
                const send = (chunk: UIMessageChunk) => { if (!abortSignal?.aborted) controller.enqueue(chunk) }
                send({ type: "start", messageId: id("a") })
                for (const step of plan.tools) {
                    const callId = id("call")
                    send({ type: "start-step" })
                    send({ type: "tool-input-start", toolCallId: callId, toolName: step.name })
                    send({ type: "tool-input-available", toolCallId: callId, toolName: step.name, input: {} })
                    await wait(1100)
                    send({ type: "tool-output-available", toolCallId: callId, output: step.output })
                    send({ type: "finish-step" })
                }
                send({ type: "start-step" })
                send({ type: "text-start", id: "text" })
                for (const piece of plan.text.match(/\S+\s*/g) ?? []) {
                    if (abortSignal?.aborted) break
                    send({ type: "text-delta", id: "text", delta: piece })
                    await wait(28)
                }
                send({ type: "text-end", id: "text" })
                send({ type: "finish-step" })
                send({ type: "finish", messageMetadata: { tokens: plan.tokens } })
                onTokens(plan.tokens)
                controller.close()
            },
        })
    }

    async reconnectToStream() { return null }
}

function initialUsage(): AssistantUsageSummary {
    const window = monthWindow(Date.now())
    const elapsed = (Date.now() - window.from) / (window.to - window.from)
    const spentTokens = 31_640_000
    return {
        month: window.month, resetsAt: new Date(window.to).toISOString(), spentTokens, limitTokens: 100_000_000, requests: 386,
        forecastTokens: Math.round(spentTokens / Math.max(elapsed, 0.05)), canEdit: true, persisted: true,
    }
}

/** Бэкенд прототипа: заготовленные диалоги, ответы по ключевым словам и бюджет в памяти страницы. */
function previewBackend(): AssistantBackend {
    let usage: AssistantUsageSummary | null = null
    const current = () => (usage ??= initialUsage())
    return {
        transport: new PreviewTransport(tokens => {
            const now = current()
            usage = { ...now, spentTokens: now.spentTokens + tokens, requests: now.requests + 1 }
        }),
        listConversations: async () => CONVERSATIONS,
        loadConversation: async conversationId => conversationId === EXPORT_ID ? exportConversation() : conversationId === MAIN_ID ? mainConversation() : [],
        deleteConversation: async () => {},
        speechEnabled: async () => false,
        usage: async () => current(),
        saveLimit: async limitTokens => { usage = { ...current(), limitTokens }; return usage },
    }
}

export function AssistantPreview() {
    const backend = useMemo(() => previewBackend(), [])
    const initialSession = useMemo(() => ({ id: MAIN_ID, messages: mainConversation() }), [])
    return (
        <AssistantChat
            backend={backend}
            initialSession={initialSession}
            notice={
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] text-muted-foreground">
                    <FlaskConical className="h-3.5 w-3.5 shrink-0 text-primary" />
                    Прототип на условных данных: ответы заготовлены, лимит меняется только на этой странице.
                </div>
            }
        />
    )
}
