import {
    createUIMessageStream,
    createUIMessageStreamResponse,
    type UIMessage,
} from "ai"
import { promises as fs } from "node:fs"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import {
    createGigaChatCompletion,
    GigaChatConfigError,
    GigaChatConnectionError,
    type GigaChatFunctionCall,
    type GigaChatFunctionDefinition,
    type GigaChatMessage,
} from "@/lib/gigachat/client"
import {
    STOP_SAFETY_ALERT_LABELS,
    STOP_SAFETY_ALERT_TYPES,
    getStopComplexByCameraIndex,
    getStopComplexByLocationId,
} from "@/lib/stop-analytics-config"

type AssistantMode = "platform" | "stops"

type MCPToolSchema = {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    $defs?: Record<string, unknown>
    $ref?: string
    anyOf?: unknown[]
    items?: unknown
    description?: string
    enum?: unknown[]
}

type MCPToolDefinition = {
    name: string
    description?: string
    inputSchema?: MCPToolSchema
}

type MCPToolResultContent = {
    type?: string
    text?: string
}

type MCPToolResult = {
    content?: MCPToolResultContent[]
    isError?: boolean
}

type BusynessWindowRow = {
    location_id: string
    window_start: string
    window_end: string | null
    person_count_avg: number | null
    person_count_max: number | null
    sample_count: number | null
}

type StopConditionWindowRow = {
    location_id: string
    window_start: string
    window_end: string | null
    trash_fill_avg: number | null
    trash_fill_max: number | null
    sample_count: number | null
    created_at?: string | null
}

type StopAlertRow = {
    alert_type: string
    severity: number | null
    message: string | null
    metadata: Record<string, unknown> | null
    timestamp: string
    camera_index: number | null
}

type SupabaseQueryResult<T> = {
    data: T | null
    error: { message?: string; code?: string; details?: string } | null
}

const MCP_SERVER_URL = normalizeMcpUrl(process.env.MCP_SERVER_URL || "http://127.0.0.1:8000/mcp")
const MCP_CONNECT_TIMEOUT = 5_000
const MCP_PING_TIMEOUT = 3_000
const MCP_LIST_TOOLS_TIMEOUT = 5_000
const MCP_CALL_TOOL_TIMEOUT = 45_000
const GIGACHAT_MAX_STEPS = 10
const GIGACHAT_MAX_TOKENS = 3200
const GIGACHAT_INITIAL_COMPLETION_TIMEOUT_MS = 60_000
const GIGACHAT_AFTER_TOOL_TIMEOUT_MS = 45_000
const MAX_FUNCTION_RESULT_CHARS = 22000
const SURGUT_TIME_ZONE = "Asia/Yekaterinburg"
const USER_NUMBER_FORMAT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })
const TOOL_TAG_PATTERN = /\[ИСПОЛЬЗУЙ:\s*([\w-]+)\]\s*/i
const TOOL_TAG_CLEAN_PATTERN = /\[ИСПОЛЬЗУЙ:\s*[\w-]+\]\s*/gi
const ISO_DATE_TIME_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g
const TEXT_PART_ID = "assistant-text"
const LOCAL_PLOTS_DIR = path.join(process.cwd(), "tmp", "plots")
const STOP_ALERT_MODULE_NAMES = [
    "stops",
    "bus_stop_monitoring",
    "stop_monitoring",
]
const STOP_TRASH_OVERFLOW_ALERT_TYPES = [
    "trash_overflow",
    "trash_bin_overflow",
    "bin_overflow",
    "bin_full",
    "garbage_overflow",
    "stop_trash_overflow",
    "stop_bin_overflow",
    "overflowing_trash",
    "overflowing_bin",
    "trash_full",
    "park_trash_overflow",
]
const STOP_KNOWN_TOOL_NAMES = new Set([
    "get_stop_current_load_summary",
    "get_stop_safety_events",
    "get_stop_lying_person_events",
    "list_assistant_data_modes",
    "create_plot",
])
const LOCAL_TOOL_NAMES = new Set([
    "query_stop_supabase_readonly",
    "build_bar_chart",
])
const STOP_SQL_TABLE_COLUMNS: Record<string, string[]> = {
    busyness_windows: [
        "location_id",
        "window_start",
        "window_end",
        "person_count_avg",
        "person_count_max",
        "sample_count",
    ],
    alerts: [
        "id",
        "module_name",
        "alert_type",
        "severity",
        "message",
        "metadata",
        "timestamp",
        "source_video",
        "clip_path",
        "camera_index",
    ],
    stop_condition_windows: [
        "location_id",
        "window_start",
        "window_end",
        "trash_fill_avg",
        "trash_fill_max",
        "sample_count",
        "created_at",
    ],
}

let mcpClient: Client | null = null
let mcpConnected = false

const QUALITY_ANSWER_RULES = `Качество ответа важнее скорости. Перед финальным ответом внутренне проверь: что спросил пользователь, какие данные доступны, какие выводы подтверждены, чего не хватает. Не показывай ход рассуждений, показывай только результат.

Формат нормального аналитического ответа:
1. Короткий вывод в 1-2 предложениях.
2. Факты из данных: цифры, периоды, топы, сравнения, где это возможно.
3. Интерпретация: что это значит для диспетчера/руководителя, какие риски или приоритеты.
4. Действия: что проверить или сделать дальше.
5. Ограничения данных: только если они реально важны.

Запрещено:
- Не отвечай одной общей фразой, если инструмент вернул строки или агрегаты.
- Не пересказывай сырые JSON/SQL/названия таблиц вместо анализа.
- Не выводи ISO-время. Все даты и время пиши по-русски: «15.06.2026 11:24», при необходимости указывай «по времени Сургута».
- Не используй внутренние названия источников вроде supabase_rest.alerts в начале ответа, если пользователь сам не попросил техническую трассировку.
- Не проси пользователя предоставить данные, если у тебя есть инструмент или доступный источник для запроса. Сначала попробуй получить данные сам.`

const PLATFORM_SYSTEM_PROMPT = `Ты — ИИ-Ассистент платформы городского мониторинга «Вектор Города».
Режим: «Платформа». Ты помогаешь по всем 5 модулям: дороги, остановки, берег, парк, транспорт.

Главные правила:
- Не выдумывай текущие значения, динамику, причины и управленческие выводы без данных пользователя или результатов инструментов.
- Режим «Платформа» использует платформенный аналитический контур и SQL/MCP-инструменты платформы. Не подменяй его live-Supabase источником остановок.
- Live-Supabase источник остановок используй только в режиме «Остановки» или если пользователь явно спрашивает именно live-данные остановок.
- Если нужны фактические числа по дорожному контуру, погоде, подрядчикам, SLA или общим платформенным сценариям, используй доступные платформенные функции и SQL-инструменты.
- Если инструментов или данных по модулю нет, прямо скажи, что можешь объяснить структуру показателей, но не подтвердить текущие значения.
- Не говори «я вижу на графике» или «сейчас наблюдается», если это не подтверждено инструментом или сообщением пользователя.
- Отвечай на понятном русском языке, без SQL-терминов и внутренних названий таблиц, если пользователь сам их не попросил.
${QUALITY_ANSWER_RULES}

Термины:
- Инцидент — зафиксированное событие или отклонение.
- Нарушение — инцидент, вышедший за норматив, если норматив задан.
- Время реакции — время от фиксации события до начала реакции.
- Индекс — сводный показатель состояния, риска или готовности; не придумывай формулу индекса.`

const STOPS_SYSTEM_PROMPT = `Ты — ИИ-Ассистент модуля «Остановки» платформы «Вектор Города».
Режим: «Остановки». Работай только с остановками и новыми текущими таблицами/инструментами по остановочным пунктам.

Приоритеты:
- Для вопросов о текущей загруженности, людях на остановках, пиках и наблюдениях используй функцию get_stop_current_load_summary.
- Для вопросов о безопасности, курении, лежачих людях, оставленных предметах и собаках без людей используй функцию get_stop_safety_events.
- Для узких вопросов о событиях «лежачий человек» можешь использовать функцию get_stop_lying_person_events.
- Если пользователь просит график, диаграмму или визуальное сравнение, сначала получи live-данные инструментом, затем используй create_plot.
- Для структуры доступных режимов и разделения «Текущие / План» используй list_assistant_data_modes.
- Если пользователь просит сравнение с планом или BI-панелями, объясни границу: live-данные подтверждаются инструментами, плановые панели используются как аналитический контур без прямого чтения iframe.
- Для нестандартных вопросов по live-данным остановок можешь сам написать read-only SQL SELECT и вызвать query_stop_supabase_readonly. Сначала получи строки, затем агрегируй, сравни, при необходимости построй bar chart через build_bar_chart.

Ограничения:
- Не отвечай по дорогам, берегу, парку и транспорту в этом режиме; предложи переключиться в режим «Платформа».
- Не выдумывай значения, тренды и причины без результатов инструментов.
- Давай оценку ситуации только из фактов инструментов: где нагрузка выше, какие события повторяются, что требует внимания диспетчера.
- Не пиши внутренние названия таблиц, если пользователь сам не просит.
- Режим «Остановки» берет live-данные из Supabase-источника остановок. Не смешивай его с платформенным SQL-контуром, кроме объяснения границ данных.
- Никогда не пытайся писать destructive SQL. Только SELECT по доступным live-таблицам.
${QUALITY_ANSWER_RULES}`

function normalizeMcpUrl(rawUrl: string) {
    const url = new URL(rawUrl)

    if (url.pathname === "/sse") {
        url.pathname = "/mcp"
        return url.toString()
    }

    if (url.pathname === "/" || url.pathname === "") {
        url.pathname = "/mcp"
    }

    return url.toString()
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), ms)
        }),
    ])
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripToolTags(text: string) {
    return text.replace(TOOL_TAG_CLEAN_PATTERN, "").trim()
}

function normalizeQuickText(text: string) {
    return stripToolTags(text)
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[«»"'.?,:;!()[\]{}]/g, " ")
        .replace(/[–—-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function formatDateTimeForUser(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
        return "-"
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return value
    }

    return new Intl.DateTimeFormat("ru-RU", {
        timeZone: SURGUT_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date).replace(",", "")
}

function normalizeDateTimesForUser(text: string) {
    return text.replace(ISO_DATE_TIME_PATTERN, (value) => formatDateTimeForUser(value))
}

function resetConnection() {
    mcpConnected = false
    mcpClient = null
}

async function connectMCP(): Promise<Client | null> {
    const token = process.env.MCP_API_KEY

    if (mcpConnected && mcpClient) {
        try {
            await withTimeout(mcpClient.listTools(), MCP_PING_TIMEOUT, "MCP ping timeout")
            return mcpClient
        } catch (error) {
            console.warn("MCP connection stale, reconnecting.", error)
            resetConnection()
        }
    }

    try {
        const requestInit = token
            ? { headers: { Authorization: `Bearer ${token}` } }
            : undefined
        const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL), {
            requestInit,
        })

        const nextClient = new Client(
            { name: "vector-goroda-gigachat-client", version: "2.0.0" },
            { capabilities: {} }
        )

        await withTimeout(nextClient.connect(transport), MCP_CONNECT_TIMEOUT, "MCP connection timeout")
        mcpClient = nextClient
        mcpConnected = true
        return mcpClient
    } catch (error) {
        console.error("Failed to connect to MCP server.", error)
        resetConnection()
        return null
    }
}

function extractTextFromMessage(message: UIMessage) {
    const candidate = message as UIMessage & {
        content?: unknown
        parts?: Array<{ type?: string; text?: unknown }>
    }

    if (typeof candidate.content === "string") {
        return candidate.content
    }

    if (Array.isArray(candidate.parts)) {
        return candidate.parts
            .map((part) => part.type === "text" && typeof part.text === "string" ? part.text : "")
            .filter((text) => text.length > 0)
            .join("\n")
    }

    return ""
}

function toGigaChatMessages(messages: UIMessage[], systemPrompt: string): GigaChatMessage[] {
    const result: GigaChatMessage[] = [{ role: "system", content: systemPrompt }]

    for (const message of messages) {
        if (message.role !== "user" && message.role !== "assistant") {
            continue
        }

        const content = stripToolTags(extractTextFromMessage(message)).trim()
        if (!content) {
            continue
        }

        result.push({ role: message.role, content })
    }

    return result
}

function getAssistantMode(value: unknown): AssistantMode {
    return value === "stops" ? "stops" : "platform"
}

function getSystemPrompt(mode: AssistantMode) {
    return mode === "stops" ? STOPS_SYSTEM_PROMPT : PLATFORM_SYSTEM_PROMPT
}

function isStopsTool(tool: MCPToolDefinition) {
    const name = tool.name.toLowerCase()
    const description = (tool.description || "").toLowerCase()

    return (
        name.includes("stop") ||
        name.includes("busyness") ||
        name.includes("safety") ||
        name.includes("lying_person") ||
        name.includes("plot") ||
        name.includes("assistant_data_modes") ||
        description.includes("график") ||
        description.includes("событ") ||
        description.includes("останов") ||
        description.includes("stop")
    )
}

function filterToolsForMode(tools: MCPToolDefinition[], mode: AssistantMode) {
    if (mode === "platform") {
        return tools
    }

    return tools.filter(isStopsTool)
}

function resolveJsonSchemaRef(schema: unknown, root: MCPToolSchema): unknown {
    if (!schema || typeof schema !== "object") {
        return schema
    }

    const candidate = schema as MCPToolSchema
    if (!candidate.$ref?.startsWith("#/$defs/")) {
        return schema
    }

    const name = candidate.$ref.slice("#/$defs/".length)
    return root.$defs?.[name] || schema
}

function sanitizeJsonSchema(schema: unknown, root: MCPToolSchema): Record<string, unknown> {
    const resolved = resolveJsonSchemaRef(schema, root)

    if (!resolved || typeof resolved !== "object") {
        return { type: "string" }
    }

    const source = resolved as MCPToolSchema

    if (Array.isArray(source.anyOf)) {
        const nonNull = source.anyOf.find((item) => {
            return !(item && typeof item === "object" && (item as MCPToolSchema).type === "null")
        })
        return sanitizeJsonSchema(nonNull || source.anyOf[0], root)
    }

    const output: Record<string, unknown> = {}

    if (source.description) {
        output.description = source.description
    }

    if (source.enum) {
        output.enum = source.enum
    }

    if (source.properties) {
        output.type = "object"
        output.properties = Object.fromEntries(
            Object.entries(source.properties).map(([key, value]) => [
                key,
                sanitizeJsonSchema(value, root),
            ])
        )

        if (Array.isArray(source.required) && source.required.length > 0) {
            output.required = source.required
        }

        return output
    }

    if (source.type === "array") {
        output.type = "array"
        output.items = sanitizeJsonSchema(source.items || { type: "string" }, root)
        return output
    }

    output.type = source.type || "string"
    return output
}

function sanitizeToolParameters(schema?: MCPToolSchema) {
    const root = schema && schema.type === "object"
        ? schema
        : { type: "object", properties: {}, required: [] }

    return sanitizeJsonSchema(root, root) as {
        type: "object"
        properties?: Record<string, unknown>
        required?: string[]
    }
}

function toGigaFunction(tool: MCPToolDefinition): GigaChatFunctionDefinition {
    return {
        name: tool.name,
        description: tool.description || `MCP tool ${tool.name}`,
        parameters: sanitizeToolParameters(tool.inputSchema),
    }
}

function parseForcedToolName(messages: UIMessage[]) {
    const lastUserText = [...messages].reverse().find((message) => message.role === "user")
    const match = lastUserText ? extractTextFromMessage(lastUserText).match(TOOL_TAG_PATTERN) : null
    return match?.[1] || null
}

function getLastUserText(messages: UIMessage[]) {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")
    return lastUserMessage ? extractTextFromMessage(lastUserMessage) : ""
}

function isPlotRequest(text: string) {
    return /график|диаграмм|визуал|chart|plot/i.test(text)
}

function isSafetyRequest(text: string) {
    return /событ|безопас|курен|лежач|предмет|собак|alert|smoking|lying/i.test(text)
}

function isLoadRequest(text: string) {
    return /загруж|нагруж|нагруз|люд|пассаж|пик|очеред|толп|посещаем/i.test(text)
}

function isStopLoadTrashRelationRequest(text: string) {
    const normalized = normalizeQuickText(text)
    const asksRelation = /связ|коррел|завис|влия|сравн|совпад/.test(normalized)
    const mentionsLoad = isLoadRequest(normalized)
    const mentionsTrash = /урн|мусор|переполн|заполн/.test(normalized)

    return asksRelation && mentionsLoad && mentionsTrash
}

function isTablesRequest(text: string) {
    return /таблиц|схем|структур|баз[аеуы]? данных|доступн.*данн/i.test(text)
}

function isDataModesRequest(text: string) {
    return /live-данн|live данн|доступн.*данн|какие.*данн|планов|плановые|режим.*данн|текущ.*план/i.test(text)
}

function parseToolArguments(args: unknown): Record<string, unknown> {
    if (!args) {
        return {}
    }

    if (typeof args === "string") {
        const trimmed = args.trim()
        if (!trimmed) {
            return {}
        }

        try {
            const parsed = JSON.parse(trimmed)
            return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {}
        } catch {
            return {}
        }
    }

    return typeof args === "object" ? args as Record<string, unknown> : {}
}

function extractToolText(result: unknown) {
    const mcpResult = result as MCPToolResult
    const textParts = Array.isArray(mcpResult.content)
        ? mcpResult.content
            .filter((item) => item.type === "text" && typeof item.text === "string")
            .map((item) => item.text)
        : []

    if (textParts.length > 0) {
        return textParts.join("\n")
    }

    return JSON.stringify(result)
}

async function callMcpTool(client: Client, name: string, args: Record<string, unknown>) {
    const result = await withTimeout(
        client.callTool({ name, arguments: args }),
        MCP_CALL_TOOL_TIMEOUT,
        `Tool '${name}' timeout after ${MCP_CALL_TOOL_TIMEOUT}ms`
    )

    return extractToolText(result)
}

function formatMcpUnavailable(requestKind: string) {
    return [
        "Сейчас не удалось подключиться к live-источнику аналитики остановок.",
        `Запрос: ${requestKind}.`,
        "Я не буду придумывать текущие значения. Для администратора: проверьте health-endpoint аналитики, настройки подключения и сетевой доступ сайта к серверу аналитики.",
    ].join("\n")
}

function formatModelUnavailable() {
    return [
        "Сейчас не удалось сформировать подтвержденный аналитический ответ.",
        "Я не буду подставлять неподтвержденные выводы. Повторите запрос позже или уточните модуль/период; по live-данным остановок я сначала проверяю фактические источники.",
    ].join("\n")
}

function formatForcedToolUnavailable(toolName: string, mode: AssistantMode) {
    const sourceLabel = mode === "stops"
        ? "live-источник остановок"
        : "платформенный аналитический контур"

    return [
        "Сейчас не удалось вызвать нужный аналитический инструмент для этого вопроса.",
        `Нужный источник: ${sourceLabel}.`,
        "Я не буду делать вид, что посчитал данные. Проверьте доступность аналитического сервера и повторите запрос; после восстановления источника я сам получу данные, сгруппирую их и дам нормальный вывод.",
        `Техническая метка для диагностики: ${toolName}.`,
    ].join("\n")
}

function toGigaFunctionResultContent(toolName: string, output: string) {
    const trimmed = output.trim()
    const compacted = trimmed.length > MAX_FUNCTION_RESULT_CHARS
        ? JSON.stringify({
            ok: true,
            tool: toolName,
            truncated: true,
            text: `${trimmed.slice(0, MAX_FUNCTION_RESULT_CHARS)}\n...`,
        })
        : trimmed

    if (compacted) {
        try {
            JSON.parse(compacted)
            return compacted
        } catch {
            // GigaChat requires role:function content to be a JSON string.
        }
    }

    return JSON.stringify({
        ok: false,
        tool: toolName,
        text: output,
    })
}

function getDefaultToolArguments(tool: MCPToolDefinition): Record<string, unknown> | null {
    const schema = tool.inputSchema
    const required = schema?.required || []

    if (required.length === 0) {
        return {}
    }

    if (schema && required.length === 1 && required[0] === "input") {
        const inputSchema = schema.properties?.input
        const resolved = resolveJsonSchemaRef(inputSchema, schema)
        const resolvedSchema = resolved && typeof resolved === "object" ? resolved as MCPToolSchema : null
        const innerRequired = resolvedSchema?.required || []

        if (innerRequired.length === 0) {
            return { input: {} }
        }
    }

    return null
}

function getFunctionCall(message?: GigaChatMessage): GigaChatFunctionCall | null {
    if (!message?.function_call?.name) {
        return null
    }

    return message.function_call
}

function hasUnansweredFunctionResult(messages: GigaChatMessage[]) {
    let lastFunctionIndex = -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === "function") {
            lastFunctionIndex = index
            break
        }
    }

    if (lastFunctionIndex < 0) {
        return false
    }

    return !messages
        .slice(lastFunctionIndex + 1)
        .some((message) => message.role === "assistant" && Boolean(message.content?.trim()))
}

function buildFinalAnswerInstruction(mode: AssistantMode, toolName: string | null) {
    const modeSourceRule = mode === "stops"
        ? "Ты работаешь с live-источником остановок. Не смешивай эти факты с платформенным SQL-контуром."
        : "Ты работаешь с платформенным аналитическим контуром. Не подменяй его live-источником остановок."

    return [
        "Сформируй финальный ответ высокого качества по результатам данных инструмента.",
        modeSourceRule,
        toolName ? `Использованный инструмент: ${toolName}. Не выводи это название пользователю, если он не просил технические детали.` : "",
        "Не отвечай короткой заготовкой. Дай разбор: вывод, факты, интерпретация, действия, ограничения данных.",
        "Если в данных есть строки, сгруппируй и сравни их: топы, пики, повторяемость, аномалии, приоритеты.",
        "Все даты и время переводи в формат дд.мм.гггг чч:мм по времени Сургута. ISO-строки в ответе запрещены.",
        "Если данных недостаточно для причинно-следственного вывода, прямо отдели факт от гипотезы.",
    ].filter(Boolean).join("\n")
}

function pushFunctionResultForSynthesis(
    messages: GigaChatMessage[],
    mode: AssistantMode,
    toolName: string,
    output: string,
    args: Record<string, unknown> = {},
) {
    messages.push({
        role: "system",
        content: buildFinalAnswerInstruction(mode, toolName),
    })
    messages.push({
        role: "assistant",
        content: "",
        function_call: { name: toolName, arguments: args },
    })
    messages.push({
        role: "function",
        name: toolName,
        content: toGigaFunctionResultContent(toolName, output),
    })
}

async function runDirectNoArgTool(
    mcp: Client | null,
    messages: GigaChatMessage[],
    mode: AssistantMode,
    forcedTool: MCPToolDefinition | null
): Promise<string | null> {
    if (!mcp || !forcedTool) {
        return null
    }

    const defaultArgs = getDefaultToolArguments(forcedTool)
    if (!defaultArgs) {
        messages.push({
            role: "system",
            content: [
                `Пользователь выбрал готовый аналитический сценарий. Обязательно вызови функцию ${forcedTool.name}.`,
                "Сам сформируй обязательные аргументы из вопроса и доступного контекста.",
                "Не отвечай описанием функции и не проси пользователя прислать данные, если функция может сама получить их из источника.",
            ].join("\n"),
        })
        return null
    }

    const output = await callMcpTool(mcp, forcedTool.name, defaultArgs)
    pushFunctionResultForSynthesis(messages, mode, forcedTool.name, output, defaultArgs)
    return output
}

function formatMcpFallback(toolName: string, output: string) {
    const formatted = formatKnownToolOutput(toolName, output)
    if (formatted) {
        return normalizeDateTimesForUser([
            "Показываю сводку по подтвержденным live-данным:",
            "",
            formatted,
        ].join("\n"))
    }

    const clippedOutput = output.length > 4000 ? `${output.slice(0, 4000)}\n...` : output

    return normalizeDateTimesForUser([
        "Данные получены, но сейчас не удалось собрать полноценный аналитический текст.",
        `Техническая метка инструмента: ${toolName}.`,
        "Ниже исходные данные без дополнительной интерпретации:",
        "",
        clippedOutput,
    ].join("\n"))
}

function asNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getSupabaseDirectClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
        return null
    }

    return createSupabaseClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}

function hoursAgoIso(hours: number) {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

async function runSupabaseQuery<T>(
    factory: () => PromiseLike<SupabaseQueryResult<T>>,
    attempts = 2,
) {
    let lastResult: SupabaseQueryResult<T> | null = null

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const result = await factory()
        lastResult = result

        if (!result.error) {
            return result
        }

        const message = result.error.message || ""
        if (!/fetch failed|network|timeout/i.test(message) || attempt === attempts) {
            return result
        }

        await wait(250 * attempt)
    }

    return lastResult as SupabaseQueryResult<T>
}

function getStopDisplayName(locationId: string) {
    const complex = getStopComplexByLocationId(locationId)
    return complex?.stopName || `Остановочное направление ${locationId}`
}

function getStopCameraIndexCandidates(cameraIndex: number | null) {
    if (cameraIndex === null) {
        return []
    }

    const candidates = [cameraIndex]
    if (cameraIndex >= 10000) {
        candidates.push(cameraIndex - 10000)
    }

    return candidates
}

function getStopLocationIdFromAlert(row: Pick<StopAlertRow, "metadata" | "camera_index">) {
    const metadataLocation = row.metadata?.location_id ?? row.metadata?.locationId ?? row.metadata?.stop_location_id
    if (typeof metadataLocation === "string" && metadataLocation.trim()) {
        return metadataLocation.trim()
    }

    for (const cameraIndex of getStopCameraIndexCandidates(row.camera_index)) {
        const complex = getStopComplexByCameraIndex(cameraIndex)
        if (complex) {
            return complex.locationId
        }
    }

    return null
}

async function fetchDirectStopLoadSummary(hours = 24, limit = 8) {
    const supabase = getSupabaseDirectClient()

    if (!supabase) {
        throw new Error("Supabase env is not configured")
    }

    const [windowResult, firstResult] = await Promise.all([
        runSupabaseQuery<BusynessWindowRow[]>(() => supabase
            .from("busyness_windows")
            .select("location_id,window_start,window_end,person_count_avg,person_count_max,sample_count")
            .gte("window_start", hoursAgoIso(hours))
            .order("window_start", { ascending: false })
            .limit(5000)),
        runSupabaseQuery<Array<{ window_start: string }>>(() => supabase
            .from("busyness_windows")
            .select("window_start")
            .order("window_start", { ascending: true })
            .limit(1)),
    ])

    if (windowResult.error) {
        throw new Error(windowResult.error.message)
    }

    const grouped = new Map<string, {
        location_id: string
        name: string
        avgSum: number
        avgCount: number
        peak_people: number
        sample_count: number
        windows: number
        zero_sample_windows: number
        low_sample_windows: number
        latest_window: string
        first_seen_in_window: string
    }>()

    for (const row of (windowResult.data || []) as BusynessWindowRow[]) {
        const current = grouped.get(row.location_id) || {
            location_id: row.location_id,
            name: getStopDisplayName(row.location_id),
            avgSum: 0,
            avgCount: 0,
            peak_people: 0,
            sample_count: 0,
            windows: 0,
            zero_sample_windows: 0,
            low_sample_windows: 0,
            latest_window: row.window_start,
            first_seen_in_window: row.window_start,
        }
        const avg = asNumber(row.person_count_avg)
        const peak = asNumber(row.person_count_max)
        const samples = asNumber(row.sample_count) ?? 0

        if (avg !== null) {
            current.avgSum += avg
            current.avgCount += 1
        }
        current.peak_people = Math.max(current.peak_people, peak ?? 0)
        current.sample_count += samples
        current.windows += 1
        current.zero_sample_windows += samples === 0 ? 1 : 0
        current.low_sample_windows += samples <= 1 ? 1 : 0
        if (row.window_start > current.latest_window) {
            current.latest_window = row.window_start
        }
        if (row.window_start < current.first_seen_in_window) {
            current.first_seen_in_window = row.window_start
        }
        grouped.set(row.location_id, current)
    }

    const rows = [...grouped.values()]
        .map((row) => ({
            location_id: row.location_id,
            name: row.name,
            avg_people: row.avgCount > 0 ? Number((row.avgSum / row.avgCount).toFixed(1)) : 0,
            peak_people: row.peak_people,
            sample_count: row.sample_count,
            windows: row.windows,
            zero_sample_windows: row.zero_sample_windows,
            low_sample_windows: row.low_sample_windows,
            latest_window: row.latest_window,
            first_seen_in_window: row.first_seen_in_window,
        }))
        .sort((a, b) => {
            return (
                b.avg_people - a.avg_people ||
                b.peak_people - a.peak_people ||
                a.zero_sample_windows - b.zero_sample_windows ||
                a.low_sample_windows - b.low_sample_windows
            )
        })
        .slice(0, limit)
    const fallbackStartedAt = rows
        .map((row) => row.first_seen_in_window)
        .filter(Boolean)
        .sort()[0] || null

    return JSON.stringify({
        ok: true,
        source: "supabase-direct-fallback",
        latest_window: rows[0]?.latest_window || null,
        recording_started_at: firstResult.error
            ? fallbackStartedAt
            : ((firstResult.data || [])[0] as { window_start?: string } | undefined)?.window_start || fallbackStartedAt,
        rows,
    })
}

function isStopConditionSourceMissing(error: SupabaseQueryResult<unknown>["error"]) {
    const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`
    return /PGRST205|schema cache|stop_condition_windows|Could not find the table/i.test(text)
}

function computePearsonCorrelation(points: Array<{ x: number; y: number }>) {
    const clean = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    if (clean.length < 2) {
        return null
    }

    const avgX = clean.reduce((sum, point) => sum + point.x, 0) / clean.length
    const avgY = clean.reduce((sum, point) => sum + point.y, 0) / clean.length
    let numerator = 0
    let denominatorX = 0
    let denominatorY = 0

    for (const point of clean) {
        const dx = point.x - avgX
        const dy = point.y - avgY
        numerator += dx * dy
        denominatorX += dx * dx
        denominatorY += dy * dy
    }

    const denominator = Math.sqrt(denominatorX * denominatorY)
    if (denominator === 0) {
        return null
    }

    return Number((numerator / denominator).toFixed(2))
}

function describeCorrelation(value: number | null) {
    if (value === null) {
        return "недостаточно сопоставимых точек для расчета коэффициента"
    }

    const abs = Math.abs(value)
    if (abs >= 0.7) {
        return value > 0 ? "сильная положительная связь" : "сильная обратная связь"
    }
    if (abs >= 0.4) {
        return value > 0 ? "умеренная положительная связь" : "умеренная обратная связь"
    }
    if (abs >= 0.2) {
        return value > 0 ? "слабая положительная связь" : "слабая обратная связь"
    }

    return "устойчивой линейной связи не видно"
}

async function fetchDirectStopLoadTrashRelation(hours = 336) {
    const supabase = getSupabaseDirectClient()

    if (!supabase) {
        return JSON.stringify({
            ok: false,
            kind: "stop_load_trash_relation",
            reason: "supabase_not_configured",
            message: "Live-источник остановок не настроен.",
        })
    }

    const since = hoursAgoIso(hours)
    const [loadResult, trashWindowResult, trashAlertResult] = await Promise.all([
        runSupabaseQuery<BusynessWindowRow[]>(() => supabase
            .from("busyness_windows")
            .select("location_id,window_start,window_end,person_count_avg,person_count_max,sample_count")
            .gte("window_start", since)
            .order("window_start", { ascending: false })
            .limit(5000)),
        runSupabaseQuery<StopConditionWindowRow[]>(() => supabase
            .from("stop_condition_windows")
            .select("location_id,window_start,window_end,trash_fill_avg,trash_fill_max,sample_count,created_at")
            .gte("window_start", since)
            .order("window_start", { ascending: false })
            .limit(5000)),
        runSupabaseQuery<StopAlertRow[]>(() => supabase
            .from("alerts")
            .select("alert_type,severity,message,metadata,timestamp,camera_index")
            .in("module_name", STOP_ALERT_MODULE_NAMES)
            .in("alert_type", STOP_TRASH_OVERFLOW_ALERT_TYPES)
            .gte("timestamp", since)
            .order("timestamp", { ascending: false })
            .limit(5000)),
    ])

    if (loadResult.error) {
        return JSON.stringify({
            ok: false,
            kind: "stop_load_trash_relation",
            reason: "load_source_unavailable",
            message: loadResult.error.message || "Не удалось получить загруженность остановок.",
        })
    }

    const loadRows = (loadResult.data || []) as BusynessWindowRow[]
    const windowRows = trashWindowResult.error ? [] : ((trashWindowResult.data || []) as StopConditionWindowRow[])
    const alertRows = trashAlertResult.error ? [] : ((trashAlertResult.data || []) as StopAlertRow[])
    const trashSource = windowRows.length > 0 ? "condition_windows" : "alerts"

    if (windowRows.length === 0 && alertRows.length === 0) {
        return JSON.stringify({
            ok: false,
            kind: "stop_load_trash_relation",
            reason: trashWindowResult.error && isStopConditionSourceMissing(trashWindowResult.error)
                ? "trash_source_not_connected"
                : "trash_source_empty",
            message: trashWindowResult.error?.message || trashAlertResult.error?.message || "Не удалось получить события или окна переполненности урн.",
            period_hours: hours,
            load_locations: new Set(loadRows.map((row) => row.location_id)).size,
            latest_load_window: loadRows[0]?.window_start || null,
        })
    }

    const loadByLocation = new Map<string, {
        location_id: string
        name: string
        avg_sum: number
        avg_count: number
        peak_people: number
        sample_count: number
        windows: number
        latest_window: string
    }>()
    const trashByLocation = new Map<string, {
        location_id: string
        fill_sum: number
        fill_count: number
        max_fill: number
        sample_count: number
        windows: number
        events: number
        problem_windows: number
        critical_windows: number
        latest_window: string
    }>()

    for (const row of loadRows) {
        const current = loadByLocation.get(row.location_id) || {
            location_id: row.location_id,
            name: getStopDisplayName(row.location_id),
            avg_sum: 0,
            avg_count: 0,
            peak_people: 0,
            sample_count: 0,
            windows: 0,
            latest_window: row.window_start,
        }
        const avg = asNumber(row.person_count_avg)
        const peak = asNumber(row.person_count_max)
        if (avg !== null) {
            current.avg_sum += avg
            current.avg_count += 1
        }
        current.peak_people = Math.max(current.peak_people, peak ?? 0)
        current.sample_count += asNumber(row.sample_count) ?? 0
        current.windows += 1
        if (row.window_start > current.latest_window) {
            current.latest_window = row.window_start
        }
        loadByLocation.set(row.location_id, current)
    }

    if (trashSource === "condition_windows") {
        for (const row of windowRows) {
            const current = trashByLocation.get(row.location_id) || {
                location_id: row.location_id,
                fill_sum: 0,
                fill_count: 0,
                max_fill: 0,
                sample_count: 0,
                windows: 0,
                events: 0,
                problem_windows: 0,
                critical_windows: 0,
                latest_window: row.window_start,
            }
            const avgFill = asNumber(row.trash_fill_avg)
            const maxFill = asNumber(row.trash_fill_max)
            if (avgFill !== null) {
                current.fill_sum += avgFill
                current.fill_count += 1
            }
            current.max_fill = Math.max(current.max_fill, maxFill ?? 0)
            current.sample_count += asNumber(row.sample_count) ?? 0
            current.problem_windows += (maxFill ?? avgFill ?? 0) >= 70 ? 1 : 0
            current.critical_windows += (maxFill ?? avgFill ?? 0) >= 90 ? 1 : 0
            current.windows += 1
            if (row.window_start > current.latest_window) {
                current.latest_window = row.window_start
            }
            trashByLocation.set(row.location_id, current)
        }
    } else {
        for (const row of alertRows) {
            const locationId = getStopLocationIdFromAlert(row)
            if (!locationId) {
                continue
            }
            const current = trashByLocation.get(locationId) || {
                location_id: locationId,
                fill_sum: 0,
                fill_count: 0,
                max_fill: 100,
                sample_count: 0,
                windows: 0,
                events: 0,
                problem_windows: 0,
                critical_windows: 0,
                latest_window: row.timestamp,
            }
            const severity = asNumber(row.severity)
            current.events += 1
            current.problem_windows += 1
            current.critical_windows += severity !== null && severity >= 4 ? 1 : 0
            current.windows += 1
            current.max_fill = Math.max(current.max_fill, 100)
            if (row.timestamp > current.latest_window) {
                current.latest_window = row.timestamp
            }
            trashByLocation.set(locationId, current)
        }
    }

    const rows = [...loadByLocation.values()]
        .map((load) => {
            const trash = trashByLocation.get(load.location_id)
            if (!trash) {
                return null
            }
            const avgPeople = load.avg_count > 0 ? load.avg_sum / load.avg_count : 0
            const avgTrashFill = trash.fill_count > 0 ? trash.fill_sum / trash.fill_count : 0
            const trashSignal = trashSource === "condition_windows" ? avgTrashFill : trash.events
            const riskScore = avgPeople * 10 + trashSignal * (trashSource === "condition_windows" ? 1 : 12) + trash.problem_windows * 5 + trash.critical_windows * 10

            return {
                location_id: load.location_id,
                name: load.name,
                avg_people: Number(avgPeople.toFixed(1)),
                peak_people: load.peak_people,
                load_windows: load.windows,
                avg_trash_fill: trashSource === "condition_windows" ? Number(avgTrashFill.toFixed(1)) : null,
                max_trash_fill: trashSource === "condition_windows" ? Number(trash.max_fill.toFixed(1)) : null,
                trash_events: trash.events,
                trash_windows: trash.windows,
                problem_windows: trash.problem_windows,
                critical_windows: trash.critical_windows,
                latest_load_window: load.latest_window,
                latest_trash_window: trash.latest_window,
                risk_score: Number(riskScore.toFixed(1)),
            }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort((a, b) => b.risk_score - a.risk_score)

    const correlationAvg = computePearsonCorrelation(rows.map((row) => ({
        x: row.avg_people,
        y: trashSource === "condition_windows" ? (row.avg_trash_fill ?? 0) : row.trash_events,
    })))
    const correlationMax = computePearsonCorrelation(rows.map((row) => ({
        x: row.peak_people,
        y: trashSource === "condition_windows" ? (row.max_trash_fill ?? 0) : row.trash_events,
    })))

    return JSON.stringify({
        ok: true,
        kind: "stop_load_trash_relation",
        period_hours: hours,
        trash_source: trashSource,
        trash_metric_label: trashSource === "condition_windows"
            ? "заполненность урн"
            : "события переполненных урн",
        load_locations: loadByLocation.size,
        trash_locations: trashByLocation.size,
        trash_events: alertRows.length,
        common_locations: rows.length,
        latest_load_window: loadRows[0]?.window_start || null,
        latest_trash_window: trashSource === "condition_windows"
            ? windowRows[0]?.window_start || null
            : alertRows[0]?.timestamp || null,
        correlation_avg: correlationAvg,
        correlation_avg_label: describeCorrelation(correlationAvg),
        correlation_max: correlationMax,
        correlation_max_label: describeCorrelation(correlationMax),
        problem_locations: rows.filter((row) => trashSource === "condition_windows" ? (row.max_trash_fill ?? 0) >= 70 : row.trash_events > 0).length,
        critical_locations: rows.filter((row) => trashSource === "condition_windows" ? (row.max_trash_fill ?? 0) >= 90 : row.critical_windows > 0).length,
        rows: rows.slice(0, 12),
        note: "Analyze whether load and overflowing trash bins move together. Separate correlation from causation.",
    })
}

async function fetchDirectStopSafetyEvents(hours = 24, limit = 30, onlyLyingPerson = false) {
    const supabase = getSupabaseDirectClient()

    if (!supabase) {
        throw new Error("Supabase env is not configured")
    }

    const { data, error } = await runSupabaseQuery<StopAlertRow[]>(() => {
        let query = supabase
            .from("alerts")
            .select("alert_type,severity,message,metadata,timestamp,camera_index")
            .eq("module_name", "stops")
            .gte("timestamp", hoursAgoIso(hours))
            .order("timestamp", { ascending: false })
            .limit(limit)

        if (onlyLyingPerson) {
            query = query.eq("alert_type", "lying_person")
        } else {
            query = query.in("alert_type", [...STOP_SAFETY_ALERT_TYPES])
        }

        return query
    })

    if (error) {
        throw new Error(error.message)
    }

    const rows = (data || []) as StopAlertRow[]
    const grouped = new Map<string, {
        alert_type: string
        label: string
        events_count: number
        affected_locations: Set<string>
        latest_event: string
    }>()

    for (const row of rows) {
        const label = STOP_SAFETY_ALERT_LABELS[row.alert_type as keyof typeof STOP_SAFETY_ALERT_LABELS] || row.alert_type
        const current = grouped.get(row.alert_type) || {
            alert_type: row.alert_type,
            label,
            events_count: 0,
            affected_locations: new Set<string>(),
            latest_event: row.timestamp,
        }
        current.events_count += 1
        if (typeof row.metadata?.location_id === "string") {
            current.affected_locations.add(row.metadata.location_id)
        }
        if (row.timestamp > current.latest_event) {
            current.latest_event = row.timestamp
        }
        grouped.set(row.alert_type, current)
    }

    return JSON.stringify({
        ok: true,
        source: "supabase-direct-fallback",
        latest_event: rows[0]?.timestamp || null,
        summary: [...grouped.values()].map((row) => ({
            alert_type: row.alert_type,
            label: row.label,
            events_count: row.events_count,
            affected_locations: row.affected_locations.size,
            latest_event: row.latest_event,
        })),
        rows,
    })
}

async function callDirectSupabaseStopTool(toolName: string) {
    if (toolName === "get_stop_current_load_summary") {
        return fetchDirectStopLoadSummary(72, 12)
    }

    if (toolName === "get_stop_safety_events") {
        return fetchDirectStopSafetyEvents(24, 30)
    }

    if (toolName === "get_stop_lying_person_events") {
        return fetchDirectStopSafetyEvents(168, 30, true)
    }

    return null
}

function formatKnownToolOutput(toolName: string, output: string) {
    const trimmedOutput = output.trim()
    const isPlotTool = toolName === "create_plot" || toolName === "build_bar_chart"
    if (isPlotTool && /^\/plots\/plot_\d+\.png$/.test(trimmedOutput)) {
        return `График построен: ${trimmedOutput}.`
    }

    let payload: Record<string, unknown>

    try {
        payload = JSON.parse(trimmedOutput) as Record<string, unknown>
    } catch {
        return null
    }

    if (payload.kind === "stop_load_trash_relation") {
        return formatStopLoadTrashRelationPayload(payload)
    }

    if (payload.ok === false) {
        return [
            "Источник данных сейчас недоступен или вернул ошибку.",
            payload.message ? String(payload.message) : "Текущие значения не подтверждены, поэтому я не буду делать выводы по ним.",
            payload.error ? `Техническая причина: ${String(payload.error).slice(0, 300)}` : "",
        ].filter(Boolean).join("\n")
    }

    if (toolName === "get_stop_current_load_summary") {
        const rows = Array.isArray(payload.rows) ? payload.rows as Array<Record<string, unknown>> : []
        if (rows.length === 0) {
            return "По текущей загруженности остановок строки не вернулись. Проверь период или наличие свежих данных в аналитике."
        }

        const topRows = rows.slice(0, 5).map((row, index) => {
            const avg = asNumber(row.avg_people)
            const peak = asNumber(row.peak_people)
            const zeroSampleWindows = asNumber(row.zero_sample_windows)
            const lowSampleWindows = asNumber(row.low_sample_windows)
            const qualityNote = zeroSampleWindows !== null || lowSampleWindows !== null
                ? ` Качество ряда: окон без кадров ${zeroSampleWindows ?? 0}, окон с низкой выборкой ${lowSampleWindows ?? 0}.`
                : ""
            return `${index + 1}. ${row.name || row.location_id}: средняя загрузка ${avg ?? "-"}, пик ${peak ?? "-"} человек.${qualityNote}`
        })

        return [
            `По подтвержденным live-данным остановок последнее окно: ${formatDateTimeForUser(payload.latest_window)}.`,
            payload.recording_started_at ? `Запись загруженности в источнике начинается с ${formatDateTimeForUser(payload.recording_started_at)}.` : "",
            "Самые нагруженные направления:",
            ...topRows,
            "Оценка: внимание диспетчера в первую очередь на направления с высоким пиком и стабильной средней загрузкой.",
        ].filter(Boolean).join("\n")
    }

    if (toolName === "get_stop_safety_events" || toolName === "get_stop_lying_person_events") {
        const summary = Array.isArray(payload.summary) ? payload.summary as Array<Record<string, unknown>> : []
        const rows = Array.isArray(payload.rows) ? payload.rows as Array<Record<string, unknown>> : []

        if (summary.length === 0 && rows.length === 0) {
            return "По событиям безопасности остановок строки не вернулись. В выбранном окне нет подтвержденных событий или источник сейчас пуст."
        }

        const grouped = new Map<string, { count: number; locations: number; latest: string }>()
        for (const row of summary) {
            const label = String(row.label || row.alert_type || "событие")
            const current = grouped.get(label) || { count: 0, locations: 0, latest: "" }
            current.count += Number(row.events_count || 0)
            current.locations = Math.max(current.locations, Number(row.affected_locations || 0))
            const latest = String(row.latest_event || "")
            if (latest > current.latest) {
                current.latest = latest
            }
            grouped.set(label, current)
        }
        const summaryRows = [...grouped.entries()].slice(0, 6).map(([label, value]) => {
            return `- ${label}: ${value.count} событий, локаций: ${value.locations || "-"}, последнее: ${formatDateTimeForUser(value.latest)}.`
        })

        return [
            `По подтвержденным live-событиям остановок последнее событие: ${formatDateTimeForUser(payload.latest_event)}.`,
            "Сводка по событиям:",
            ...summaryRows,
            "Оценка: повторяемые события и высокая severity требуют первичной проверки диспетчером.",
        ].join("\n")
    }

    if (isPlotTool) {
        const markdown = typeof payload.markdown === "string" ? payload.markdown : ""
        const path = typeof payload.url === "string"
            ? payload.url
            : typeof payload.path === "string"
                ? payload.path
                : ""

        return [
            "График построен.",
            markdown || path,
        ].filter(Boolean).join("\n")
    }

    if (toolName === "list_tables") {
        const sqlTables = Array.isArray(payload.sql_tables) ? payload.sql_tables as Array<Record<string, unknown>> : []
        const stopTables = Array.isArray((payload.stops_live_source as { tables?: unknown[] } | undefined)?.tables)
            ? (payload.stops_live_source as { tables: Array<Record<string, unknown>> }).tables
            : []
        const tableRows = sqlTables.slice(0, 20).map((row) => `- ${row.table_schema}.${row.table_name} (${row.table_type})`)
        const stopRows = stopTables.map((row) => `- ${row.table}: ${row.description}`)

        return [
            "Live-таблицы остановок из источника аналитики сайта:",
            ...stopRows,
            "",
            "Таблицы SQL-контура:",
            ...tableRows,
            sqlTables.length > 20 ? `...и еще ${sqlTables.length - 20}` : "",
        ].filter(Boolean).join("\n")
    }

    return null
}

function getLocalToolDefinitions(mode: AssistantMode): GigaChatFunctionDefinition[] {
    const chartTool: GigaChatFunctionDefinition = {
        name: "build_bar_chart",
        description: "Render a real chart image from already retrieved analytical rows and return /plots/plot_*.png plus markdown. Use after data is available and the user asks for a chart, comparison, top list, or visualization.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "Chart title in Russian." },
                x_values: {
                    type: "array",
                    items: { type: "string" },
                    description: "Labels for bars.",
                },
                y_values: {
                    type: "array",
                    items: { type: "number" },
                    description: "Numeric values for bars.",
                },
                unit: { type: "string", description: "Optional unit, for example человек, событий, %." },
            },
            required: ["title", "x_values", "y_values"],
        },
    }

    if (mode !== "stops") {
        return [chartTool]
    }

    return [
        {
            name: "query_stop_supabase_readonly",
            description: [
                "Execute a safe read-only SQL SELECT against the live Supabase source for the Stops mode.",
                "Available tables: busyness_windows, alerts, stop_condition_windows.",
                "Use simple SELECT columns FROM table WHERE ... ORDER BY ... LIMIT ... statements.",
                "Do not use mutations, DDL, joins, CTEs, semicolons, comments, or destructive SQL.",
                "For aggregations, request the needed rows and aggregate in the final answer.",
            ].join(" "),
            parameters: {
                type: "object",
                properties: {
                    sql: {
                        type: "string",
                        description: "Read-only SELECT SQL over whitelisted stop live tables.",
                    },
                },
                required: ["sql"],
            },
        },
        chartTool,
    ]
}

function isLocalToolName(name: string) {
    return LOCAL_TOOL_NAMES.has(name)
}

function rejectUnsafeSql(sql: string) {
    const normalized = sql.toLowerCase()
    const forbidden = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|execute|merge|vacuum|analyze|refresh|notify|listen|unlisten)\b/

    if (!normalized.trim().startsWith("select ")) {
        throw new Error("Разрешены только read-only SELECT-запросы.")
    }

    if (sql.includes(";") || /--|\/\*/.test(sql) || forbidden.test(normalized)) {
        throw new Error("SQL отклонен: разрешен только один безопасный SELECT без комментариев и destructive-операций.")
    }
}

function parseSqlLiteral(rawValue: string) {
    const value = rawValue.trim()
    const quoted = value.match(/^'(.*)'$/s) || value.match(/^"(.*)"$/s)
    if (quoted) {
        return quoted[1].replace(/''/g, "'")
    }

    const interval = value.match(/^now\(\)\s*-\s*interval\s+'(\d+)\s+(hour|hours|day|days)'$/i)
    if (interval) {
        const amount = Number(interval[1])
        const unit = interval[2].startsWith("day") ? 24 : 1
        return hoursAgoIso(amount * unit)
    }

    if (/^\d+(\.\d+)?$/.test(value)) {
        return Number(value)
    }

    if (/^(true|false)$/i.test(value)) {
        return value.toLowerCase() === "true"
    }

    return value
}

function parseSelectColumns(rawColumns: string, table: string) {
    const allowedColumns = STOP_SQL_TABLE_COLUMNS[table]
    const trimmed = rawColumns.trim()

    if (trimmed === "*") {
        return "*"
    }

    const columns = trimmed
        .split(",")
        .map((column) => column.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)

    if (columns.length === 0) {
        throw new Error("Не указаны колонки SELECT.")
    }

    for (const column of columns) {
        if (!allowedColumns.includes(column)) {
            throw new Error(`Колонка ${column} недоступна для таблицы ${table}.`)
        }
    }

    return columns.join(",")
}

function extractSqlClause(remainder: string, keyword: "where" | "order by" | "limit") {
    const pattern = keyword === "order by"
        ? /\border\s+by\b/i
        : new RegExp(`\\b${keyword}\\b`, "i")
    const match = remainder.match(pattern)
    if (!match || match.index === undefined) {
        return { value: "", rest: remainder }
    }

    const start = match.index + match[0].length
    const after = remainder.slice(start)
    const nextMatches = ["where", "order by", "limit"]
        .filter((item) => item !== keyword)
        .map((item) => {
            const nextPattern = item === "order by" ? /\border\s+by\b/i : new RegExp(`\\b${item}\\b`, "i")
            const nextMatch = after.match(nextPattern)
            return nextMatch?.index
        })
        .filter((index): index is number => typeof index === "number")
    const end = nextMatches.length > 0 ? Math.min(...nextMatches) : after.length

    return {
        value: after.slice(0, end).trim(),
        rest: `${remainder.slice(0, match.index)} ${after.slice(end)}`.trim(),
    }
}

function splitSqlConditions(whereClause: string) {
    if (!whereClause.trim()) {
        return []
    }

    return whereClause
        .split(/\s+and\s+/i)
        .map((condition) => condition.trim())
        .filter(Boolean)
}

function applySqlWhere(
    query: ReturnType<ReturnType<typeof createSupabaseClient>["from"]> extends infer T ? T : never,
    table: string,
    whereClause: string,
) {
    const allowedColumns = STOP_SQL_TABLE_COLUMNS[table]
    let nextQuery = query

    for (const condition of splitSqlConditions(whereClause)) {
        const inMatch = condition.match(/^"?([a-zA-Z_][\w]*)"?\s+in\s*\((.+)\)$/i)
        if (inMatch) {
            const column = inMatch[1]
            if (!allowedColumns.includes(column)) {
                throw new Error(`Колонка ${column} недоступна для фильтра.`)
            }
            const values = inMatch[2]
                .split(",")
                .map((value) => parseSqlLiteral(value))
            nextQuery = nextQuery.in(column, values)
            continue
        }

        const match = condition.match(/^"?([a-zA-Z_][\w]*)"?\s*(=|!=|<>|>=|<=|>|<|ilike|like)\s*(.+)$/i)
        if (!match) {
            throw new Error(`Фильтр не поддержан: ${condition}`)
        }

        const column = match[1]
        const operator = match[2].toLowerCase()
        const value = parseSqlLiteral(match[3])

        if (!allowedColumns.includes(column)) {
            throw new Error(`Колонка ${column} недоступна для фильтра.`)
        }

        if (operator === "=") nextQuery = nextQuery.eq(column, value)
        else if (operator === "!=" || operator === "<>") nextQuery = nextQuery.neq(column, value)
        else if (operator === ">=") nextQuery = nextQuery.gte(column, value)
        else if (operator === "<=") nextQuery = nextQuery.lte(column, value)
        else if (operator === ">") nextQuery = nextQuery.gt(column, value)
        else if (operator === "<") nextQuery = nextQuery.lt(column, value)
        else if (operator === "ilike" || operator === "like") nextQuery = nextQuery.ilike(column, String(value))
    }

    return nextQuery
}

async function executeStopReadonlySql(sql: string) {
    rejectUnsafeSql(sql)

    const match = sql.trim().match(/^select\s+(.+?)\s+from\s+(?:(?:public)\.)?([a-zA-Z_][\w]*)\s*(.*)$/is)
    if (!match) {
        throw new Error("Не удалось разобрать SELECT. Используй формат: SELECT columns FROM table WHERE ... ORDER BY ... LIMIT ...")
    }

    const [, rawColumns, table, rawRemainder] = match
    const allowedColumns = STOP_SQL_TABLE_COLUMNS[table]
    if (!allowedColumns) {
        throw new Error(`Таблица ${table} недоступна. Разрешены: ${Object.keys(STOP_SQL_TABLE_COLUMNS).join(", ")}.`)
    }

    let remainder = rawRemainder.trim()
    const limitClause = extractSqlClause(remainder, "limit")
    remainder = limitClause.rest
    const orderClause = extractSqlClause(remainder, "order by")
    remainder = orderClause.rest
    const whereClause = extractSqlClause(remainder, "where")

    const limit = limitClause.value ? Math.min(Math.max(Number(limitClause.value), 1), 5000) : 1000
    if (!Number.isFinite(limit)) {
        throw new Error("LIMIT должен быть числом.")
    }

    const selectColumns = parseSelectColumns(rawColumns, table)
    const supabase = getSupabaseDirectClient()
    if (!supabase) {
        throw new Error("Supabase env is not configured")
    }

    let query = supabase
        .from(table)
        .select(selectColumns)
        .limit(limit)

    query = applySqlWhere(query, table, whereClause.value)

    if (orderClause.value) {
        const orderMatch = orderClause.value.match(/^"?([a-zA-Z_][\w]*)"?(?:\s+(asc|desc))?$/i)
        if (!orderMatch) {
            throw new Error("ORDER BY поддерживает одну колонку и ASC/DESC.")
        }
        const orderColumn = orderMatch[1]
        if (!allowedColumns.includes(orderColumn)) {
            throw new Error(`Колонка ${orderColumn} недоступна для сортировки.`)
        }
        query = query.order(orderColumn, { ascending: (orderMatch[2] || "asc").toLowerCase() !== "desc" })
    }

    const { data, error } = await query
    if (error) {
        throw new Error(error.message)
    }

    return JSON.stringify({
        ok: true,
        source: "stop_supabase_readonly",
        table,
        sql,
        row_count: Array.isArray(data) ? data.length : 0,
        rows: data || [],
        note: "Read-only result. Aggregate and explain these rows in the final answer; do not expose internal source names unless asked.",
    })
}

function escapeSvgText(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

function escapeMarkdownAlt(value: string) {
    return value.replace(/[\[\]\n\r]/g, " ").trim()
}

function truncateChartLabel(value: string, maxLength = 34) {
    const normalized = value.replace(/\s+/g, " ").trim()
    if (normalized.length <= maxLength) {
        return normalized
    }

    return `${normalized.slice(0, maxLength - 3)}...`
}

function getBarChartPoints(args: Record<string, unknown>) {
    const xValues = Array.isArray(args.x_values) ? args.x_values.map(String) : []
    const yValues = Array.isArray(args.y_values) ? args.y_values.map(Number) : []

    return xValues
        .map((label, index) => ({
            label: truncateChartLabel(label),
            value: Number.isFinite(yValues[index]) ? yValues[index] : 0,
        }))
        .filter((point) => point.label)
        .slice(0, 12)
}

function buildBarChartSvg(args: Record<string, unknown>) {
    const title = String(args.title || "График")
    const unit = typeof args.unit === "string" ? args.unit : ""
    const points = getBarChartPoints(args)
    const width = 980
    const left = 36
    const labelWidth = 250
    const plotX = left + labelWidth
    const plotWidth = 610
    const right = 44
    const top = 96
    const rowHeight = 46
    const barHeight = 22
    const bottom = 58
    const height = Math.max(310, top + bottom + Math.max(points.length, 1) * rowHeight)
    const maxValue = Math.max(...points.map((point) => point.value), 1)
    const palette = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"]
    const ticks = [0, 0.25, 0.5, 0.75, 1]

    const grid = ticks.map((tick) => {
        const x = plotX + plotWidth * tick
        const value = USER_NUMBER_FORMAT.format(maxValue * tick)

        return [
            `<line x1="${x}" y1="${top - 18}" x2="${x}" y2="${height - bottom + 10}" class="grid" />`,
            `<text x="${x}" y="${height - 22}" text-anchor="middle" class="tick">${escapeSvgText(value)}</text>`,
        ].join("")
    }).join("")

    const bars = points.map((point, index) => {
        const y = top + index * rowHeight
        const value = Math.max(point.value, 0)
        const barWidth = Math.max(value > 0 ? 6 : 0, (value / maxValue) * plotWidth)
        const valueText = `${USER_NUMBER_FORMAT.format(point.value)}${unit ? ` ${unit}` : ""}`
        const valueX = Math.min(plotX + barWidth + 10, width - right - 92)

        return [
            `<text x="${left}" y="${y + 16}" class="label">${escapeSvgText(point.label)}</text>`,
            `<rect x="${plotX}" y="${y - 2}" width="${plotWidth}" height="${barHeight}" rx="6" class="track" />`,
            `<rect x="${plotX}" y="${y - 2}" width="${barWidth}" height="${barHeight}" rx="6" fill="${palette[index % palette.length]}" />`,
            `<text x="${valueX}" y="${y + 14}" class="value">${escapeSvgText(valueText)}</text>`,
        ].join("")
    }).join("")

    const emptyState = points.length === 0
        ? `<text x="${plotX}" y="${top + 18}" class="label">Нет данных для построения графика</text>`
        : ""

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(title)}">
    <style>
        .bg { fill: #ffffff; }
        .title { font: 700 24px Arial, sans-serif; fill: #111827; }
        .subtitle { font: 400 13px Arial, sans-serif; fill: #6b7280; }
        .label { font: 500 14px Arial, sans-serif; fill: #111827; }
        .value { font: 700 13px Arial, sans-serif; fill: #111827; }
        .tick { font: 400 12px Arial, sans-serif; fill: #6b7280; }
        .grid { stroke: #e5e7eb; stroke-width: 1; stroke-dasharray: 4 6; }
        .axis { stroke: #9ca3af; stroke-width: 1.2; }
        .track { fill: #f3f4f6; }
    </style>
    <rect width="${width}" height="${height}" rx="18" class="bg" />
    <text x="${left}" y="44" class="title">${escapeSvgText(title)}</text>
    <text x="${left}" y="68" class="subtitle">Топ ${points.length || 0} по подтвержденным данным. Значения показаны ${unit ? `в ${escapeSvgText(unit)}` : "в единицах показателя"}.</text>
    ${grid}
    <line x1="${plotX}" y1="${top - 18}" x2="${plotX}" y2="${height - bottom + 10}" class="axis" />
    ${bars}
    ${emptyState}
</svg>`
}

async function buildImageBarChart(args: Record<string, unknown>) {
    const title = String(args.title || "График")
    const points = getBarChartPoints(args)
    const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0")
    const filename = `plot_${Date.now()}${suffix}.png`
    const localPath = path.join(LOCAL_PLOTS_DIR, filename)
    const svg = buildBarChartSvg(args)

    await fs.mkdir(LOCAL_PLOTS_DIR, { recursive: true })
    await fs.writeFile(localPath, svg, "utf8")

    return JSON.stringify({
        ok: true,
        chart_type: "bar",
        renderer: "local_svg",
        points_count: points.length,
        path: `/plots/${filename}`,
        markdown: `![${escapeMarkdownAlt(title)}](/plots/${filename})`,
    })
}

async function buildFormattedBarChart(args: Record<string, unknown>) {
    const output = await buildImageBarChart(args)
    return formatKnownToolOutput("build_bar_chart", output) || ""
}

async function callLocalTool(mode: AssistantMode, name: string, args: Record<string, unknown>) {
    if (name === "build_bar_chart") {
        return buildImageBarChart(args)
    }

    if (name === "query_stop_supabase_readonly" && mode === "stops") {
        const sql = typeof args.sql === "string" ? args.sql : ""
        return executeStopReadonlySql(sql)
    }

    throw new Error(`Локальный инструмент ${name} недоступен в режиме ${mode}.`)
}

function parseToolPayload(output: string) {
    try {
        return JSON.parse(output.trim()) as Record<string, unknown>
    } catch {
        return null
    }
}

function formatStopSourceUnavailable(subject: string) {
    return [
        `Коротко: по сценарию «${subject}» live-источник остановок сейчас не вернул данные.`,
        "",
        "Что я не буду делать: подставлять примерные цифры или выдавать плановые панели за текущее состояние.",
        "",
        "Что проверить администратору:",
        "- переменные Supabase для live-источника остановок;",
        "- доступ сайта к таблицам `busyness_windows` и `alerts`; ",
        "- что сбор видеоаналитики реально пишет свежие окна и события.",
        "",
        "После восстановления источника этот же вопрос должен вернуть топ остановок, пики, свежесть данных и приоритеты для диспетчера.",
    ].join("\n")
}

function formatStopCapabilitiesQuickAnswer() {
    return [
        "Я работаю в режиме «Остановки» и помогаю разбирать live-данные и аналитику остановочных пунктов.",
        "",
        "Что могу разобрать:",
        "1. Текущая загруженность: какие направления сейчас самые напряженные, где пик людей, насколько свежие интервалы наблюдений.",
        "2. События безопасности: курение, лежачий человек, оставленные предметы, собаки без сопровождения, повторяемость и последние фиксации.",
        "3. Лежачий человек: отдельная сводка по таким событиям, локациям и времени последней фиксации.",
        "4. Граница live/план: какие данные являются текущими, а какие относятся к плановым BI-панелям.",
        "5. Краткая сводка для руководителя: что происходит, где риск, что проверить диспетчеру.",
        "",
        "Как я работаю с фактами: текущие цифры беру только из live-источника остановок. Если источник недоступен, прямо говорю об этом и не придумываю значения.",
    ].join("\n")
}

function formatPlatformCapabilitiesQuickAnswer() {
    return [
        "Я работаю в режиме «Платформа» и помогаю по всем модулям городского мониторинга.",
        "",
        "Что могу разобрать:",
        "1. Объяснить, какие модули есть на платформе и какие показатели в них смотреть.",
        "2. Разобрать дорожные инциденты, подрядчиков, реакцию, SLA и влияние погоды, если доступен платформенный аналитический контур.",
        "3. Объяснить остановки на уровне платформы: live-данные отдельно, плановые панели отдельно.",
        "4. Разложить показатели берега, парка и транспорта: что является риском, что является эксплуатационной задачей, что нужно диспетчеру.",
        "5. Подготовить управленческую сводку: вывод, факты, интерпретация, действия и ограничения данных.",
        "",
        "Важно: режим «Платформа» не подменяет платформенную базу live-источником остановок. Для остановок есть отдельный режим.",
    ].join("\n")
}

function formatAliveQuickAnswer(mode: AssistantMode) {
    return mode === "stops"
        ? "Да, я на связи в режиме «Остановки». Могу разобрать текущую загруженность, события безопасности, лежачих людей и границу live/план."
        : "Да, я на связи в режиме «Платформа». Могу объяснить модули, показатели и подготовить аналитический разбор по доступным данным."
}

async function formatStopLoadQuickFromOutput(output: string, includeChart = false) {
    const payload = parseToolPayload(output)
    const rows = Array.isArray(payload?.rows) ? payload.rows as Array<Record<string, unknown>> : []

    if (rows.length === 0) {
        return [
            "Коротко: в live-источнике остановок нет строк загруженности за проверенный период.",
            "",
            "Что это значит: сейчас нельзя честно назвать самые напряженные направления, потому что нет подтвержденных окон наблюдения.",
            "",
            "Что проверить: пишет ли видеоаналитика в `busyness_windows`, есть ли свежие `window_start`, и не обрезан ли период запроса.",
        ].join("\n")
    }

    const topRows = rows.slice(0, 5)
    const leader = topRows[0]
    const latestWindow = String(payload?.latest_window || leader.latest_window || "")
    const totalWindows = rows.reduce((sum, row) => sum + Number(row.windows || 0), 0)
    const lowQualityWindows = rows.reduce((sum, row) => (
        sum + Number(row.zero_sample_windows || 0) + Number(row.low_sample_windows || 0)
    ), 0)
    const chartOutput = includeChart
        ? await buildImageBarChart({
            title: "График средней загруженности остановок",
            x_values: topRows.map((row) => String(row.name || row.location_id || "остановка")),
            y_values: topRows.map((row) => Number(row.avg_people || 0)),
            unit: "чел.",
        })
        : ""
    const chart = chartOutput ? formatKnownToolOutput("build_bar_chart", chartOutput) : ""

    return [
        `Коротко: самое напряженное направление сейчас — ${leader.name || leader.location_id}: средняя загрузка ${asNumber(leader.avg_people) ?? "-"}, пик ${asNumber(leader.peak_people) ?? "-"} человек. Последнее окно: ${formatDateTimeForUser(latestWindow)} по времени Сургута.`,
        "",
        ...(chart ? [chart, ""] : []),
        "Топ направлений по live-данным:",
        ...topRows.map((row, index) => {
            const avg = asNumber(row.avg_people)
            const peak = asNumber(row.peak_people)
            const windows = asNumber(row.windows)
            const samples = asNumber(row.sample_count)
            return `${index + 1}. ${row.name || row.location_id}: средняя ${avg ?? "-"}, пик ${peak ?? "-"} человек, окон ${windows ?? "-"}, наблюдений ${samples ?? "-"}.`
        }),
        "",
        "Интерпретация: в первую очередь диспетчеру нужны направления с высоким пиком и стабильной средней загрузкой. Разовый пик важен, но устойчиво высокая средняя нагрузка лучше показывает повторяющуюся проблему.",
        "",
        "Что сделать:",
        "- проверить камеры и фактическую обстановку на первом и втором направлении из списка;",
        "- если пик повторяется несколько окон подряд, передать точку в операционный контроль;",
        "- при низком качестве окон не делать вывод по одной записи, а сверить видео/камеру.",
        "",
        lowQualityWindows > 0
            ? `Ограничение данных: в выборке есть окна с низкой или нулевой выборкой (${lowQualityWindows} из ${totalWindows}), поэтому приоритеты лучше подтверждать визуально.`
            : "Ограничение данных: это оценка по наблюдаемым окнам камер, а не точный подсчет уникальных пассажиров.",
    ].join("\n")
}

function formatStopLoadTrashRelationPayload(payload: Record<string, unknown>) {
    const reason = typeof payload.reason === "string" ? payload.reason : ""
    if (payload.ok === false) {
        if (reason === "trash_source_not_connected") {
            return [
                "Коротко: связь между загруженностью остановок и переполненными урнами сейчас посчитать нельзя: источник по заполненности урн не подключен или не отдан API.",
                "",
                payload.latest_load_window
                    ? `При этом загруженность остановок доступна, последнее окно: ${formatDateTimeForUser(payload.latest_load_window)} по времени Сургута.`
                    : "Загруженность остановок тоже не дала достаточного свежего окна для сопоставления.",
                "",
                "Что это значит: нельзя честно утверждать, что переполненные урны связаны с пассажирской нагрузкой, пока нет второго ряда данных по урнам.",
                "",
                "Что проверить администратору: наличие таблицы и прав чтения для текущих окон заполненности урн, обновление schema cache API и фактическую запись видеоаналитики по урнам.",
            ].join("\n")
        }

        return [
            "Коротко: связь между загруженностью остановок и заполненностью урн сейчас не подтверждена данными.",
            "",
            payload.message ? String(payload.message) : "Один из источников не вернул данные для сопоставления.",
            "",
            "Я не буду делать вывод о зависимости по одному ряду или по неполным данным.",
        ].join("\n")
    }

    const rows = Array.isArray(payload.rows) ? payload.rows as Array<Record<string, unknown>> : []
    const commonLocations = asNumber(payload.common_locations) ?? rows.length

    if (rows.length === 0 || commonLocations < 2) {
        return [
            "Коротко: сопоставимых данных недостаточно, чтобы оценить связь между загруженностью остановок и переполнением урн.",
            "",
            `За проверенный период найдено общих точек для сравнения: ${commonLocations}. Для вывода нужна хотя бы пара остановок с данными и по людям, и по урнам.`,
            "",
            "Что сделать: проверить, что оба контура пишут данные по одним и тем же location_id и за пересекающийся период.",
        ].join("\n")
    }

    const topRows = rows.slice(0, 6)
    const correlationAvg = asNumber(payload.correlation_avg)
    const correlationMax = asNumber(payload.correlation_max)
    const problemLocations = asNumber(payload.problem_locations) ?? 0
    const criticalLocations = asNumber(payload.critical_locations) ?? 0
    const trashSource = typeof payload.trash_source === "string" ? payload.trash_source : "condition_windows"
    const usesAlertEvents = trashSource === "alerts"
    const totalTrashEvents = asNumber(payload.trash_events) ?? rows.reduce((sum, row) => sum + (asNumber(row.trash_events) ?? 0), 0)

    if (usesAlertEvents) {
        return [
            `Коротко: по сопоставимым остановкам связь «средняя загруженность ↔ события переполненных урн» оценивается как ${payload.correlation_avg_label || describeCorrelation(correlationAvg)}${correlationAvg !== null ? ` (r=${USER_NUMBER_FORMAT.format(correlationAvg)})` : ""}.`,
            `По пикам «пик людей ↔ события переполненных урн»: ${payload.correlation_max_label || describeCorrelation(correlationMax)}${correlationMax !== null ? ` (r=${USER_NUMBER_FORMAT.format(correlationMax)})` : ""}.`,
            "",
            "Факты по данным:",
            `- период сопоставления: последние ${Math.round((asNumber(payload.period_hours) ?? 0) / 24)} дн.;`,
            `- общих остановок для сравнения: ${commonLocations};`,
            `- событий переполненных урн: ${totalTrashEvents};`,
            `- остановок с событиями по урнам: ${problemLocations};`,
            `- остановок с критичными фиксациями по severity: ${criticalLocations};`,
            payload.latest_load_window ? `- последнее окно загруженности: ${formatDateTimeForUser(payload.latest_load_window)} по времени Сургута;` : "",
            payload.latest_trash_window ? `- последнее событие по урнам: ${formatDateTimeForUser(payload.latest_trash_window)} по времени Сургута.` : "",
            "",
            "Приоритетные точки, где одновременно есть нагрузка и события по урнам:",
            ...topRows.map((row, index) => (
                `${index + 1}. ${row.name || row.location_id}: средняя загрузка ${asNumber(row.avg_people) ?? "-"} чел., пик ${asNumber(row.peak_people) ?? "-"} чел.; событий переполненных урн ${asNumber(row.trash_events) ?? 0}, критичных ${asNumber(row.critical_windows) ?? 0}.`
            )),
            "",
            "Интерпретация: это не доказательство причины, но хороший операционный сигнал. Если на одной остановке одновременно высокий пассажиропоток и повторяются события переполненных урн, точку стоит ставить выше в очереди проверки и уборки.",
            "",
            "Что сделать:",
            "- проверить первые точки из списка по камерам и фактическому состоянию урн;",
            "- сверить время пиков загрузки с временем фиксаций переполнения;",
            "- если совпадение повторяется несколько дней, скорректировать график уборки или ёмкость урн на этих остановках.",
            "",
            "Ограничение данных: для урн использованы подтвержденные события переполнения из live-алертов, а не непрерывный процент заполнения. Поэтому вывод подходит для приоритизации, но не для доказательства причинности.",
        ].filter(Boolean).join("\n")
    }

    return [
        `Коротко: по сопоставимым остановкам связь «средняя загруженность ↔ средняя заполненность урн» оценивается как ${payload.correlation_avg_label || describeCorrelation(correlationAvg)}${correlationAvg !== null ? ` (r=${USER_NUMBER_FORMAT.format(correlationAvg)})` : ""}.`,
        `По пикам «пик людей ↔ максимум заполнения урн»: ${payload.correlation_max_label || describeCorrelation(correlationMax)}${correlationMax !== null ? ` (r=${USER_NUMBER_FORMAT.format(correlationMax)})` : ""}.`,
        "",
        "Факты по данным:",
        `- период сопоставления: последние ${Math.round((asNumber(payload.period_hours) ?? 0) / 24)} дн.;`,
        `- общих остановок для сравнения: ${commonLocations};`,
        `- остановок с проблемной урной от 70%: ${problemLocations};`,
        `- остановок с критичной урной от 90%: ${criticalLocations};`,
        payload.latest_load_window ? `- последнее окно загруженности: ${formatDateTimeForUser(payload.latest_load_window)} по времени Сургута;` : "",
        payload.latest_trash_window ? `- последнее окно урн: ${formatDateTimeForUser(payload.latest_trash_window)} по времени Сургута.` : "",
        "",
        "Приоритетные точки, где одновременно есть нагрузка и заполнение урн:",
        ...topRows.map((row, index) => (
            `${index + 1}. ${row.name || row.location_id}: средняя загрузка ${asNumber(row.avg_people) ?? "-"} чел., пик ${asNumber(row.peak_people) ?? "-"} чел.; средняя заполненность урн ${asNumber(row.avg_trash_fill) ?? "-"}%, максимум ${asNumber(row.max_trash_fill) ?? "-"}%, проблемных окон ${asNumber(row.problem_windows) ?? 0}, критичных ${asNumber(row.critical_windows) ?? 0}.`
        )),
        "",
        "Интерпретация: корреляция показывает совместное движение показателей, но не доказывает причину. Для диспетчера важнее точки, где высокая нагрузка совпадает с проблемными или критичными окнами по урнам: их стоит проверять первыми.",
        "",
        "Что сделать:",
        "- проверить первые точки из списка по камерам и фактической уборке;",
        "- если проблемные окна урн повторяются вместе с высокой нагрузкой, поставить точку в приоритет уборки;",
        "- если связь слабая, искать причину переполнения отдельно: график уборки, конструкция урны, локальные события рядом с остановкой.",
        "",
        "Ограничение данных: расчёт сделан по агрегированным окнам, поэтому это оперативная аналитика для приоритизации, а не доказательство причинности.",
    ].filter(Boolean).join("\n")
}

function formatStopSafetyQuickFromOutput(output: string, onlyLyingPerson = false) {
    const payload = parseToolPayload(output)
    const summary = Array.isArray(payload?.summary) ? payload.summary as Array<Record<string, unknown>> : []
    const rows = Array.isArray(payload?.rows) ? payload.rows as Array<Record<string, unknown>> : []

    if (summary.length === 0 && rows.length === 0) {
        return onlyLyingPerson
            ? [
                "Коротко: свежих подтвержденных событий «лежачий человек» в live-источнике за проверенный период нет.",
                "",
                "Что это значит: отдельного диспетчерского выезда по этому типу сейчас не видно, но это не заменяет регламентный просмотр камер.",
                "",
                "Что проверить: если событие ожидалось, проверьте запись в `alerts` с типом `lying_person` и корректность привязки остановки в metadata.",
            ].join("\n")
            : [
                "Коротко: свежих подтвержденных событий безопасности по остановкам за проверенный период нет.",
                "",
                "Что это значит: live-источник не показывает активных инцидентов по контролируемым типам. Плановые панели и исторические отчеты это не заменяет.",
                "",
                "Что проверить: запись событий в `alerts`, фильтр `module_name=stops` и актуальность типов событий.",
            ].join("\n")
    }

    const title = onlyLyingPerson
        ? "События «лежачий человек»"
        : "События безопасности остановок"
    const latest = String(payload?.latest_event || rows[0]?.timestamp || "")
    const summaryRows = summary.slice(0, 6).map((row, index) => {
        const label = String(row.label || row.alert_type || "событие")
        const count = Number(row.events_count || 0)
        const locations = Number(row.affected_locations || 0)
        const latestEvent = String(row.latest_event || "")
        return `${index + 1}. ${label}: ${count} событий, локаций ${locations || "-"}, последнее ${formatDateTimeForUser(latestEvent)}.`
    })

    const latestRows = rows.slice(0, 5).map((row, index) => {
        const locationId = typeof row.metadata === "object" && row.metadata && "location_id" in row.metadata
            ? String((row.metadata as Record<string, unknown>).location_id || "")
            : ""
        const location = locationId ? getStopDisplayName(locationId) : "локация не указана"
        const camera = asNumber(row.camera_index)
        return `${index + 1}. ${formatDateTimeForUser(String(row.timestamp || ""))}: ${location}${camera !== null ? `, камера ${camera}` : ""}.`
    })

    return [
        `Коротко: ${title.toLowerCase()} есть в live-источнике. Последняя фиксация: ${formatDateTimeForUser(latest)} по времени Сургута.`,
        "",
        "Сводка:",
        ...(summaryRows.length > 0 ? summaryRows : ["- агрегированной сводки нет, использую последние события ниже."]),
        "",
        "Последние события:",
        ...latestRows,
        "",
        "Интерпретация: повторяемые события и несколько локаций важнее одиночной фиксации. Для «лежачего человека» приоритет выше, потому что это потенциальный риск для жизни и здоровья.",
        "",
        "Что сделать:",
        "- проверить последнюю локацию по камере;",
        "- если событие повторяется, передать диспетчеру как приоритетную точку;",
        "- после проверки зафиксировать статус: ложное срабатывание, реагирование или закрыто.",
    ].join("\n")
}

function formatStopDataModesQuickAnswer() {
    return [
        "Режим «Остановки» разделен на два контура: текущий live-контур и плановые панели.",
        "",
        "Текущие live-данные:",
        "- загруженность остановок по окнам наблюдения камер;",
        "- события безопасности: курение, лежачий человек, оставленные предметы, собаки без сопровождения;",
        "- переполненность урн в текущем состоянии, если есть агрегированные окна или события переполнения;",
        "- графики и сводки, построенные из свежих строк источника.",
        "",
        "Плановый контур:",
        "- KPI, районы, пассажирская аналитика и BI-панели;",
        "- используются для сравнения, структуры, нормативов и исторической картины;",
        "- не должны подменять текущие live-значения.",
        "",
        "Правило: если вопрос про «сейчас», я беру live-источник. Если вопрос про план, нормативы или BI-панели, я не выдаю это за текущую обстановку.",
    ].join("\n")
}

function formatStopPlanQuickAnswer() {
    return [
        "Плановые панели по остановкам нужно читать как контур планирования и контроля, а не как live-картину.",
        "",
        "Как интерпретировать:",
        "1. KPI показывают выполнение целевых показателей и структуру сети.",
        "2. Районы помогают понять покрытие и распределение проблем по территории.",
        "3. Пассажирская аналитика показывает исторические и плановые закономерности, а не обязательно состояние прямо сейчас.",
        "4. Сравнение с live-данными нужно делать аккуратно: live отвечает на вопрос «что происходит сейчас», план — «как должно быть и где системный разрыв».",
        "",
        "Практический вывод: для диспетчера первичны live-события и текущая загруженность; для руководителя — отклонение live-картины от плановых KPI и повторяемость проблем.",
    ].join("\n")
}

function formatPlatformModulesQuickAnswer() {
    return [
        "На платформе есть пять основных аналитических контуров.",
        "",
        "1. Состояние дорог: дефекты, уборка, подрядчики, SLA, влияние погоды и динамика инцидентов.",
        "2. Остановки: текущая загруженность, безопасность, состояние остановок, пассажирская аналитика и плановые панели.",
        "3. Безопасный берег: охрана периметра, события безопасности людей, зоны риска.",
        "4. Безопасный парк: безопасность, эксплуатация территории, мусор, освещение, транспорт на территории.",
        "5. Контроль транспорта: маршрутная дисциплина, ожидание, отклонения и сервисные события.",
        "",
        "Как этим пользоваться: сначала выбрать модуль, затем период и тип вопроса — текущая ситуация, исторический тренд, нарушения регламента или управленческая сводка.",
    ].join("\n")
}

function formatRoadReactionQuickAnswer() {
    return [
        "Коротко: для задержек реакции нужно смотреть не среднее время, а «хвосты» — подрядчиков и типы инцидентов, где реакция регулярно выходит за норматив.",
        "",
        "Какой разбор должен строиться:",
        "1. Сгруппировать инциденты по подрядчику и типу.",
        "2. Посчитать медиану, 90-й процентиль и максимум времени реакции.",
        "3. Отдельно выделить долю нарушений SLA.",
        "4. Отсечь единичные выбросы, если по группе мало событий.",
        "",
        "Что считать приоритетом: подрядчик + тип инцидента с высокой долей нарушений и большим 90-м процентилем. Именно там проблема системная, а не разовая.",
        "",
        "Для численных значений нужен доступный платформенный аналитический контур по дорожным событиям. Без него я не буду придумывать подрядчиков и минуты.",
    ].join("\n")
}

function formatWeatherSlaQuickAnswer() {
    return [
        "Коротко: влияние погоды на SLA нужно оценивать не по одному дню, а сравнением доли нарушений в нормальную погоду и в периоды осадков/сложных условий.",
        "",
        "Правильная логика анализа:",
        "1. Разбить год на интервалы с погодными признаками: осадки, температура, снег/дождь, интенсивность.",
        "2. Для каждого интервала посчитать число инцидентов, число нарушений регламента и долю нарушений.",
        "3. Сравнить с базовым уровнем в сухую/нормальную погоду.",
        "4. Проверить подрядчиков отдельно: погода может ухудшать всех, но сильнее проявлять слабые операционные зоны.",
        "",
        "Вывод для управления: если в плохую погоду растет не только число инцидентов, но и доля нарушений, проблема не только в погоде, а в запасе ресурсов, маршрутизации бригад или регламенте.",
        "",
        "Для конкретных процентов и подрядчиков нужен платформенный источник дорожных событий и метеоданных. Без него корректный ответ — методика и критерии, а не выдуманные цифры.",
    ].join("\n")
}

function formatStopConditionIndicatorsQuickAnswer() {
    return [
        "Модуль «Состояние остановок» нужно читать как операционную витрину проблем, а не как общий паспорт остановки.",
        "",
        "Главный текущий показатель сейчас — переполненность урн:",
        "- от 70% — проблемная урна, нужна постановка в уборку;",
        "- от 90% — критично, приоритетная проверка;",
        "- если агрегированных окон нет, текущий экран может использовать события переполнения из видеоаналитики.",
        "",
        "Как интерпретировать: важен не только последний процент, но и повторяемость по окнам/событиям. Остановка с регулярным превышением 70% важнее одиночного всплеска.",
    ].join("\n")
}

function formatWarmStopQuickAnswer() {
    return [
        "По аналитике «Теплая остановка» без сырых данных можно сделать только качественную интерпретацию, а не текущие измерения.",
        "",
        "Что можно оценивать:",
        "- комфорт и стабильность условий ожидания;",
        "- отклонения от нормативного диапазона температуры;",
        "- повторяемость проблем по остановкам и районам;",
        "- приоритет обслуживания, если остановка часто выпадает из комфортного режима.",
        "",
        "Что нельзя честно сказать без источника: текущую температуру, точное время отказа, факт ремонта или конкретный датчик. Эти значения должны приходить из live-источника или панели.",
    ].join("\n")
}

function formatStopAnalyticsDifferenceQuickAnswer() {
    return [
        "Аналитики остановок различаются по типу управленческого решения.",
        "",
        "Пассажиропоток: где и когда высокая нагрузка, нужны ли усиление маршрутов, контроль очередей или изменение расписания.",
        "Безопасность: события риска для людей — лежачий человек, курение, собаки, оставленные предметы; это контур диспетчерской реакции.",
        "Вандализм: повреждения и повторяемые нарушения, которые требуют ремонта, охраны или профилактики.",
        "Состояние: эксплуатационные проблемы остановки — урны, комфорт, инфраструктура; это очередь обслуживания.",
        "",
        "Правило: пассажиропоток отвечает «где много людей», безопасность — «где риск», вандализм — «где ущерб», состояние — «что обслужить».",
    ].join("\n")
}

function formatParkShoreQuickAnswer() {
    return [
        "Безопасный парк и Безопасный берег похожи по логике, но отличаются природой риска.",
        "",
        "Безопасный парк:",
        "- события людей: драка, лежачий человек, оставленный предмет;",
        "- эксплуатация: переполненные урны, грязь, освещение, проезд транспорта;",
        "- управленческий смысл: безопасность посетителей и сервисное состояние территории.",
        "",
        "Безопасный берег:",
        "- периметр: пересечение линий, проходы, транспорт;",
        "- безопасность людей: запретные зоны, вода/лед, падение, дети без сопровождения;",
        "- управленческий смысл: раннее предупреждение опасных ситуаций.",
        "",
        "Приоритет задается повторяемостью, severity и близостью к риску для жизни.",
    ].join("\n")
}

function formatTransportDisciplineQuickAnswer() {
    return [
        "Маршрутная дисциплина показывает, насколько транспорт следует ожидаемому сценарию обслуживания.",
        "",
        "Ключевые сигналы:",
        "- отклонение от маршрута;",
        "- превышение ожидания;",
        "- двери не открыты на остановке;",
        "- повторяемость события по маршруту, времени и перевозчику.",
        "",
        "Как интерпретировать: одиночное событие — повод проверить запись; повторяемость по одному маршруту или перевозчику — признак системного нарушения. Для руководителя важны доля нарушений, длительность задержек и концентрация по маршрутам.",
    ].join("\n")
}

async function formatStopLoadQuickAnswer(includeChart = false) {
    try {
        const output = await callDirectSupabaseStopTool("get_stop_current_load_summary")
        return output ? formatStopLoadQuickFromOutput(output, includeChart) : formatStopSourceUnavailable("текущая загруженность")
    } catch (error) {
        console.warn("Quick stop load answer failed.", error)
        return formatStopSourceUnavailable("текущая загруженность")
    }
}

async function formatStopLoadTrashRelationQuickAnswer(includeCharts = true) {
    try {
        const output = await fetchDirectStopLoadTrashRelation()
        const payload = parseToolPayload(output)
        const text = payload
            ? formatStopLoadTrashRelationPayload(payload)
            : "Коротко: не удалось разобрать данные для сопоставления загруженности остановок и переполненных урн."
        const rows = Array.isArray(payload?.rows) ? payload.rows as Array<Record<string, unknown>> : []
        const usesAlertEvents = payload?.trash_source === "alerts"

        if (!includeCharts || rows.length === 0 || payload?.ok === false) {
            return text
        }

        const topRows = rows.slice(0, 8)
        const loadChart = await buildFormattedBarChart({
            title: "Связь с урнами: средняя загруженность",
            x_values: topRows.map((row) => String(row.name || row.location_id || "остановка")),
            y_values: topRows.map((row) => Number(row.avg_people || 0)),
            unit: "чел.",
        })
        const trashChart = await buildFormattedBarChart({
            title: usesAlertEvents
                ? "Связь с загрузкой: события переполненных урн"
                : "Связь с загрузкой: максимум заполнения урн",
            x_values: topRows.map((row) => String(row.name || row.location_id || "остановка")),
            y_values: topRows.map((row) => Number(usesAlertEvents ? row.trash_events : row.max_trash_fill || 0)),
            unit: usesAlertEvents ? "событ." : "%",
        })

        return [
            text,
            "",
            loadChart,
            "",
            trashChart,
        ].filter(Boolean).join("\n")
    } catch (error) {
        console.warn("Quick stop load/trash relation answer failed.", error)
        return formatStopSourceUnavailable("связь загруженности остановок и переполненных урн")
    }
}

async function formatStopLyingQuickAnswer() {
    try {
        const output = await callDirectSupabaseStopTool("get_stop_lying_person_events")
        return output ? formatStopSafetyQuickFromOutput(output, true) : formatStopSourceUnavailable("лежачий человек")
    } catch (error) {
        console.warn("Quick stop lying answer failed.", error)
        return formatStopSourceUnavailable("лежачий человек")
    }
}

async function formatStopSafetyQuickAnswer() {
    try {
        const output = await callDirectSupabaseStopTool("get_stop_safety_events")
        return output ? formatStopSafetyQuickFromOutput(output) : formatStopSourceUnavailable("события безопасности")
    } catch (error) {
        console.warn("Quick stop safety answer failed.", error)
        return formatStopSourceUnavailable("события безопасности")
    }
}

async function formatStopAttentionQuickAnswer() {
    const [load, safety] = await Promise.all([
        formatStopLoadQuickAnswer(),
        formatStopSafetyQuickAnswer(),
    ])

    return [
        "Быстрая диспетчерская сводка по остановкам:",
        "",
        "1. Загруженность",
        load,
        "",
        "2. События безопасности",
        safety,
    ].join("\n")
}

async function formatStopExecutiveQuickAnswer() {
    const [loadOutput, safetyOutput] = await Promise.all([
        callDirectSupabaseStopTool("get_stop_current_load_summary").catch((error) => {
            console.warn("Executive stop load fetch failed.", error)
            return null
        }),
        callDirectSupabaseStopTool("get_stop_safety_events").catch((error) => {
            console.warn("Executive stop safety fetch failed.", error)
            return null
        }),
    ])
    const loadPayload = loadOutput ? parseToolPayload(loadOutput) : null
    const safetyPayload = safetyOutput ? parseToolPayload(safetyOutput) : null
    const loadRows = Array.isArray(loadPayload?.rows) ? loadPayload.rows as Array<Record<string, unknown>> : []
    const safetySummary = Array.isArray(safetyPayload?.summary) ? safetyPayload.summary as Array<Record<string, unknown>> : []
    const safetyRows = Array.isArray(safetyPayload?.rows) ? safetyPayload.rows as Array<Record<string, unknown>> : []
    const leader = loadRows[0]
    const topEvents = safetySummary.slice(0, 4)
    const totalEvents = safetySummary.reduce((sum, row) => sum + Number(row.events_count || 0), 0)
    const activeLocations = new Set(safetyRows.map((row) => {
        const locationId = getStopLocationIdFromAlert({
            metadata: (row.metadata as Record<string, unknown> | null) || null,
            camera_index: asNumber(row.camera_index),
        })
        return locationId || ""
    }).filter(Boolean)).size
    const loadChart = loadRows.length > 0
        ? await buildFormattedBarChart({
            title: "Executive: самые нагруженные остановки",
            x_values: loadRows.slice(0, 8).map((row) => String(row.name || row.location_id || "остановка")),
            y_values: loadRows.slice(0, 8).map((row) => Number(row.avg_people || 0)),
            unit: "чел.",
        })
        : ""
    const safetyChart = topEvents.length > 0
        ? await buildFormattedBarChart({
            title: "Executive: события безопасности за 24 часа",
            x_values: topEvents.map((row) => String(row.label || row.alert_type || "событие")),
            y_values: topEvents.map((row) => Number(row.events_count || 0)),
            unit: "событ.",
        })
        : ""

    return [
        "Краткая сводка для руководителя:",
        "",
        leader
            ? `Главный вывод: максимальное внимание сейчас на направлении «${leader.name || leader.location_id}» — средняя загрузка ${asNumber(leader.avg_people) ?? "-"} чел., пик ${asNumber(leader.peak_people) ?? "-"} чел. Последнее live-окно: ${formatDateTimeForUser(String(loadPayload?.latest_window || leader.latest_window || ""))} по времени Сургута.`
            : "Главный вывод: live-данные по загруженности сейчас не вернули строк, поэтому рейтинг напряженных остановок подтвердить нельзя.",
        totalEvents > 0
            ? `По безопасности за последние сутки зафиксировано ${totalEvents} событий на ${activeLocations || "-"} локациях. Последнее событие: ${formatDateTimeForUser(String(safetyPayload?.latest_event || ""))} по времени Сургута.`
            : "По событиям безопасности за проверенный период активных строк не найдено.",
        "",
        loadChart,
        "",
        safetyChart,
        "",
        "Приоритеты на смену:",
        ...loadRows.slice(0, 5).map((row, index) => `${index + 1}. ${row.name || row.location_id}: средняя ${asNumber(row.avg_people) ?? "-"} чел., пик ${asNumber(row.peak_people) ?? "-"} чел., окон наблюдения ${asNumber(row.windows) ?? "-"}.`),
        topEvents.length > 0 ? "" : "",
        ...(
            topEvents.length > 0
                ? [
                    "События, которые стоит держать в фокусе:",
                    ...topEvents.map((row, index) => `${index + 1}. ${row.label || row.alert_type}: ${asNumber(row.events_count) ?? 0} событий, локаций ${asNumber(row.affected_locations) ?? "-"}, последнее ${formatDateTimeForUser(String(row.latest_event || ""))}.`),
                ]
                : []
        ),
        "",
        "Управленческий фокус: сначала проверяются остановки с высоким пиком людей и свежими событиями безопасности, затем эксплуатационные проблемы вроде переполненных урн и повторяемых обращений. Для презентации это можно показывать как live-срез: где сейчас нагрузка, где риск и какие точки требуют решения диспетчера.",
    ].filter(Boolean).join("\n")
}

function isCapabilityQuestion(text: string) {
    return (
        text.includes("что умеешь") ||
        text.includes("что ты умеешь") ||
        text.includes("что можешь") ||
        text.includes("что ты можешь") ||
        text.includes("чем можешь помочь") ||
        text === "помощь" ||
        text === "help" ||
        text.includes("что доступно")
    )
}

function isAliveQuestion(text: string) {
    return text === "ты тут" || text === "ты здесь" || text === "на связи" || text === "работаешь"
}

const STOP_QUICK_QUESTIONS = {
    load: new Set([
        normalizeQuickText("Покажи текущую загруженность остановок и выдели самые напряжённые направления."),
    ]),
    lying: new Set([
        normalizeQuickText("Есть ли свежие события «лежачий человек» по остановкам и где они зафиксированы?"),
    ]),
    modes: new Set([
        normalizeQuickText("Какие live-данные по остановкам доступны сейчас и чем они отличаются от плановых панелей?"),
    ]),
    plan: new Set([
        normalizeQuickText("Как правильно интерпретировать плановые панели по остановкам?"),
    ]),
    attention: new Set([
        normalizeQuickText("Какие остановки требуют внимания диспетчера по текущим наблюдениям?"),
    ]),
    executive: new Set([
        normalizeQuickText("Сформируй краткую сводку для руководителя по модулю остановок."),
    ]),
    loadTrashRelation: new Set([
        normalizeQuickText("есть ли связь между нагруженностью остановок и переполненными урнами"),
        normalizeQuickText("Есть ли связь между нагруженностью остановок и переполненными урнами?"),
    ]),
}

const PLATFORM_QUICK_QUESTIONS = {
    modules: new Set([
        normalizeQuickText("Какие модули аналитики есть на платформе и за что отвечает каждый?"),
    ]),
    reaction: new Set([
        normalizeQuickText("У каких подрядчиков и по каким типам инцидентов зафиксированы наиболее длительные задержки реакции за год?"),
    ]),
    weather: new Set([
        normalizeQuickText("Как погодные условия влияли на долю нарушений регламента подрядными организациями в течение года?"),
    ]),
    stopCondition: new Set([
        normalizeQuickText("Какие показатели есть в модуле «Состояние остановок» и как их правильно интерпретировать?"),
    ]),
    warmStop: new Set([
        normalizeQuickText("Что можно понять по аналитике «Тёплая остановка» без доступа к сырым данным?"),
    ]),
    stopDiff: new Set([
        normalizeQuickText("Чем отличаются аналитики остановок: пассажиропоток, безопасность, вандализм и состояние?"),
    ]),
    parkShore: new Set([
        normalizeQuickText("Какие индикаторы доступны в модулях «Безопасный парк» и «Безопасный берег»?"),
    ]),
    transport: new Set([
        normalizeQuickText("Как интерпретировать показатели модуля «Маршрутная дисциплина»?"),
    ]),
}

async function buildHardcodedQuickAnswer(messages: UIMessage[], mode: AssistantMode) {
    const text = normalizeQuickText(getLastUserText(messages))
    const forcedToolName = parseForcedToolName(messages)

    if (!text && !forcedToolName) {
        return null
    }

    if (isAliveQuestion(text)) {
        return formatAliveQuickAnswer(mode)
    }

    if (isCapabilityQuestion(text)) {
        return mode === "stops" ? formatStopCapabilitiesQuickAnswer() : formatPlatformCapabilitiesQuickAnswer()
    }

    if (mode === "stops") {
        const wantsChart = isPlotRequest(text)

        if (
            forcedToolName === "get_stop_current_load_summary" ||
            STOP_QUICK_QUESTIONS.load.has(text) ||
            (wantsChart && STOP_QUICK_QUESTIONS.load.has(text.replace(/^нарисуй\s+/, "")))
        ) {
            return formatStopLoadQuickAnswer(wantsChart)
        }

        if (
            forcedToolName === "get_stop_lying_person_events" ||
            STOP_QUICK_QUESTIONS.lying.has(text)
        ) {
            return formatStopLyingQuickAnswer()
        }

        if (
            forcedToolName === "get_stop_safety_events" ||
            STOP_QUICK_QUESTIONS.lying.has(text)
        ) {
            return formatStopSafetyQuickAnswer()
        }

        if (
            forcedToolName === "list_assistant_data_modes" ||
            STOP_QUICK_QUESTIONS.modes.has(text)
        ) {
            return formatStopDataModesQuickAnswer()
        }

        if (STOP_QUICK_QUESTIONS.plan.has(text)) {
            return formatStopPlanQuickAnswer()
        }

        if (STOP_QUICK_QUESTIONS.attention.has(text)) {
            return formatStopAttentionQuickAnswer()
        }

        if (STOP_QUICK_QUESTIONS.executive.has(text)) {
            return formatStopExecutiveQuickAnswer()
        }

        if (STOP_QUICK_QUESTIONS.loadTrashRelation.has(text)) {
            return formatStopLoadTrashRelationQuickAnswer(true)
        }

        return null
    }

    if (PLATFORM_QUICK_QUESTIONS.modules.has(text)) {
        return formatPlatformModulesQuickAnswer()
    }

    if (PLATFORM_QUICK_QUESTIONS.reaction.has(text)) {
        return formatRoadReactionQuickAnswer()
    }

    if (PLATFORM_QUICK_QUESTIONS.weather.has(text)) {
        return formatWeatherSlaQuickAnswer()
    }

    if (PLATFORM_QUICK_QUESTIONS.stopCondition.has(text)) {
        return formatStopConditionIndicatorsQuickAnswer()
    }

    if (PLATFORM_QUICK_QUESTIONS.warmStop.has(text)) {
        return formatWarmStopQuickAnswer()
    }

    if (PLATFORM_QUICK_QUESTIONS.stopDiff.has(text)) {
        return formatStopAnalyticsDifferenceQuickAnswer()
    }

    if (PLATFORM_QUICK_QUESTIONS.parkShore.has(text)) {
        return formatParkShoreQuickAnswer()
    }

    if (PLATFORM_QUICK_QUESTIONS.transport.has(text)) {
        return formatTransportDisciplineQuickAnswer()
    }

    return null
}

async function buildStopsPlotAnswer(
    mcp: Client | null,
    messages: UIMessage[],
) {
    const text = getLastUserText(messages)
    const wantsPlot = isPlotRequest(text)
    if (!wantsPlot) {
        return null
    }

    const sourceTool = isSafetyRequest(text) ? "get_stop_safety_events" : "get_stop_current_load_summary"
    if (!mcp) {
        try {
            const directOutput = await callDirectSupabaseStopTool(sourceTool)
            if (directOutput) {
                const answer = await synthesizeToolAnswer(messages, "stops", sourceTool, directOutput)
                const payload = parseToolPayload(directOutput)
                const rows = sourceTool === "get_stop_safety_events"
                    ? (Array.isArray(payload?.summary) ? payload.summary as Array<Record<string, unknown>> : [])
                    : (Array.isArray(payload?.rows) ? payload.rows as Array<Record<string, unknown>> : [])
                const chartOutput = rows.length > 0
                    ? await buildImageBarChart({
                        title: sourceTool === "get_stop_safety_events"
                            ? "График событий безопасности остановок"
                            : "График средней загруженности остановок",
                        x_values: rows.slice(0, 8).map((row) => String(row.name || row.location_id || row.label || row.alert_type || "точка")),
                        y_values: rows.slice(0, 8).map((row) => Number(row.avg_people || row.events_count || 0)),
                        unit: sourceTool === "get_stop_safety_events" ? "событ." : "чел.",
                    })
                    : ""
                const chart = chartOutput ? formatKnownToolOutput("build_bar_chart", chartOutput) : ""

                return [answer, chart].filter(Boolean).join("\n\n")
            }
        } catch (error) {
            console.warn("Direct Supabase stop fallback failed.", error)
        }

        return formatMcpUnavailable(sourceTool === "get_stop_safety_events"
            ? "события безопасности остановок"
            : "текущая загруженность остановок")
    }

    const sourceArgs = sourceTool === "get_stop_safety_events"
        ? { input: { hours: 24, limit: 30 } }
        : { input: { hours: 3, limit: 8 } }
    const sourceOutput = await callMcpTool(mcp, sourceTool, sourceArgs)
    if (!wantsPlot) {
        return synthesizeToolAnswer(messages, "stops", sourceTool, sourceOutput, sourceArgs)
    }

    let payload: Record<string, unknown>
    try {
        payload = JSON.parse(sourceOutput) as Record<string, unknown>
    } catch {
        return synthesizeToolAnswer(messages, "stops", sourceTool, sourceOutput, sourceArgs)
    }

    const rows = sourceTool === "get_stop_safety_events"
        ? (Array.isArray(payload.summary) ? payload.summary as Array<Record<string, unknown>> : [])
        : (Array.isArray(payload.rows) ? payload.rows as Array<Record<string, unknown>> : [])
    const points = sourceTool === "get_stop_safety_events"
        ? [...rows.reduce((acc, row) => {
            const label = String(row.label || row.alert_type || "событие")
            acc.set(label, (acc.get(label) || 0) + Number(row.events_count || 0))
            return acc
        }, new Map<string, number>()).entries()]
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8)
        : rows
            .slice(0, 8)
            .map((row) => ({
                label: String(row.location_id),
                value: Number(row.avg_people),
            }))
            .filter((point) => point.label && Number.isFinite(point.value))

    if (points.length === 0) {
        return synthesizeToolAnswer(messages, "stops", sourceTool, sourceOutput, sourceArgs)
    }

    const plotOutput = await callMcpTool(mcp, "create_plot", {
        input: {
            x_values: points.map((point) => point.label),
            y_values: points.map((point) => point.value),
            title: sourceTool === "get_stop_safety_events"
                ? "События безопасности остановок"
                : "Текущая загруженность остановок",
            chart_type: "bar",
        },
    })
    const sourceSummary = await synthesizeToolAnswer(messages, "stops", sourceTool, sourceOutput, sourceArgs)
    const plotSummary = formatKnownToolOutput("create_plot", plotOutput)

    return [sourceSummary, plotSummary].filter(Boolean).join("\n\n")
}

async function buildStopLoadTrashRelationAnswer(messages: UIMessage[]) {
    if (!isStopLoadTrashRelationRequest(getLastUserText(messages))) {
        return null
    }

    return formatStopLoadTrashRelationQuickAnswer(true)
}

async function buildTablesAnswer(
    mcp: Client | null,
    messages: UIMessage[],
) {
    if (!mcp || !isTablesRequest(getLastUserText(messages))) {
        return null
    }

    const output = await callMcpTool(mcp, "list_tables", {
        input: {
            limit: 100,
        },
    })

    return formatKnownToolOutput("list_tables", output) || output
}

async function buildStopsDataModesAnswer(mcp: Client | null, messages: UIMessage[]) {
    const text = getLastUserText(messages)
    if (!isDataModesRequest(text)) {
        return null
    }

    if (!mcp) {
        return [
            "В режиме «Остановки» предусмотрены live-данные по загруженности, событиям безопасности и графикам.",
            "",
            formatMcpUnavailable("список доступных live-данных"),
        ].join("\n")
    }

    const output = await callMcpTool(mcp, "list_assistant_data_modes", {})
    return formatAssistantDataModes(output) || output
}

function formatAssistantDataModes(output: string) {
    let payload: Record<string, unknown>

    try {
        payload = JSON.parse(output) as Record<string, unknown>
    } catch {
        return null
    }

    const modes = payload.modes as Record<string, unknown> | undefined
    const stops = modes?.stops as Record<string, unknown> | undefined
    const current = Array.isArray(stops?.current) ? stops.current : []
    const plan = Array.isArray(stops?.plan) ? stops.plan : []

    if (!stops) {
        return null
    }

    return [
        "Режим «Остановки» разделяет текущие live-данные и плановый аналитический контур.",
        "",
        "Текущие live-данные:",
        ...current.map((item) => `- ${item}`),
        "",
        "Плановый контур:",
        ...plan.map((item) => `- ${item}`),
        "",
        "Текущие значения подтверждаю только через live-источник и аналитические инструменты. Если источник недоступен, я прямо сообщаю об этом и не подставляю числа.",
    ].join("\n")
}

async function runKnownStopTool(mcp: Client | null, messages: UIMessage[]) {
    const forcedToolName = parseForcedToolName(messages)
    if (!forcedToolName || !STOP_KNOWN_TOOL_NAMES.has(forcedToolName)) {
        return null
    }

    if (!mcp) {
        try {
            const directOutput = await callDirectSupabaseStopTool(forcedToolName)
            if (directOutput) {
                return synthesizeToolAnswer(messages, "stops", forcedToolName, directOutput)
            }
        } catch (error) {
            console.warn("Direct Supabase stop fallback failed.", error)
        }

        return formatMcpUnavailable(forcedToolName)
    }

    if (forcedToolName === "create_plot") {
        return null
    }

    const args = getKnownStopToolArguments(forcedToolName)
    const output = await callMcpTool(mcp, forcedToolName, args)
    return synthesizeToolAnswer(messages, "stops", forcedToolName, output, args)
}

function getKnownStopToolArguments(toolName: string): Record<string, unknown> {
    if (toolName === "get_stop_current_load_summary") {
        return { input: { hours: 3, limit: 8 } }
    }

    if (toolName === "get_stop_safety_events") {
        return { input: { hours: 24, limit: 30 } }
    }

    if (toolName === "get_stop_lying_person_events") {
        return { input: { limit: 20 } }
    }

    return {}
}

function createCompletionWithHardTimeout(
    request: Parameters<typeof createGigaChatCompletion>[0],
    timeoutMs: number,
) {
    return withTimeout(
        createGigaChatCompletion(request),
        timeoutMs,
        `GigaChat completion timeout after ${timeoutMs}ms`,
    )
}

async function synthesizeToolAnswer(
    messages: UIMessage[],
    mode: AssistantMode,
    toolName: string,
    output: string,
    args: Record<string, unknown> = {},
) {
    const synthesisMessages = toGigaChatMessages(messages, getSystemPrompt(mode))
    pushFunctionResultForSynthesis(synthesisMessages, mode, toolName, output, args)

    try {
        const response = await createCompletionWithHardTimeout({
            messages: synthesisMessages,
            function_call: "none",
            max_tokens: GIGACHAT_MAX_TOKENS,
            temperature: 0.25,
        }, GIGACHAT_AFTER_TOOL_TIMEOUT_MS)

        const content = response.choices?.[0]?.message?.content?.trim()
        if (content) {
            return normalizeDateTimesForUser(content)
        }
    } catch (error) {
        console.warn("GigaChat synthesis failed, falling back to deterministic formatter.", error)
    }

    return normalizeDateTimesForUser(formatMcpFallback(toolName, output))
}

async function answerWithGigaChat(messages: UIMessage[], mode: AssistantMode) {
    const hardcodedQuickAnswer = await buildHardcodedQuickAnswer(messages, mode)
    if (hardcodedQuickAnswer) {
        return normalizeDateTimesForUser(hardcodedQuickAnswer)
    }

    const mcp = await connectMCP()
    let mcpTools: MCPToolDefinition[] = []

    if (mcp) {
        try {
            const toolsResult = await withTimeout(
                mcp.listTools(),
                MCP_LIST_TOOLS_TIMEOUT,
                "MCP tools list timeout"
            ) as { tools?: MCPToolDefinition[] }
            mcpTools = filterToolsForMode(toolsResult.tools || [], mode)
        } catch (error) {
            console.error("Failed to list MCP tools.", error)
            resetConnection()
        }
    }

    if (mode === "stops") {
        const knownToolAnswer = await runKnownStopTool(mcp, messages)
        if (knownToolAnswer) {
            return knownToolAnswer
        }

        const dataModesAnswer = await buildStopsDataModesAnswer(mcp, messages)
        if (dataModesAnswer) {
            return dataModesAnswer
        }

        const relationAnswer = await buildStopLoadTrashRelationAnswer(messages)
        if (relationAnswer) {
            return relationAnswer
        }
    }

    const tablesAnswer = await buildTablesAnswer(mcp, messages)
    if (tablesAnswer) {
        return tablesAnswer
    }

    if (mode === "stops") {
        const plotAnswer = await buildStopsPlotAnswer(mcp, messages)
        if (plotAnswer) {
            return plotAnswer
        }
    }

    const gigaMessages = toGigaChatMessages(messages, getSystemPrompt(mode))
    const functions = [
        ...getLocalToolDefinitions(mode),
        ...mcpTools.map(toGigaFunction),
    ]
    const forcedToolName = parseForcedToolName(messages)
    const forcedTool = forcedToolName
        ? mcpTools.find((tool) => tool.name === forcedToolName) || null
        : null
    if (forcedToolName && !forcedTool && mode === "platform") {
        return formatForcedToolUnavailable(forcedToolName, mode)
    }
    const directToolOutput = await runDirectNoArgTool(mcp, gigaMessages, mode, forcedTool)
    let lastToolName = forcedTool?.name || null
    let lastToolOutput = directToolOutput
    let forcedToolCallPending = Boolean(forcedTool && !directToolOutput)
    const wantsPlot = isPlotRequest(getLastUserText(messages))

    try {
        for (let step = 0; step < GIGACHAT_MAX_STEPS; step += 1) {
            const afterToolResult = hasUnansweredFunctionResult(gigaMessages)
            const shouldAllowPlotAfterData = (
                wantsPlot &&
                afterToolResult &&
                lastToolName !== "create_plot" &&
                functions.some((fn) => fn.name === "create_plot")
            )
            const forceSelectedTool = Boolean(forcedToolCallPending && forcedTool && !afterToolResult)
            const availableFunctions = forceSelectedTool
                ? functions.filter((fn) => fn.name === forcedTool?.name)
                : shouldAllowPlotAfterData
                    ? functions.filter((fn) => fn.name === "create_plot")
                    : functions
            const canCallFunction = availableFunctions.length > 0 && (!afterToolResult || shouldAllowPlotAfterData)
            const functionCallMode = forceSelectedTool && forcedTool
                ? { name: forcedTool.name }
                : canCallFunction
                    ? "auto"
                    : "none"
            const response = await createCompletionWithHardTimeout({
                messages: gigaMessages,
                functions: canCallFunction ? availableFunctions : undefined,
                function_call: functionCallMode,
                max_tokens: GIGACHAT_MAX_TOKENS,
                temperature: afterToolResult ? 0.25 : 0.15,
            }, afterToolResult ? GIGACHAT_AFTER_TOOL_TIMEOUT_MS : GIGACHAT_INITIAL_COMPLETION_TIMEOUT_MS)

            const message = response.choices?.[0]?.message
            const functionCall = getFunctionCall(message)

            if (functionCall?.name && isLocalToolName(functionCall.name)) {
                const args = parseToolArguments(functionCall.arguments)
                const output = await callLocalTool(mode, functionCall.name, args)
                lastToolName = functionCall.name
                lastToolOutput = output

                pushFunctionResultForSynthesis(gigaMessages, mode, functionCall.name, output, args)
                continue
            }

            if (functionCall?.name && mcp) {
                const args = parseToolArguments(functionCall.arguments)
                const output = await callMcpTool(mcp, functionCall.name, args)
                if (forcedTool?.name === functionCall.name) {
                    forcedToolCallPending = false
                }
                lastToolName = functionCall.name
                lastToolOutput = output

                pushFunctionResultForSynthesis(gigaMessages, mode, functionCall.name, output, args)
                continue
            }

            const content = message?.content?.trim()
            if (content && forceSelectedTool && forcedTool) {
                gigaMessages.push({
                    role: "system",
                    content: [
                        `Ответ описал сценарий без вызова функции ${forcedTool.name}.`,
                        "Это неприемлемо для готового аналитического вопроса: вызови функцию и только после результата формируй вывод.",
                    ].join("\n"),
                })
                continue
            }

            if (content) {
                return normalizeDateTimesForUser(content)
            }

            return "Не удалось получить содержательный ответ от GigaChat. Попробуйте переформулировать запрос."
        }
    } catch (error) {
        if (directToolOutput && forcedTool) {
            return formatMcpFallback(forcedTool.name, directToolOutput)
        }
        if (lastToolName && lastToolOutput) {
            return formatMcpFallback(lastToolName, lastToolOutput)
        }
        if (error instanceof GigaChatConnectionError) {
            return formatModelUnavailable()
        }
        throw error
    }

    return "Превышено количество шагов анализа. Уточните вопрос или сузьте период/модуль."
}

function sanitizeError(error: unknown) {
    if (error instanceof GigaChatConfigError) {
        console.warn("GigaChat configuration error.", error.message)
        return formatModelUnavailable()
    }

    if (error instanceof Error) {
        const sanitized = error.message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
        if (/GigaChat completion timeout|GigaChat request timed out|GigaChat API недоступен|ETIMEDOUT/i.test(sanitized)) {
            return formatModelUnavailable()
        }

        if (/MCP .*timeout|Failed to connect to MCP|MCP connection/i.test(sanitized)) {
            return formatMcpUnavailable("запрос к live-аналитике")
        }

        return `Ошибка ассистента: ${sanitized}`
    }

    return "Ошибка ассистента: неизвестная ошибка."
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}))
    const messages = Array.isArray(body.messages) ? body.messages as UIMessage[] : []
    const mode = getAssistantMode(body.mode)

    const stream = createUIMessageStream<UIMessage>({
        execute: async ({ writer }) => {
            writer.write({ type: "start" })
            writer.write({ type: "text-start", id: TEXT_PART_ID })

            try {
                const answer = await answerWithGigaChat(messages, mode)
                writer.write({ type: "text-delta", id: TEXT_PART_ID, delta: normalizeDateTimesForUser(answer) })
            } catch (error) {
                writer.write({ type: "text-delta", id: TEXT_PART_ID, delta: normalizeDateTimesForUser(sanitizeError(error)) })
            }

            writer.write({ type: "text-end", id: TEXT_PART_ID })
            writer.write({ type: "finish", finishReason: "stop" })
        },
    })

    return createUIMessageStreamResponse({ stream })
}
