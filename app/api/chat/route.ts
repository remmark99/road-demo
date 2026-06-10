import {
    createUIMessageStream,
    createUIMessageStreamResponse,
    type UIMessage,
} from "ai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import {
    createGigaChatCompletion,
    GigaChatConfigError,
    GigaChatConnectionError,
    type GigaChatFunctionCall,
    type GigaChatFunctionDefinition,
    type GigaChatMessage,
} from "@/lib/gigachat/client"

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

const MCP_SERVER_URL = normalizeMcpUrl(process.env.MCP_SERVER_URL || "http://127.0.0.1:8000/mcp")
const MCP_CONNECT_TIMEOUT = 20000
const MCP_PING_TIMEOUT = 7000
const MCP_LIST_TOOLS_TIMEOUT = 20000
const MCP_CALL_TOOL_TIMEOUT = 240000
const GIGACHAT_MAX_STEPS = 8
const GIGACHAT_MAX_TOKENS = 1200
const GIGACHAT_INITIAL_COMPLETION_TIMEOUT_MS = 30_000
const GIGACHAT_AFTER_TOOL_TIMEOUT_MS = 12_000
const MAX_FUNCTION_RESULT_CHARS = 12000
const TOOL_TAG_PATTERN = /\[ИСПОЛЬЗУЙ:\s*([\w-]+)\]\s*/i
const TEXT_PART_ID = "assistant-text"

let mcpClient: Client | null = null
let mcpConnected = false

const PLATFORM_SYSTEM_PROMPT = `Ты — ИИ-Ассистент платформы городского мониторинга «Вектор Города».
Режим: «Платформа». Ты помогаешь по всем 5 модулям: дороги, остановки, берег, парк, транспорт.

Главные правила:
- Не выдумывай текущие значения, динамику, причины и управленческие выводы без данных пользователя или результатов инструментов.
- Если нужны фактические числа по дорожному контуру или live-данным остановок, используй доступные функции.
- Если инструментов или данных по модулю нет, прямо скажи, что можешь объяснить структуру показателей, но не подтвердить текущие значения.
- Не говори «я вижу на графике» или «сейчас наблюдается», если это не подтверждено инструментом или сообщением пользователя.
- Отвечай на понятном русском языке, без SQL-терминов и внутренних названий таблиц, если пользователь сам их не попросил.

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

Ограничения:
- Не отвечай по дорогам, берегу, парку и транспорту в этом режиме; предложи переключиться в режим «Платформа».
- Не выдумывай значения, тренды и причины без результатов инструментов.
- Давай оценку ситуации только из фактов инструментов: где нагрузка выше, какие события повторяются, что требует внимания диспетчера.
- Не пиши внутренние названия таблиц, если пользователь сам не просит.`

function normalizeMcpUrl(rawUrl: string) {
    if (rawUrl.endsWith("/sse")) {
        return `${rawUrl.slice(0, -4)}/mcp`
    }

    return rawUrl
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), ms)
        }),
    ])
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

        const content = extractTextFromMessage(message).trim()
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

function parseForcedTool(messages: UIMessage[], availableTools: MCPToolDefinition[]) {
    const lastUserText = [...messages].reverse().find((message) => message.role === "user")
    const match = lastUserText ? extractTextFromMessage(lastUserText).match(TOOL_TAG_PATTERN) : null
    const toolName = match?.[1]

    if (!toolName) {
        return null
    }

    return availableTools.find((tool) => tool.name === toolName) || null
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
    return /загруж|нагруз|люд|пассаж|пик|очеред|толп|посещаем/i.test(text)
}

function isTablesRequest(text: string) {
    return /таблиц|схем|структур|баз[аеуы]? данных|доступн.*данн/i.test(text)
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

async function runDirectNoArgTool(
    mcp: Client | null,
    messages: GigaChatMessage[],
    forcedTool: MCPToolDefinition | null
): Promise<string | null> {
    if (!mcp || !forcedTool) {
        return null
    }

    const defaultArgs = getDefaultToolArguments(forcedTool)
    if (!defaultArgs) {
        messages.push({
            role: "system",
            content: `Пользователь попросил использовать функцию ${forcedTool.name}. Сначала вызови эту функцию и сам сформируй обязательные аргументы.`,
        })
        return null
    }

    const output = await callMcpTool(mcp, forcedTool.name, defaultArgs)
    messages.push({
        role: "assistant",
        content: "",
        function_call: { name: forcedTool.name, arguments: defaultArgs },
    })
    messages.push({
        role: "function",
        name: forcedTool.name,
        content: toGigaFunctionResultContent(forcedTool.name, output),
    })
    return output
}

function formatMcpFallback(toolName: string, output: string) {
    const formatted = formatKnownToolOutput(toolName, output)
    if (formatted) {
        return [
            "GigaChat не успел сформулировать ответ, поэтому показываю сводку по live-данным MCP:",
            "",
            formatted,
        ].join("\n")
    }

    const clippedOutput = output.length > 4000 ? `${output.slice(0, 4000)}\n...` : output

    return [
        `MCP-инструмент ${toolName} вернул данные, но GigaChat сейчас недоступен для аналитической формулировки ответа.`,
        "Ниже сырые данные инструмента, без выводов модели:",
        "",
        clippedOutput,
    ].join("\n")
}

function asNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatKnownToolOutput(toolName: string, output: string) {
    let payload: Record<string, unknown>

    try {
        payload = JSON.parse(output) as Record<string, unknown>
    } catch {
        return null
    }

    if (toolName === "get_stop_current_load_summary") {
        const rows = Array.isArray(payload.rows) ? payload.rows as Array<Record<string, unknown>> : []
        if (rows.length === 0) {
            return "По текущей загруженности остановок строки не вернулись. Проверь период или наличие свежих данных в аналитике."
        }

        const topRows = rows.slice(0, 5).map((row, index) => {
            const avg = asNumber(row.avg_people)
            const peak = asNumber(row.peak_people)
            return `${index + 1}. ${row.location_id}: средняя загрузка ${avg ?? "-"}, пик ${peak ?? "-"} человек.`
        })

        return [
            `Источник: ${payload.source || "live-данные остановок"}, последнее окно: ${payload.latest_window || "-"}.`,
            "Самые нагруженные направления:",
            ...topRows,
            "Оценка: внимание диспетчера в первую очередь на направления с высоким пиком и стабильной средней загрузкой.",
        ].join("\n")
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
            return `- ${label}: ${value.count} событий, локаций: ${value.locations || "-"}, последнее: ${value.latest || "-"}.`
        })

        return [
            `Источник: ${payload.source || "live-события остановок"}, последнее событие: ${payload.latest_event || "-"}.`,
            "Сводка по событиям:",
            ...summaryRows,
            "Оценка: повторяемые события и высокая severity требуют первичной проверки диспетчером.",
        ].join("\n")
    }

    if (toolName === "create_plot") {
        return `График построен: ${payload.url || payload.path || "файл создан"}.`
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

async function buildStopsPlotAnswer(
    mcp: Client | null,
    tools: MCPToolDefinition[],
    messages: UIMessage[],
) {
    if (!mcp) {
        return null
    }

    const text = getLastUserText(messages)
    const wantsPlot = isPlotRequest(text)
    if (!wantsPlot && !isSafetyRequest(text) && !isLoadRequest(text)) {
        return null
    }

    const toolNames = new Set(tools.map((tool) => tool.name))
    const sourceTool = isSafetyRequest(text) ? "get_stop_safety_events" : "get_stop_current_load_summary"
    if (!toolNames.has(sourceTool) || !toolNames.has("create_plot")) {
        return null
    }

    const sourceArgs = sourceTool === "get_stop_safety_events"
        ? { input: { hours: 24, limit: 30 } }
        : { input: { hours: 3, limit: 8 } }
    const sourceOutput = await callMcpTool(mcp, sourceTool, sourceArgs)
    const sourceSummary = formatKnownToolOutput(sourceTool, sourceOutput)
    if (!wantsPlot) {
        return sourceSummary
    }

    let payload: Record<string, unknown>
    try {
        payload = JSON.parse(sourceOutput) as Record<string, unknown>
    } catch {
        return sourceSummary
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
        return sourceSummary
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
    const plotSummary = formatKnownToolOutput("create_plot", plotOutput)

    return [sourceSummary, plotSummary].filter(Boolean).join("\n\n")
}

async function buildTablesAnswer(
    mcp: Client | null,
    tools: MCPToolDefinition[],
    messages: UIMessage[],
) {
    if (!mcp || !isTablesRequest(getLastUserText(messages))) {
        return null
    }

    if (!tools.some((tool) => tool.name === "list_tables")) {
        return null
    }

    const output = await callMcpTool(mcp, "list_tables", {
        input: {
            limit: 100,
        },
    })

    return formatKnownToolOutput("list_tables", output) || output
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

async function answerWithGigaChat(messages: UIMessage[], mode: AssistantMode) {
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

    const tablesAnswer = await buildTablesAnswer(mcp, mcpTools, messages)
    if (tablesAnswer) {
        return tablesAnswer
    }

    if (mode === "stops") {
        const plotAnswer = await buildStopsPlotAnswer(mcp, mcpTools, messages)
        if (plotAnswer) {
            return plotAnswer
        }
    }

    const gigaMessages = toGigaChatMessages(messages, getSystemPrompt(mode))
    const functions = mcpTools.map(toGigaFunction)
    const forcedTool = parseForcedTool(messages, mcpTools)
    const directToolOutput = await runDirectNoArgTool(mcp, gigaMessages, forcedTool)
    let lastToolName = forcedTool?.name || null
    let lastToolOutput = directToolOutput

    try {
        for (let step = 0; step < GIGACHAT_MAX_STEPS; step += 1) {
            const afterToolResult = gigaMessages.at(-1)?.role === "function"
            const canCallFunction = functions.length > 0 && !afterToolResult
            const response = await createCompletionWithHardTimeout({
                messages: gigaMessages,
                functions: canCallFunction ? functions : undefined,
                function_call: canCallFunction ? "auto" : "none",
                max_tokens: GIGACHAT_MAX_TOKENS,
            }, afterToolResult ? GIGACHAT_AFTER_TOOL_TIMEOUT_MS : GIGACHAT_INITIAL_COMPLETION_TIMEOUT_MS)

            const message = response.choices?.[0]?.message
            const functionCall = getFunctionCall(message)

            if (functionCall?.name && mcp) {
                const args = parseToolArguments(functionCall.arguments)
                const output = await callMcpTool(mcp, functionCall.name, args)
                lastToolName = functionCall.name
                lastToolOutput = output

                gigaMessages.push({
                    role: "assistant",
                    content: message?.content || "",
                    function_call: functionCall,
                })
                gigaMessages.push({
                    role: "function",
                    name: functionCall.name,
                    content: toGigaFunctionResultContent(functionCall.name, output),
                })
                continue
            }

            const content = message?.content?.trim()
            if (content) {
                return content
            }

            return "Не удалось получить содержательный ответ от GigaChat. Попробуйте переформулировать запрос."
        }
    } catch (error) {
        if (directToolOutput && forcedTool && error instanceof GigaChatConnectionError) {
            return formatMcpFallback(forcedTool.name, directToolOutput)
        }
        if (lastToolName && lastToolOutput) {
            return formatMcpFallback(lastToolName, lastToolOutput)
        }
        throw error
    }

    return "Превышено количество шагов анализа. Уточните вопрос или сузьте период/модуль."
}

function sanitizeError(error: unknown) {
    if (error instanceof GigaChatConfigError) {
        return error.message
    }

    if (error instanceof Error) {
        return `Ошибка ассистента: ${error.message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")}`
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
                writer.write({ type: "text-delta", id: TEXT_PART_ID, delta: answer })
            } catch (error) {
                writer.write({ type: "text-delta", id: TEXT_PART_ID, delta: sanitizeError(error) })
            }

            writer.write({ type: "text-end", id: TEXT_PART_ID })
            writer.write({ type: "finish", finishReason: "stop" })
        },
    })

    return createUIMessageStreamResponse({ stream })
}
