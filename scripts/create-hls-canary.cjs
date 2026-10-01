// Local config preparation only. Input: MediaMTX API JSON { global, path }.
// Output may contain source credentials; keep it outside Git with mode 0600.
const fs = require('node:fs')
function createCanary(input) {
  if (!input.global || !input.path || typeof input.path.source !== 'string' || !/^rtsps?:\/\//.test(input.path.source)) throw Error('Expected a verified RTSP source configuration')
  return {
    ...input.global,
    api: false, metrics: false, pprof: false,
    rtsp: false, rtmp: false, webrtc: false, srt: false, playback: false,
    hls: true, hlsAddress: ':8888', hlsAlwaysRemux: false,
    hlsVariant: 'lowLatency', hlsSegmentDuration: '1s', hlsPartDuration: '200ms',
    hlsSegmentCount: 7, hlsMuxerCloseAfter: '60s',
    paths: { cam134: { ...input.path, sourceOnDemand: true, sourceOnDemandCloseAfter: '60s' } },
  }
}
module.exports = { createCanary }
if (require.main === module) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw Error('Usage: node scripts/create-hls-canary.cjs INPUT.json OUTPUT.json')
  // JSON is valid YAML; MediaMTX accepts it without additional dependencies.
  const config = createCanary(JSON.parse(fs.readFileSync(input, 'utf8')))
  fs.writeFileSync(output, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' })
  console.log('Prepared one-camera canary configuration; no service was started')
}
