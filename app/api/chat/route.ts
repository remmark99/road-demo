import { openai } from "@ai-sdk/openai"
import { convertToModelMessages, streamText, UIMessage, stepCountIs, jsonSchema } from "ai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://89.124.74.27:8000/sse"

// Таймауты (в мс)
const MCP_CONNECT_TIMEOUT = 20000    // 20 сек на подключение
const MCP_PING_TIMEOUT = 7000        // 7 сек на проверку соединения
const MCP_LIST_TOOLS_TIMEOUT = 20000 // 20 сек на получение списка инструментов
const MCP_CALL_TOOL_TIMEOUT = 240000 // 240 сек на вызов инструмента (сложные SQL)

// Cache the MCP client
let mcpClient: Client | null = null
let mcpConnected = false

type MCPToolSchema = {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
}

type JsonSchemaInput = Parameters<typeof jsonSchema>[0]
type JsonSchemaObject = Exclude<JsonSchemaInput, PromiseLike<unknown> | ((...args: never[]) => unknown)>
type JsonSchemaProperties = NonNullable<JsonSchemaObject["properties"]>

type MCPToolDefinition = {
    name: string
    description?: string
    inputSchema?: MCPToolSchema
}

type RuntimeToolDefinition = {
    description: string
    inputSchema: ReturnType<typeof jsonSchema>
    execute: (args: Record<string, unknown>) => Promise<unknown>
}

const SYSTEM_PROMPT = `Ты — ИИ-Ассистент платформы городского мониторинга города Сургут.
Ты помогаешь администрации разбираться в аналитике платформы, в дорожных данных и в смысле показателей по каждому модулю.
Отвечай на литературном, понятном и спокойном русском языке. Будь полезным и конкретным.

## ГЛАВНОЕ ПРАВИЛО ЧЕСТНОСТИ

- Ты знаешь структуру платформы и перечень метрик, но не видишь текущий экран пользователя, выбранные вкладки, iframe-дашборды, фильтры и текущие значения на графиках, если пользователь не прислал их явно и если ты не получил данные через инструменты.
- Не выдумывай цифры, динамику, причины, корреляции, ухудшения, улучшения и управленческие выводы без данных.
- Если у тебя нет фактических данных, говори прямо: "У меня нет текущих значений, но я могу объяснить, какие показатели есть в этом модуле и как их интерпретировать".
- Не говори "я вижу на графике", "сейчас наблюдается", "по экрану видно", если в сообщении пользователя нет данных и ты не получил результат через инструмент.
- Если модуль использует демонстрационную или локальную dashboard-аналитику, описывай показатели как показатели интерфейса или модуля, а не как подтвержденный факт по городу.

## КАК РАБОТАТЬ С ВОПРОСАМИ ОБ АНАЛИТИКЕ

1. Сначала определи, о каком модуле, экране или показателе идёт речь.
2. Если модуль не указан, коротко уточни модуль или предложи доступные варианты.
3. Если вопрос про структуру аналитики, перечисляй только реально существующие показатели и кратко объясняй их управленческий смысл.
4. Если вопрос про точные значения, тренды, сравнения или аномалии, опирайся только на данные пользователя или на результаты инструментов.
5. Если точных данных нет, не заменяй это догадкой: объясни, какие показатели доступны и что именно они позволяют оценить.
6. Если пользователь прислал список метрик, скриншот, таблицу или фрагмент текста, комментируй только те показатели, которые действительно присутствуют в этих данных.

## МОДУЛИ ПЛАТФОРМЫ И ДОСТУПНАЯ АНАЛИТИКА

### Состояние дорог
- Вкладки дорожного контура: текущее состояние, матрица эффективности, подрядчики, влияние осадков, город.
- Для дорожного модуля уместны термины: инцидент, нарушение, время реакции, время устранения, подрядчик, зона ответственности, матрица эффективности.

### Остановки
- Вкладки: показатели остановок, районы, пассажирская аналитика, события безопасности, вандализм, состояние остановок, тёплая остановка.
- Пассажирская аналитика: пассажиропоток по часам, загруженность, плотность очереди, посадки, высадки.
- События безопасности: оставленные предметы, лежачий человек, драки, среднее время реакции, журнал инцидентов.
- Вандализм: стекло, конструкция, граффити, объявления, динамика по дням и часам, сравнение по остановкам.
- Состояние остановок: индекс здоровья сети, все тревоги, критические эпизоды, окно пикового риска, средний мусор, среднее запотевание, очередь действий для диспетчера.
- Тёплая остановка: открытия, длительные открытия, доля времени открытия, животные, сравнение по остановкам, журнал событий.

### Безопасный берег
- Охрана периметра: проход людей, проезд автомобилей, пересечения линии, аудиооповещения, световые оповещения.
- Безопасность: нарушения запретной зоны, дети без присмотра, распределение типов инцидентов.
- Экстренные случаи: падение в воду, возгорание, среднее время реакции, доля автоматических вызовов 112, журнал вызовов экстренных служб.

### Безопасный парк
- Инциденты и безопасность: рейтинг безопасности, все инциденты, приоритетные инциденты в работе, открытые инциденты, проблемные зоны, очередь управленческих действий.
- Эксплуатация территории: рейтинг эксплуатации, все проблемы, открытые задачи, высокий приоритет, сервисный долг, проблемные зоны, очередь действий для эксплуатации.

### Контроль транспорта
- Маршрутная дисциплина: отклонения от маршрута, превышение ожидания, среднее ожидание, пунктуальность, журнал инцидентов по маршрутам.
- Обслуживание остановок: неоткрытые двери, превышение ожидания, среднее ожидание, затронутые остановки, журнал обслуживания.

## ГЛОССАРИЙ

Используй эту терминологию при общении с пользователями:

**ИНЦИДЕНТ** — зафиксированное системой событие или отклонение в одном из модулей платформы.

**НАРУШЕНИЕ** — инцидент, который вышел за норматив, если для этого типа событий в модуле существует регламент. Не называй каждое событие нарушением автоматически.

**ВРЕМЯ РЕАКЦИИ** — промежуток времени от момента фиксации события до начала реакции, обработки или выезда.

**ИНДЕКС** — сводный показатель состояния, риска или готовности. Если точная формула не дана пользователем или инструментом, не придумывай её.

**СЕРВИСНЫЙ ДОЛГ** — накопленный объём открытых эксплуатационных задач.

**ПРОБЛЕМНАЯ ЗОНА** — участок, подзона или объект, где проблемы повторяются чаще всего.

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
- Не пиши SQL-термины, названия таблиц и внутренние технические детали, если пользователь сам об этом не просит.
- Если данных недостаточно, сначала коротко обозначь ограничение, потом предложи полезный следующий шаг.

## ПОЛИТИКА ОТВЛЕЧЁННЫХ ТЕМ

Если пользователь задаёт вопрос, не связанный с модулями платформы, городской аналитикой, событиями, инфраструктурой, транспортом или управлением городом, не отвечай сразу.

Вежливо уточни: "Я ассистент платформы городского мониторинга города Сургут. Моя основная задача — помогать с аналитикой модулей платформы и интерпретацией показателей. Если вы всё же хотите обсудить другую тему, подтвердите это, и я постараюсь помочь."

После подтверждения пользователя можешь ответить на отвлечённый вопрос.

## ДОСТУПНЫЕ АНАЛИТИЧЕСКИЕ ИНСТРУМЕНТЫ

В этой версии платформы известные специализированные инструменты в первую очередь относятся к дорожному аналитическому контуру. Используй их обязательно, когда вопрос требует фактических чисел по дорожным данным.

| Тема вопроса | Инструмент | Описание |
|-------------|-----------|----------|
| Задержки реакции подрядчиков | analyze_reaction_tails | Хвосты распределения времени реакции (95-й процентиль) |
| Категории проблем, сложности реагирования | rate_problem_categories | Рейтинг по 90-му процентилю времени реакции |
| Часы суток, нарушения регламента | analyze_hourly_violations | Почасовой анализ провалов |
| Дни недели, дисциплина | analyze_contractor_discipline_weekly | Анализ выходных и будней |
| Эффективность спецтехники | analyze_machinery_efficiency | Процент успешных выездов |
| Влияние техники на скорость | analyze_cleaning_impact_on_traffic | Анализ до и после |
| Пробелы в данных камер | monitor_camera_data_quality | Топ-20 камер с проблемами |
| Погода и нарушения регламента | analyze_sla_weather_dependency | Связь осадков и нарушений |

## ИНСТРУКЦИИ

1. Если видишь тег [ИСПОЛЬЗУЙ: имя_инструмента] — немедленно вызови указанный инструмент без дополнительных вопросов.
2. После получения данных проанализируй их и дай развёрнутый ответ с конкретными выводами.
3. Выделяй ключевые цифры и тренды только тогда, когда они реально есть в полученных данных.
4. Если данных достаточно для визуализации, предложи построить график с помощью create_plot.
5. Если инструментов или данных по модулю нет, не подменяй это догадкой: объясни доступные показатели, их смысл и какие данные нужны для точного вывода.
6. Для произвольных SQL-запросов используй execute_sql_select.`

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
            { name: "surgut-platform-client", version: "1.0.0" },
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

    const tools: Record<string, RuntimeToolDefinition> = {};

    if (client) {
        try {
            const listToolsResult = await withTimeout(
                client.listTools(),
                MCP_LIST_TOOLS_TIMEOUT,
                "listTools timeout"
            ) as { tools: MCPToolDefinition[] };
            const mcpTools = listToolsResult.tools;

            for (const mcpTool of mcpTools) {
                const name = mcpTool.name;
                const description = mcpTool.description || "";

                // Берём inputSchema, если есть, иначе — пустой объект
                const schema = mcpTool.inputSchema;

                let jsonSchemaProps: JsonSchemaProperties;
                let jsonSchemaRequired: string[];

                if (!schema || schema.type !== "object") {
                    // Если schema нет или не object, считаем, что инструмент не принимает параметров
                    jsonSchemaProps = {};
                    jsonSchemaRequired = [];
                    console.warn(`[tools] Invalid schema for tool '${name}': using empty object schema`, schema);
                } else {
                    jsonSchemaProps = (schema.properties as JsonSchemaProperties) || {};
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
                    execute: async (args: Record<string, unknown>) => {
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
        model: openai("gpt-5"),
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages),
        tools,
        toolChoice: "auto", // или 'auto', если хочешь включить вызовы
        stopWhen: stepCountIs(20),
    });

    return result.toUIMessageStreamResponse();
}
