import Hls from 'hls.js'

// LL-HLS when supported by the server; ordinary fMP4/MPEG-TS stays supported.
export const GIS_HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 6,
  maxLiveSyncPlaybackRate: 1.2,
  maxBufferLength: 6,
  maxMaxBufferLength: 12,
  backBufferLength: 0,
  manifestLoadingTimeOut: 12000,
  manifestLoadingMaxRetry: 1,
}

export function connectHls(video: HTMLVideoElement, url: string, callbacks: {
  onPlaying: (startupMs: number) => void
  onError: () => void
}, startupTimeoutMs = 20000): () => void {
  const started = performance.now()
  let stopped = false
  let firstFrame = false
  let hls: Hls | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
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
  const play = () => { if (!stopped) void video.play().catch(() => { /* Native controls allow user playback. */ }) }
  const dispose = () => {
    stopped = true
    clearTimeout(timer)
    if (frameCallback !== undefined) video.cancelVideoFrameCallback?.(frameCallback)
    video.removeEventListener('playing', playing)
    video.removeEventListener('loadedmetadata', play)
    video.removeEventListener('error', fail)
    hls?.destroy()
    hls = null
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  const fail = () => { if (!stopped) { dispose(); callbacks.onError() } }
  video.addEventListener('playing', playing)
  video.addEventListener('error', fail)
  timer = setTimeout(fail, startupTimeoutMs)
  if (Hls.isSupported()) {
    hls = new Hls(GIS_HLS_CONFIG)
    hls.on(Hls.Events.MANIFEST_PARSED, play)
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) fail() })
    hls.attachMedia(video)
    hls.loadSource(url)
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.addEventListener('loadedmetadata', play)
    video.src = url
  } else fail()
  return dispose
}
