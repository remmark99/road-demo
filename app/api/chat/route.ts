import { openai } from "@ai-sdk/openai"
import { convertToModelMessages, streamText, UIMessage, stepCountIs, jsonSchema } from "ai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://89.124.74.27:8000/sse"

// Cache the MCP client
let mcpClient: Client | null = null
let mcpConnected = false

async function connectMCP(): Promise<Client | null> {
    if (mcpConnected && mcpClient) {
        return mcpClient
    }

    try {
        const transport = new SSEClientTransport(new URL(MCP_SERVER_URL), {
            requestInit: {
                headers: {
                    Authorization: `Bearer my_secure_token_123`,
                },
            }
        })
        mcpClient = new Client(
            { name: "surgut-roads-client", version: "1.0.0" },
            { capabilities: {} }
        )

        await mcpClient.connect(transport)
        mcpConnected = true
        console.log("Connected to MCP server")
        return mcpClient
    } catch (error) {
        console.error("Failed to connect to MCP server:", error)
        return null
    }
}

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const client = await connectMCP();

    let tools: Record<string, any> = {};

    if (client) {
        try {
            const { tools: mcpTools } = await client.listTools();

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
                            const result = await client.callTool({
                                name,
                                arguments: args,
                            });
                            return result;
                        } catch (error) {
                            console.error(`Error calling tool ${name}:`, error);
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
