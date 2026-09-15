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
