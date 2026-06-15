import { setDefaultResultOrder } from "node:dns"
import { readFileSync } from "node:fs"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { connect as tlsConnect, type TLSSocket } from "node:tls"

type GigaChatRole = "system" | "user" | "assistant" | "function"

setDefaultResultOrder("ipv4first")

export interface GigaChatFunctionCall {
    name: string
    arguments?: unknown
}

export interface GigaChatMessage {
    role: GigaChatRole
    content?: string
    name?: string
    function_call?: GigaChatFunctionCall
}

export interface GigaChatFunctionDefinition {
    name: string
    description?: string
    parameters?: Record<string, unknown>
}

export interface GigaChatChatRequest {
    model?: string
    messages: GigaChatMessage[]
    functions?: GigaChatFunctionDefinition[]
    function_call?: "auto" | "none" | { name: string }
    temperature?: number
    max_tokens?: number
}

export interface GigaChatChatChoice {
    index: number
    message?: GigaChatMessage
    finish_reason?: string
}

export interface GigaChatChatResponse {
    choices?: GigaChatChatChoice[]
    model?: string
}

interface GigaChatTokenResponse {
    access_token?: string
    expires_at?: number
}

interface CachedToken {
    accessToken: string
    expiresAt: number
}

interface ProxyConfig {
    protocol: "http:"
    hostname: string
    port: string
    username: string
    password: string
}

const DEFAULT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
const DEFAULT_API_BASE_URL = "https://gigachat.devices.sberbank.ru/api/v1"
const DEFAULT_SCOPE = "GIGACHAT_API_PERS"
const DEFAULT_MODEL = "GigaChat-2-Max"
const TOKEN_FALLBACK_TTL_MS = 25 * 60 * 1000
const TOKEN_REFRESH_SKEW_MS = 60 * 1000
const DEFAULT_GIGACHAT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_GIGACHAT_NETWORK_ATTEMPTS = 1
const GIGACHAT_RETRY_DELAY_MS = 400

let cachedToken: CachedToken | null = null
let cachedExtraCaCert: string | null | undefined

export class GigaChatConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "GigaChatConfigError"
    }
}

export class GigaChatConnectionError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "GigaChatConnectionError"
    }
}

function getErrorCode(error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
        const code = (error as { code?: unknown }).code
        if (typeof code === "string") {
            return code
        }
    }

    if (error && typeof error === "object" && "cause" in error) {
        const cause = (error as { cause?: unknown }).cause
        if (cause && typeof cause === "object" && "code" in cause) {
            const code = (cause as { code?: unknown }).code
            return typeof code === "string" ? code : undefined
        }
    }

    return undefined
}

function toGigaChatConnectionError(error: unknown, target: string) {
    const code = getErrorCode(error)
    const suffix = code ? ` Код: ${code}.` : ""

    return new GigaChatConnectionError(
        `GigaChat ${target} недоступен: проверьте исходящий доступ к доменам GigaChat и сертификат Минцифры/Russian Trusted Root CA.${suffix}`
    )
}

function getAuthKey() {
    return process.env.GIGACHAT_AUTH_KEY || process.env.GIGACHAT_CREDENTIALS || ""
}

function getScope() {
    return process.env.GIGACHAT_SCOPE || DEFAULT_SCOPE
}

function getAuthUrl() {
    return process.env.GIGACHAT_AUTH_URL || DEFAULT_AUTH_URL
}

function getApiBaseUrl() {
    return (process.env.GIGACHAT_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "")
}

function getModel() {
    return process.env.GIGACHAT_MODEL || DEFAULT_MODEL
}

function cleanEnvValue(value: string | undefined) {
    const trimmed = value?.trim() || ""

    if (trimmed.length >= 2) {
        const first = trimmed[0]
        const last = trimmed[trimmed.length - 1]
        if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1).trim()
        }
    }

    return trimmed
}

function getExtraCaCert() {
    if (cachedExtraCaCert !== undefined) {
        return cachedExtraCaCert || undefined
    }

    const caPath = cleanEnvValue(process.env.GIGACHAT_CA_CERT_PATH || process.env.NODE_EXTRA_CA_CERTS)
    if (!caPath) {
        cachedExtraCaCert = null
        return undefined
    }

    try {
        cachedExtraCaCert = readFileSync(caPath, "utf8")
    } catch {
        cachedExtraCaCert = null
    }

    return cachedExtraCaCert || undefined
}

function stripInlineComment(value: string) {
    return value.replace(/\s+#.*$/, "").trim()
}

function safeDecodeURIComponent(value: string) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

function normalizeRawProxyUrl(rawProxyUrl: string) {
    const value = stripInlineComment(cleanEnvValue(rawProxyUrl))
    if (!value) {
        return ""
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        return value
    }

    return `http://${value}`
}

function getProxyConfigFromSplitEnv(): ProxyConfig | null {
    const host = cleanEnvValue(process.env.GIGACHAT_PROXY_HOST)
    if (!host) {
        return null
    }

    const protocol = cleanEnvValue(process.env.GIGACHAT_PROXY_PROTOCOL) || "http"
    if (protocol !== "http") {
        throw new GigaChatConfigError(
            "GigaChat proxy настроен некорректно: поддерживается HTTP CONNECT proxy. Укажите GIGACHAT_PROXY_PROTOCOL=http."
        )
    }

    const port = cleanEnvValue(process.env.GIGACHAT_PROXY_PORT) || "8080"
    if (!/^\d+$/.test(port)) {
        throw new GigaChatConfigError(
            "GigaChat proxy настроен некорректно: GIGACHAT_PROXY_PORT должен быть числом."
        )
    }

    return {
        protocol: "http:",
        hostname: host,
        port,
        username: cleanEnvValue(process.env.GIGACHAT_PROXY_USERNAME),
        password: cleanEnvValue(process.env.GIGACHAT_PROXY_PASSWORD),
    }
}

function parseProxyUrlLenient(proxyUrl: string): ProxyConfig {
    const normalized = normalizeRawProxyUrl(proxyUrl)
    const match = normalized.match(/^(https?):\/\/(.+)$/i)

    if (!match || match[1].toLowerCase() !== "http") {
        throw new Error("invalid proxy url")
    }

    const withoutPath = match[2].split(/[/?]/, 1)[0]
    const atIndex = withoutPath.lastIndexOf("@")
    const rawAuth = atIndex >= 0 ? withoutPath.slice(0, atIndex) : ""
    const rawHostPort = atIndex >= 0 ? withoutPath.slice(atIndex + 1) : withoutPath
    const colonIndex = rawHostPort.lastIndexOf(":")
    const hostname = colonIndex > 0 ? rawHostPort.slice(0, colonIndex) : rawHostPort
    const port = colonIndex > 0 ? rawHostPort.slice(colonIndex + 1) : "8080"

    if (!hostname || !/^\d+$/.test(port)) {
        throw new Error("invalid proxy host or port")
    }

    const authColonIndex = rawAuth.indexOf(":")
    const username = authColonIndex >= 0 ? rawAuth.slice(0, authColonIndex) : rawAuth
    const password = authColonIndex >= 0 ? rawAuth.slice(authColonIndex + 1) : ""

    return {
        protocol: "http:",
        hostname,
        port,
        username: safeDecodeURIComponent(username),
        password: safeDecodeURIComponent(password),
    }
}

function parseProxyUrl(proxyUrl: string): ProxyConfig {
    const normalized = normalizeRawProxyUrl(proxyUrl)

    try {
        const parsed = new URL(normalized)

        if (parsed.protocol !== "http:" || !parsed.hostname) {
            throw new Error("unsupported proxy url")
        }

        return {
            protocol: "http:",
            hostname: parsed.hostname,
            port: parsed.port || "8080",
            username: safeDecodeURIComponent(parsed.username),
            password: safeDecodeURIComponent(parsed.password),
        }
    } catch {
        try {
            return parseProxyUrlLenient(proxyUrl)
        } catch {
            throw new GigaChatConfigError(
                "GigaChat proxy настроен некорректно: проверьте GIGACHAT_PROXY_URL или задайте GIGACHAT_PROXY_HOST/PORT/USERNAME/PASSWORD. Если пароль содержит #, %, @ или :, лучше используйте отдельные переменные."
            )
        }
    }
}

function getProxyConfig(): ProxyConfig | null {
    const proxyUrl = cleanEnvValue(process.env.GIGACHAT_PROXY_URL)
    if (proxyUrl) {
        return parseProxyUrl(proxyUrl)
    }

    return getProxyConfigFromSplitEnv()
}

function isProxyConfigured() {
    return Boolean(
        cleanEnvValue(process.env.GIGACHAT_PROXY_URL) ||
        cleanEnvValue(process.env.GIGACHAT_PROXY_HOST)
    )
}

function isProxyRequired() {
    const value = process.env.GIGACHAT_PROXY_REQUIRED?.trim().toLowerCase()
    if (!value) {
        return true
    }

    return value === "1" || value === "true" || value === "yes"
}

export function getGigaChatRuntimeDiagnostics() {
    let proxyHost = ""
    let proxyPort = ""
    let proxyError = ""

    try {
        const proxy = getProxyConfig()
        proxyHost = proxy?.hostname || ""
        proxyPort = proxy?.port || ""
    } catch (error) {
        proxyError = error instanceof Error ? error.message : "GigaChat proxy настроен некорректно."
    }

    return {
        hasAuthKey: Boolean(getAuthKey().trim()),
        scope: getScope(),
        model: getModel(),
        authUrlHost: new URL(getAuthUrl()).hostname,
        apiBaseUrlHost: new URL(getApiBaseUrl()).hostname,
        requestTimeoutMs: getRequestTimeoutMs(),
        networkAttempts: getNetworkAttempts(),
        proxyRequired: isProxyRequired(),
        proxyConfigured: isProxyConfigured(),
        proxyHost,
        proxyPort,
        proxyError,
        nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ? "set" : "not-set",
        extraCaLoaded: Boolean(getExtraCaCert()),
    }
}

function getPositiveIntegerEnv(name: string, fallback: number, maximum: number) {
    const value = Number(process.env[name])

    if (!Number.isFinite(value) || value <= 0) {
        return fallback
    }

    return Math.min(Math.floor(value), maximum)
}

function getRequestTimeoutMs() {
    return getPositiveIntegerEnv(
        "GIGACHAT_REQUEST_TIMEOUT_MS",
        DEFAULT_GIGACHAT_REQUEST_TIMEOUT_MS,
        120_000,
    )
}

function getNetworkAttempts() {
    return getPositiveIntegerEnv(
        "GIGACHAT_NETWORK_ATTEMPTS",
        DEFAULT_GIGACHAT_NETWORK_ATTEMPTS,
        5,
    )
}

function asBasicAuthHeader(authKey: string) {
    return authKey.trim().toLowerCase().startsWith("basic ")
        ? authKey.trim()
        : `Basic ${authKey.trim()}`
}

function normalizeExpiresAt(expiresAt: unknown) {
    if (typeof expiresAt !== "number" || Number.isNaN(expiresAt)) {
        return Date.now() + TOKEN_FALLBACK_TTL_MS
    }

    if (expiresAt > 1_000_000_000_000) {
        return expiresAt
    }

    if (expiresAt > 1_000_000_000) {
        return expiresAt * 1000
    }

    return Date.now() + TOKEN_FALLBACK_TTL_MS
}

function requireAuthKey() {
    const authKey = getAuthKey().trim()

    if (!authKey) {
        throw new GigaChatConfigError(
            "GigaChat не настроен: задайте GIGACHAT_AUTH_KEY и GIGACHAT_SCOPE=GIGACHAT_API_PERS в серверном окружении."
        )
    }

    return authKey
}

function postText(
    url: string,
    headers: Record<string, string>,
    body: string,
): Promise<{ status: number, text: string }> {
    let proxyConfig: ProxyConfig | null = null

    if (isProxyRequired() && !isProxyConfigured()) {
        return Promise.reject(
            new GigaChatConfigError(
                "GigaChat proxy обязателен: задайте GIGACHAT_PROXY_URL или GIGACHAT_PROXY_HOST/PORT/USERNAME/PASSWORD."
            )
        )
    }

    try {
        proxyConfig = getProxyConfig()
    } catch (error) {
        return Promise.reject(error)
    }

    return new Promise((resolve, reject) => {
        const target = new URL(url)
        const payload = Buffer.from(body, "utf8")
        const req = httpsRequest(
            {
                protocol: target.protocol,
                hostname: target.hostname,
                port: target.port,
                path: `${target.pathname}${target.search}`,
                method: "POST",
                family: 4,
                minVersion: "TLSv1.2",
                maxVersion: "TLSv1.2",
                ca: getExtraCaCert(),
                agent: false,
                createConnection: proxyConfig
                    ? (_options, callback) => {
                        createProxyTlsSocket(target, proxyConfig)
                            .then((socket) => callback(null, socket))
                            .catch((error) => callback(error, null as never))
                        return null
                    }
                    : undefined,
                headers: {
                    ...headers,
                    "Content-Length": String(payload.byteLength),
                },
            },
            (res) => {
                const chunks: Buffer[] = []

                res.on("data", (chunk: Buffer | string) => {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
                })

                res.on("end", () => {
                    resolve({
                        status: res.statusCode || 0,
                        text: Buffer.concat(chunks).toString("utf8"),
                    })
                })
            }
        )

        req.setTimeout(getRequestTimeoutMs(), () => {
            const error = new Error("GigaChat request timed out") as Error & { code?: string }
            error.code = "ETIMEDOUT"
            req.destroy(error)
        })

        req.on("error", reject)
        req.write(payload)
        req.end()
    })
}

function createProxyTlsSocket(target: URL, proxy: ProxyConfig): Promise<TLSSocket> {
    const targetPort = target.port || "443"
    const proxyHeaders: Record<string, string> = {
        Host: `${target.hostname}:${targetPort}`,
    }

    if (proxy.username || proxy.password) {
        proxyHeaders["Proxy-Authorization"] = `Basic ${Buffer.from(
            `${proxy.username}:${proxy.password}`
        ).toString("base64")}`
    }

    return new Promise((resolve, reject) => {
        let settled = false
        const finish = (error: Error | null, socket?: TLSSocket) => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(hardTimeout)
            if (error) {
                reject(error)
                return
            }
            resolve(socket as TLSSocket)
        }
        const hardTimeout = setTimeout(() => {
            const error = new Error("GigaChat proxy CONNECT timed out") as Error & { code?: string }
            error.code = "ETIMEDOUT"
            connectRequest.destroy(error)
            finish(error)
        }, getRequestTimeoutMs())
        const connectRequest = httpRequest({
            hostname: proxy.hostname,
            port: proxy.port,
            method: "CONNECT",
            path: `${target.hostname}:${targetPort}`,
            headers: proxyHeaders,
            timeout: getRequestTimeoutMs(),
        })

        connectRequest.once("connect", (response, socket) => {
            if (response.statusCode !== 200) {
                socket.destroy()
                finish(new Error(`GigaChat proxy CONNECT error ${response.statusCode}`))
                return
            }

            const tlsSocket = tlsConnect({
                socket,
                servername: target.hostname,
                minVersion: "TLSv1.2",
                maxVersion: "TLSv1.2",
                ca: getExtraCaCert(),
            })

            tlsSocket.once("secureConnect", () => finish(null, tlsSocket))
            tlsSocket.once("error", finish)
        })

        connectRequest.once("timeout", () => {
            const error = new Error("GigaChat proxy CONNECT timed out") as Error & { code?: string }
            error.code = "ETIMEDOUT"
            connectRequest.destroy(error)
            finish(error)
        })
        connectRequest.once("error", finish)
        connectRequest.end()
    })
}

function wait(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

function isRetryableNetworkError(error: unknown) {
    const code = getErrorCode(error)
    return code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ECONNRESET"
}

async function postTextWithRetry(
    url: string,
    headers: Record<string, string>,
    body: string,
) {
    let lastError: unknown

    const attempts = getNetworkAttempts()

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await postText(url, headers, body)
        } catch (error) {
            lastError = error

            if (!isRetryableNetworkError(error) || attempt === attempts) {
                break
            }

            await wait(GIGACHAT_RETRY_DELAY_MS * attempt)
        }
    }

    throw lastError
}

function parseJson<T>(text: string, context: string): T {
    try {
        return JSON.parse(text) as T
    } catch {
        throw new Error(`${context} response is not valid JSON.`)
    }
}

async function fetchAccessToken() {
    const authKey = requireAuthKey()
    const body = new URLSearchParams()
    body.set("scope", getScope())

    let response: { status: number, text: string }

    try {
        response = await postTextWithRetry(
            getAuthUrl(),
            {
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "RqUID": crypto.randomUUID(),
                "Authorization": asBasicAuthHeader(authKey),
            },
            body.toString(),
        )
    } catch (error) {
        if (error instanceof GigaChatConfigError) {
            throw error
        }
        throw toGigaChatConnectionError(error, "OAuth")
    }

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`GigaChat OAuth error ${response.status}: ${response.text.slice(0, 300)}`)
    }

    const payload = parseJson<GigaChatTokenResponse>(response.text, "GigaChat OAuth")

    if (!payload.access_token) {
        throw new Error("GigaChat OAuth response does not contain access_token.")
    }

    cachedToken = {
        accessToken: payload.access_token,
        expiresAt: normalizeExpiresAt(payload.expires_at),
    }

    return cachedToken.accessToken
}

export async function getGigaChatAccessToken() {
    if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS) {
        return cachedToken.accessToken
    }

    return fetchAccessToken()
}

export async function createGigaChatCompletion(request: GigaChatChatRequest): Promise<GigaChatChatResponse> {
    const accessToken = await getGigaChatAccessToken()
    let response: { status: number, text: string }

    try {
        response = await postTextWithRetry(
            `${getApiBaseUrl()}/chat/completions`,
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
            },
            JSON.stringify({
                model: request.model || getModel(),
                temperature: request.temperature ?? 0.2,
                ...request,
            }),
        )
    } catch (error) {
        if (error instanceof GigaChatConfigError) {
            throw error
        }
        throw toGigaChatConnectionError(error, "API")
    }

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`GigaChat API error ${response.status}: ${response.text.slice(0, 500)}`)
    }

    return parseJson<GigaChatChatResponse>(response.text, "GigaChat API")
}
