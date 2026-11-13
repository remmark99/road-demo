"use client"

/**
 * Запись с микрофона в PCM 16 бит, 16 кГц, моно — формат, который SaluteSpeech
 * принимает без перекодирования. Браузер пишет на своей частоте, здесь она
 * понижается до 16 кГц. Запись сама останавливается после паузы в речи.
 */

const TARGET_RATE = 16_000
const MAX_SECONDS = 55
const SILENCE_STOP_MS = 1_600
const SPEECH_LEVEL = 0.02

const WORKLET = `class Capture extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true }
}
registerProcessor('vector-capture', Capture)`

export function downsampleToPcm16(chunks: Float32Array[], sourceRate: number): ArrayBuffer {
    const length = chunks.reduce((sum, c) => sum + c.length, 0)
    const input = new Float32Array(length)
    let offset = 0
    for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length }
    const ratio = sourceRate / TARGET_RATE
    const outLength = Math.floor(length / ratio)
    const out = new DataView(new ArrayBuffer(outLength * 2))
    for (let i = 0; i < outLength; i++) {
        // Среднее по окну исходных отсчётов — простой фильтр от наложения частот.
        const start = Math.floor(i * ratio), end = Math.min(length, Math.floor((i + 1) * ratio))
        let sum = 0
        for (let j = start; j < end; j++) sum += input[j]
        const sample = Math.max(-1, Math.min(1, end > start ? sum / (end - start) : input[start] ?? 0))
        out.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    }
    return out.buffer
}

export interface RecordingHandle {
    /** Остановить и получить PCM; пустой буфер — речи не было. */
    stop(): Promise<ArrayBuffer>
    cancel(): void
}

export async function startRecording(callbacks: { onLevel?: (level: number) => void; onAutoStop?: () => void } = {}): Promise<RecordingHandle> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    const context = new AudioContext()
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    try { await context.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, 'vector-capture')
    const chunks: Float32Array[] = []
    const startedAt = performance.now()
    let heardSpeech = false
    let lastSpeechAt = startedAt
    let finished = false

    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (finished) return
        const chunk = event.data
        chunks.push(chunk)
        let sum = 0
        for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
        const level = Math.sqrt(sum / chunk.length)
        callbacks.onLevel?.(level)
        const now = performance.now()
        if (level > SPEECH_LEVEL) { heardSpeech = true; lastSpeechAt = now }
        if ((heardSpeech && now - lastSpeechAt > SILENCE_STOP_MS) || now - startedAt > MAX_SECONDS * 1000) callbacks.onAutoStop?.()
    }
    source.connect(node)

    const release = () => {
        finished = true
        node.port.onmessage = null
        source.disconnect()
        node.disconnect()
        stream.getTracks().forEach(track => track.stop())
        void context.close()
    }
    return {
        async stop() {
            const rate = context.sampleRate
            release()
            return heardSpeech ? downsampleToPcm16(chunks, rate) : new ArrayBuffer(0)
        },
        cancel: release,
    }
}
