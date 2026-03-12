import { createOpenAI } from "@ai-sdk/openai"

const openai = createOpenAI({
    baseURL: "https://routerai.ru/api/v1",
    apiKey: process.env.OPENAI_API_KEY2,
})
import { convertToModelMessages, streamText, UIMessage, stepCountIs, jsonSchema } from "ai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://89.124.74.27:8000/sse"
console.log(process.env.OPENAI_API_KEY2)
// Таймауты (в мс)
const MCP_CONNECT_TIMEOUT = 20000    // 20 сек на подключение
const MCP_PING_TIMEOUT = 7000        // 7 сек на проверку соединения
const MCP_LIST_TOOLS_TIMEOUT = 20000 // 20 сек на получение списка инструментов
const MCP_CALL_TOOL_TIMEOUT = 240000 // 240 сек на вызов инструмента (сложные SQL)

// Cache the MCP client
let mcpClient: Client | null = null
let mcpConnected = false

// 🔧 Утилита для добавления таймаута к Promise
function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage?: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage || `Timeout after ${ms}ms`)), ms)
        )
    ]);
}

// 🔌 Сброс соединения
function resetConnection() {
    console.log("🔄 Resetting MCP connection...");
    mcpConnected = false;
    mcpClient = null;
}

async function connectMCP(): Promise<Client | null> {
    // Проверяем, что существующее соединение ещё живо
    if (mcpConnected && mcpClient) {
        try {
            // Ping — пробуем получить список инструментов с таймаутом
            await withTimeout(
                mcpClient.listTools(),
                MCP_PING_TIMEOUT,
                "MCP ping timeout - connection stale"
            );
            return mcpClient;
        } catch (error) {
            console.warn("⚠️ MCP connection stale, reconnecting...", error);
            resetConnection();
        }
    }

    try {
        console.log("🔌 Connecting to MCP server:", MCP_SERVER_URL);

        const transport = new SSEClientTransport(new URL(MCP_SERVER_URL), {
            requestInit: {
                headers: {
                    Authorization: `Bearer my_secure_token_123`,
                },
            }
        })

        const newClient = new Client(
            { name: "surgut-roads-client", version: "1.0.0" },
            { capabilities: {} }
        )

        // Подключаемся с таймаутом
        await withTimeout(
            newClient.connect(transport),
            MCP_CONNECT_TIMEOUT,
            "MCP connection timeout"
        );

        mcpClient = newClient;
        mcpConnected = true;
        console.log("✅ Connected to MCP server");
        return mcpClient;
    } catch (error) {
        console.error("❌ Failed to connect to MCP server:", error);
        resetConnection();
        return null;
    }
}

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const client = await connectMCP();

    let tools: Record<string, any> = {};

    if (client) {
        try {
            const listToolsResult = await withTimeout(
                client.listTools(),
                MCP_LIST_TOOLS_TIMEOUT,
                "listTools timeout"
            ) as { tools: Array<{ name: string; description?: string; inputSchema?: any }> };
            const mcpTools = listToolsResult.tools;

            for (const mcpTool of mcpTools) {
                const name = mcpTool.name;
                const description = mcpTool.description || "";

                // Берём inputSchema, если есть, иначе — пустой объект
                const schema = mcpTool.inputSchema;

                let jsonSchemaProps;
                let jsonSchemaRequired;

                if (!schema || schema.type !== "object") {
                    // Если schema нет или не object, считаем, что инструмент не принимает параметров
                    jsonSchemaProps = {};
                    jsonSchemaRequired = [];
                    console.warn(`[tools] Invalid schema for tool '${name}': using empty object schema`, schema);
                } else {
                    jsonSchemaProps = schema.properties || {};
                    jsonSchemaRequired = Array.isArray(schema.required) ? schema.required : [];
                }

                // Гарантированно передаём в jsonSchema валидный объект
                tools[name] = {
                    description,
                    inputSchema: jsonSchema({
                        type: "object",
                        properties: jsonSchemaProps,
                        required: jsonSchemaRequired,
                    }),
                    execute: async (args: any) => {
                        console.log(`Executing tool ${name} with args:`, args);
                        try {
                            const result = await withTimeout(
                                client.callTool({
                                    name,
                                    arguments: args,
                                }),
                                MCP_CALL_TOOL_TIMEOUT,
                                `Tool '${name}' timeout after ${MCP_CALL_TOOL_TIMEOUT}ms`
                            );
                            return result;
                        } catch (error) {
                            console.error(`Error calling tool ${name}:`, error);
                            // Сбрасываем соединение при ошибке
                            resetConnection();
                            throw error;
                        }
                    },
                };
            }
        } catch (e) {
            console.error("Failed to list MCP tools:", e);
        }
    }

    const result = streamText({
        model: openai("openai/gpt-5.1-chat"),
        system: `Ты - AI-ассистент для анализа состояния дорог и трафика в городе Сургут. 
Ты помогаешь администрации города в принятии управленческих решений. 
Отвечай на литературном и понятном русском языке. Ты общаешься с уважаемыми людьми.
Будь полезным и конкретным.

## ГЛОССАРИЙ ТЕРМИНОВ

Используй эту терминологию при общении с пользователями:

**ИНЦИДЕНТ** — зафиксированный системой факт неудовлетворительного состояния дороги или элементов дорожной инфраструктуры. Инцидент появляется в момент, когда система впервые обнаруживает проблему.
Примеры: снежная каша на проезжей части, подтопление дороги, открытый люк, покосившийся дорожный знак, неработающее освещение.

**НАРУШЕНИЕ** — это Инцидент, который не был устранён в установленный нормативный срок. Проще говоря: Инцидент — это сама проблема, Нарушение — это проблема, которая существует слишком долго. Нарушения являются основным управленческим индикатором качества работы подрядчиков.

**ТИП РАБОТ** — какие действия требуются для устранения проблемы:
- УБОРКА: очистка и приведение дороги в нормативное состояние (снежная каша, снежные валы и снежные кучи, грязь на дорогах, подтопления)
- РЕМОНТ: восстановление или замена элементов инфраструктуры (открытые люки, дорожные знаки, освещение, разметка)

**ТИП ИНЦИДЕНТА** — конкретный вид проблемы: снежная каша, снежный вал, снежная куча, подтопление, грязь на дороге, открытый люк, покосившийся знак, неработающее освещение.

**ВРЕМЯ РЕАКЦИИ** — промежуток времени от момента обнаружения инцидента до начала работ по его устранению. Показатель отражает, насколько оперативно подрядчик отреагировал на проблему.

**НОРМАТИВЫ ВРЕМЕНИ РЕАКЦИИ (SLA ПО РЕАКЦИИ)**:
- Уборка: начало работ в течение 12 часов
- Ремонт: начало работ в течение 24 часов

**ВРЕМЯ УСТРАНЕНИЯ** — промежуток времени от момента обнаружения инцидента до полного восстановления нормативного состояния.

**КОГДА ИНЦИДЕНТ СТАНОВИТСЯ НАРУШЕНИЕМ (SLA ПО УСТРАНЕНИЮ)**:
- Уборка: не выполнена в течение 18 часов
- Открытый люк: не закрыт в течение 8 часов
- Дорожные знаки, освещение, разметка: проблема сохраняется 100 часов и более

**ПРОСРОЧКА** — ситуация, когда подрядчик слишком поздно начал работы (превышено время реакции) и/или слишком долго устранял проблему (превышено время устранения).

**ПРОЦЕНТ ПРОСРОЧЕННЫХ ИНЦИДЕНТОВ** — доля инцидентов, по которым были превышены нормативные сроки устранения. Ключевой показатель качества содержания территории.

**ПОДРЯДЧИК** — организация, ответственная за содержание дорожной инфраструктуры в пределах своей зоны ответственности.

**ЗОНА ОТВЕТСТВЕННОСТИ** — территория города, закреплённая за конкретным подрядчиком.

**МАТРИЦА ЭФФЕКТИВНОСТИ** — сравнительный инструмент, показывающий масштаб зоны ответственности подрядчика и качество его работы.

## ПРАВИЛА ФОРМАТИРОВАНИЯ

ВСЕГДА используй полные термины вместо сокращений и технического жаргона:
- p95 → 95-й процентиль
- p90 → 90-й процентиль
- p50 → медиана (50-й процентиль)
- avg, mean → среднее значение
- std, σ → стандартное отклонение
- SLA → нормативы / регламент
- Не пиши SQL термины, названия таблиц, технические детали — твои пользователи управленцы, не программисты.

## ПОЛИТИКА ОТВЛЕЧЁННЫХ ТЕМ

Если пользователь задаёт вопрос, НЕ связанный с дорогами, транспортом, подрядчиками, инцидентами или управлением городом — НЕ отвечай сразу.

Вежливо уточни: "Я ассистент по дорожной инфраструктуре города Сургут. Моя основная задача — помогать в анализе состояния дорог и работы подрядчиков. Если вы всё же хотите обсудить другую тему, подтвердите это, и я постараюсь помочь."

После подтверждения пользователя — можешь ответить на отвлечённый вопрос.

## ДОСТУПНЫЕ АНАЛИТИЧЕСКИЕ ИНСТРУМЕНТЫ

У тебя есть специализированные инструменты для анализа данных. ОБЯЗАТЕЛЬНО используй их при соответствующих вопросах:

| Тема вопроса | Инструмент | Описание |
|-------------|-----------|----------|
| Задержки реакции подрядчиков | analyze_reaction_tails | Хвосты распределения времени реакции (95-й процентиль) |
| Категории проблем, сложности реагирования | rate_problem_categories | Рейтинг по 90-му процентилю времени реакции |
| Часы суток, нарушения регламента | analyze_hourly_violations | Почасовой анализ провалов |
| Дни недели, дисциплина | analyze_contractor_discipline_weekly | Анализ выходных vs будней |
| Эффективность спецтехники | analyze_machinery_efficiency | Процент успешных выездов |
| Влияние техники на скорость | analyze_cleaning_impact_on_traffic | Анализ До/После |
| Пробелы в данных камер | monitor_camera_data_quality | Топ-20 камер с проблемами |
| Погода и нарушения SLA | analyze_sla_weather_dependency | Корреляция осадков и нарушений |

## ИНСТРУКЦИИ

1. Если видишь тег [ИСПОЛЬЗУЙ: имя_инструмента] — НЕМЕДЛЕННО вызови указанный инструмент без дополнительных вопросов. 
   + По возможности построй график (если нужно, то можно несколько) из полученных данных.
2. После получения данных — проанализируй их и дай развёрнутый ответ с конкретными выводами.
3. Выделяй ключевые цифры и тренды.
4. Если данные позволяют — предложи построить график с помощью create_plot.
5. Для произвольных SQL запросов используй execute_sql_select.`,
        messages: await convertToModelMessages(messages),
        tools,
        toolChoice: "auto", // или 'auto', если хочешь включить вызовы
        stopWhen: stepCountIs(20),
    });

    return result.toUIMessageStreamResponse();
}
