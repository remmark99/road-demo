import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE_URL =
    process.env.ROAD_DEMO_BASE_URL || 'https://road-demo-eight.vercel.app'
const EMAIL = process.env.ROAD_DEMO_EMAIL || 'admin@admin.ru'
const PASSWORD = process.env.ROAD_DEMO_PASSWORD || 'admin'
const LOGIN_URL = new URL('/login', BASE_URL).toString()

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForJson(url, timeout = 15000) {
    const started = Date.now()

    while (Date.now() - started < timeout) {
        try {
            const response = await fetch(url)
            if (response.ok) {
                return response.json()
            }
        } catch {
            // Chrome might not be ready yet.
        }

        await sleep(250)
    }

    throw new Error(`Timeout waiting for ${url}`)
}

async function main() {
    const port = 9222
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-demo-auth-'))
    const chrome = spawn(
        'google-chrome',
        [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1440,1200',
            `--user-data-dir=${userDataDir}`,
            `--remote-debugging-port=${port}`,
            LOGIN_URL,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let stderr = ''
    chrome.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
    })

    try {
        const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`)
        const target =
            targets.find((item) => String(item.url || '').includes(BASE_URL)) ||
            targets[0]

        if (!target) {
            throw new Error('No Chrome target found')
        }

        const socket = new WebSocket(target.webSocketDebuggerUrl)
        const pending = new Map()
        const events = []
        let id = 0

        function send(method, params = {}) {
            return new Promise((resolve, reject) => {
                const messageId = ++id
                pending.set(messageId, { resolve, reject })
                socket.send(JSON.stringify({ id: messageId, method, params }))
            })
        }

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data)

            if (message.id && pending.has(message.id)) {
                const request = pending.get(message.id)
                pending.delete(message.id)

                if (message.error) {
                    request.reject(new Error(JSON.stringify(message.error)))
                } else {
                    request.resolve(message.result)
                }

                return
            }

            if (message.method === 'Page.frameNavigated') {
                events.push({
                    type: 'navigated',
                    url: message.params.frame.url,
                })
            }

            if (message.method === 'Log.entryAdded') {
                events.push({
                    type: 'log',
                    level: message.params.entry.level,
                    text: message.params.entry.text,
                })
            }

            if (message.method === 'Runtime.exceptionThrown') {
                const details = message.params.exceptionDetails || {}
                events.push({
                    type: 'exception',
                    text: details.text,
                    description: details.exception?.description,
                })
            }

            if (message.method === 'Network.responseReceived') {
                const { response } = message.params
                if (
                    response.url.includes('/auth/v1/') ||
                    response.url === LOGIN_URL ||
                    response.url === `${BASE_URL}/`
                ) {
                    events.push({
                        type: 'response',
                        status: response.status,
                        url: response.url,
                    })
                }
            }
        }

        await new Promise((resolve, reject) => {
            socket.onopen = resolve
            socket.onerror = reject
        })

        await send('Page.enable')
        await send('Runtime.enable')
        await send('Network.enable')
        await send('Log.enable')
        await sleep(2500)

        await send('Runtime.evaluate', {
            expression: `(() => {
                const setNativeValue = (selector, value) => {
                    const input = document.querySelector(selector)
                    const descriptor = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype,
                        'value'
                    )

                    descriptor.set.call(input, value)
                    input.dispatchEvent(new Event('input', { bubbles: true }))
                }

                setNativeValue('#email', ${JSON.stringify(EMAIL)})
                setNativeValue('#password', ${JSON.stringify(PASSWORD)})
                document.querySelector('button[type="submit"]').click()

                return {
                    email: document.querySelector('#email').value,
                    passwordLength: document.querySelector('#password').value.length,
                }
            })()`,
            returnByValue: true,
        })

        await sleep(8000)

        const pageState = await send('Runtime.evaluate', {
            expression:
                '({ href: location.href, bodyText: document.body.innerText.slice(0, 250) })',
            returnByValue: true,
        })

        const cookies = await send('Network.getCookies', {
            urls: [`${BASE_URL}/`, LOGIN_URL],
        })

        const authCookie = (cookies.cookies || []).find((cookie) =>
            cookie.name.includes('auth-token')
        )

        console.log(
            JSON.stringify(
                {
                    summary: authCookie
                        ? 'SUCCESS: auth cookie detected'
                        : 'FAIL: auth cookie missing',
                    page: pageState.result.value,
                    authCookie: authCookie
                        ? {
                              name: authCookie.name,
                              domain: authCookie.domain,
                              sameSite: authCookie.sameSite,
                          }
                        : null,
                    events,
                    chromeStderrTail: stderr.split('\n').slice(-10),
                },
                null,
                2
            )
        )

        socket.close()
    } finally {
        chrome.kill('SIGKILL')
        await sleep(300)
        fs.rmSync(userDataDir, { recursive: true, force: true })
    }
}

main().catch((error) => {
    console.error(
        JSON.stringify(
            {
                summary: 'FAIL: smoke script crashed',
                error: error.stack || String(error),
            },
            null,
            2
        )
    )
    process.exit(1)
})
