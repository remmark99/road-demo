import { openai } from "@ai-sdk/openai"
import { convertToModelMessages, streamText, UIMessage } from "ai"
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
        const transport = new SSEClientTransport(new URL(MCP_SERVER_URL))
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
    const { messages }: { messages: UIMessage[] } = await req.json()

    // Try to connect to MCP server
    const client = await connectMCP()

    // Get tools from MCP if connected
    let toolsDescription = ""
    if (client) {
        try {
            const { tools } = await client.listTools()
            if (tools.length > 0) {
                toolsDescription = `\n\nУ тебя есть доступ к следующим инструментам для получения данных:\n${tools.map(t => `- ${t.name}: ${t.description}`).join("\n")}\n\nЧтобы использовать инструмент, ответь в формате:\n[TOOL_CALL: имя_инструмента]\n{параметры в JSON}\n[/TOOL_CALL]`
            }
        } catch (e) {
            console.error("Failed to list MCP tools:", e)
        }
    }

    const result = streamText({
        model: openai("gpt-4o-mini"),
        system: `Ты - AI-ассистент для анализа дорожной ситуации в городе Сургут. 
Ты помогаешь пользователям получать информацию о состоянии дорог, камерах наблюдения, уведомлениях и статистике.
Отвечай на русском языке. Будь кратким и полезным.${toolsDescription}`,
        messages: await convertToModelMessages(messages),
    })

    return result.toUIMessageStreamResponse()
}

