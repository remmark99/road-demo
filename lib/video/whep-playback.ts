export function connectWhep(video: HTMLVideoElement, url: string, callbacks: {
  onPlaying: (startupMs: number) => void
  onError: () => void
}, startupTimeoutMs = 20000): () => void {
  const started = performance.now()
  const pc = new RTCPeerConnection()
  const abort = new AbortController()
  let stopped = false
  let firstFrame = false
  let frameCallback: number | undefined
  const ready = () => {
    if (stopped || firstFrame) return
    firstFrame = true
    clearTimeout(timer)
    callbacks.onPlaying(performance.now() - started)
  }
  const playing = () => {
    if (video.requestVideoFrameCallback) frameCallback = video.requestVideoFrameCallback(ready)
    else ready()
  }
  const dispose = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    abort.abort()
    if (frameCallback !== undefined) video.cancelVideoFrameCallback?.(frameCallback)
    video.removeEventListener('playing', playing)
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.close()
    video.pause()
    video.srcObject = null
  }
  const fail = () => { if (!stopped) { dispose(); callbacks.onError() } }
  const timer = setTimeout(fail, startupTimeoutMs)
  video.addEventListener('playing', playing)
  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })
  pc.ontrack = event => {
    if (stopped) return
    video.srcObject = event.streams[0] || new MediaStream([event.track])
    void video.play().catch(() => { /* Native controls allow user playback. */ })
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') fail()
  }
  void (async () => {
    try {
      const offer = await pc.createOffer()
      if (stopped) return
      await pc.setLocalDescription(offer)
      if (stopped) return
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp, signal: abort.signal })
      if (!response.ok) throw new Error('WHEP negotiation failed')
      const sdp = await response.text()
      if (!stopped) await pc.setRemoteDescription({ type: 'answer', sdp })
    } catch { fail() }
  })()
  return dispose
}
