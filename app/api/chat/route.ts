import { openai } from "@ai-sdk/openai"
import { convertToModelMessages, streamText, UIMessage, stepCountIs, jsonSchema } from "ai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://89.124.74.27:8000/sse"

// Таймауты (в мс)
const MCP_CONNECT_TIMEOUT = 10000   // 10 сек на подключение
const MCP_PING_TIMEOUT = 3000       // 3 сек на проверку соединения
const MCP_LIST_TOOLS_TIMEOUT = 5000 // 5 сек на получение списка инструментов
const MCP_CALL_TOOL_TIMEOUT = 15000 // 15 сек на вызов инструмента

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
        model: openai("gpt-5"),
        system: `Ты - AI-ассистент для анализа состояния дорог и трафика в городе Сургут. 
Ты помогаешь администрации города в приянтии управленческих решений. 
Ты помогаешь пользователям получать информацию о состоянии дорог, камерах наблюдения и статистике.
Отвечай на русском языке. Будь полезным.
У тебя есть доступ к инструментам для получения актуальных данных из базы данных.

Твоя задача — проводить глубокий анализ данных по запросу пользователя. 
Для ответов на сложные аналитические вопросы используй доступные инструменты.

Если пользователь просит построить график, сделай это.`,
        messages: await convertToModelMessages(messages),
        tools,
        toolChoice: "auto", // или 'auto', если хочешь включить вызовы
        stopWhen: stepCountIs(10),
    });

    return result.toUIMessageStreamResponse();
}
