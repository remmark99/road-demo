import "server-only"

import { Agent, request } from "node:https"
import { rootCertificates } from "node:tls"
import { MAX_ROOT_CA } from "@/lib/notifications/max-ca"

// Keep the additional trust local to MAX. Hostname and chain validation stay on.
const maxAgent = new Agent({ ca: [...rootCertificates, MAX_ROOT_CA] })

export function requestMax(path: string, token: string, body: unknown): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "platform-api2.max.ru",
      path,
      method: "POST",
      agent: maxAgent,
      headers: { Authorization: token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    }, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 1_048_576) {
          req.destroy(new Error("MAX response is too large"))
          return
        }
        chunks.push(chunk)
      })
      res.on("error", reject)
      res.on("end", () => {
        const status = res.statusCode ?? 502
        resolve(new Response(status === 204 ? null : Buffer.concat(chunks), {
          status,
          headers: res.headers["retry-after"] ? { "retry-after": res.headers["retry-after"] } : {},
        }))
      })
    })
    req.on("error", reject)
    req.end(JSON.stringify(body))
  })
}

/**
 * Загрузка файла на адрес, который MAX выдал в ответ на POST /uploads: одно поле формы «data».
 * Адрес чужой, поэтому токен бота сюда не передаётся; доверие к сертификатам — то же, что для MAX.
 */
export function uploadToMax(uploadUrl: string, file: { fileName: string; content: Buffer; contentType: string }): Promise<Response> {
  const url = new URL(uploadUrl)
  if (url.protocol !== "https:") return Promise.reject(new Error("MAX upload URL is not https"))
  const boundary = `----vector${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  const safeName = file.fileName.replace(/["\r\n\\]/g, "_")
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="${safeName}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    "utf8",
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  const body = Buffer.concat([head, file.content, tail])
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      agent: maxAgent,
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
      signal: AbortSignal.timeout(60_000),
    }, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 1_048_576) {
          req.destroy(new Error("MAX response is too large"))
          return
        }
        chunks.push(chunk)
      })
      res.on("error", reject)
      res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502 })))
    })
    req.on("error", reject)
    req.end(body)
  })
}
