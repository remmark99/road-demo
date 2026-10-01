const {test}=require('node:test');const assert=require('node:assert/strict')
const {createCanary}=require('../scripts/create-hls-canary.cjs')
test('one-camera canary retains source/auth but disables other listeners and permanent pulls',()=>{
 const input={global:{authMethod:'internal',authInternalUsers:[{user:'test',pass:'private'}],hlsAlwaysRemux:true,rtsp:true},path:{source:'rtsp://test/source',sourceOnDemand:false}}
 const copy=JSON.stringify(input),output=createCanary(input)
 assert.equal(JSON.stringify(input),copy)
 assert.deepEqual(Object.keys(output.paths),['cam134'])
 assert.equal(output.paths.cam134.source,input.path.source)
 assert.equal(output.hlsAlwaysRemux,false)
 assert.equal(output.paths.cam134.sourceOnDemand,true)
 assert.equal(output.paths.cam134.sourceOnDemandCloseAfter,'60s')
 assert.deepEqual(output.authInternalUsers,input.global.authInternalUsers)
 for(const listener of ['rtsp','rtmp','webrtc','srt','playback','api','metrics','pprof'])assert.equal(output[listener],false)
})
test('reject incomplete config and non-RTSP source before preparing canary',()=>{
 for(const input of [{},{global:{}},{global:{},path:{source:'publisher'}},{global:{},path:{source:'http://unknown'}}])assert.throws(()=>createCanary(input))
})
