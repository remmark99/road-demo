const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
function load(file,mocks={}){
 const module={exports:{}}
 const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new Function('require','module','exports',code)(id=>id in mocks?mocks[id]:require(id),module,module.exports)
 return module.exports
}
const {preserveMapOverlays}=load('lib/map-style-overlays.ts')
test('theme swap preserves live overlay data, filters, visibility, coverage and FOV across both themes',()=>{
 const source={type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',properties:{id:134},geometry:{type:'Point',coordinates:[73,61]}}]}}
 const layers=[{id:'stops',source:'bus-stops',type:'circle',filter:['==','status','online'],layout:{visibility:'none'},paint:{'circle-color':'red'}},{id:'coverage',source:'tko-coverage',type:'fill'},{id:'fov',source:'camera-fov-134',type:'fill'}]
 const previous={version:8,sources:{base:{type:'vector',url:'old'},'bus-stops':source,'tko-coverage':source,'camera-fov-134':source},layers:[{id:'old-base',source:'base',type:'fill'},...layers]}
 const light={version:8,sources:{base:{type:'vector',url:'light'}},layers:[{id:'light-base',source:'base',type:'fill'}]}
 const dark={version:8,sources:{base:{type:'vector',url:'dark'}},layers:[{id:'dark-base',source:'base',type:'fill'}]}
 const switched=preserveMapOverlays(previous,light)
 assert.equal(switched.sources.base.url,'light')
 assert.deepEqual(switched.layers.slice(1),layers)
 assert.deepEqual(preserveMapOverlays(switched,dark).layers.slice(1),layers)
 assert.equal(switched.sources['bus-stops'],source)
 assert.equal(light.layers.length,1)
})
test('style ownership wins on collisions and vector base layers are not carried over',()=>{
 const previous={version:8,sources:{s:{type:'geojson',data:{}},base:{type:'vector',url:'old'}},layers:[{id:'same',source:'s',type:'fill'},{id:'other',source:'base',type:'fill'}]}
 const next={version:8,sources:{s:{type:'geojson',data:{new:true}}},layers:[{id:'same',source:'s',type:'fill'}]}
 assert.deepEqual(preserveMapOverlays(previous,next),next)
})
class Video{
 listeners=new Map();paused=false;src='';frame=null
 addEventListener(name,fn){this.listeners.set(name,fn)}
 removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name)}
 emit(name){this.listeners.get(name)?.()}
 play(){return Promise.resolve()}
 pause(){this.paused=true}
 removeAttribute(){this.src=''}
 load(){}
 canPlayType(){return 'probably'}
 requestVideoFrameCallback(fn){this.frame=fn;return 1}
 cancelVideoFrameCallback(){this.frame=null}
}
class FakeHls{
 static Events={MANIFEST_PARSED:'manifest',ERROR:'error'}
 static instance=null
 static supported=true
 static isSupported(){return this.supported}
 listeners=new Map();destroyed=false
 constructor(config){this.config=config;FakeHls.instance=this}
 on(name,fn){this.listeners.set(name,fn)}
 attachMedia(){}
 loadSource(){}
 destroy(){this.destroyed=true}
 emit(name,data){this.listeners.get(name)?.(name,data)}
}
const {connectHls}=load('lib/video/hls-playback.ts',{'hls.js':FakeHls})
test('manifest is not online: wait for first decoded frame, clean up on close',()=>{
 const video=new Video();let online=0
 const dispose=connectHls(video,'http://test/index.m3u8',{onPlaying:()=>online++,onError:()=>assert.fail()})
 const hls=FakeHls.instance
 hls.emit('manifest');assert.equal(online,0)
 video.emit('playing');assert.equal(online,0)
 video.frame();assert.equal(online,1)
 dispose();assert.equal(hls.destroyed,true);assert.equal(video.listeners.size,0)
 hls.emit('error',{fatal:true});assert.equal(online,1)
})
test('missing camera reaches bounded error and releases playback',async()=>{
 const video=new Video();let errors=0
 connectHls(video,'http://test/missing',{onPlaying:()=>assert.fail(),onError:()=>errors++},10)
 await new Promise(resolve=>setTimeout(resolve,25))
 assert.equal(errors,1);assert.equal(FakeHls.instance.destroyed,true);assert.equal(video.listeners.size,0)
})
test('Safari/native playback uses the same first-frame and cleanup rules',()=>{
 FakeHls.supported=false
 try{
 const video=new Video();let online=0
 const dispose=connectHls(video,'http://test/native',{onPlaying:()=>online++,onError:()=>assert.fail()})
 video.emit('loadedmetadata');assert.equal(online,0)
 video.emit('playing');video.frame();assert.equal(online,1)
 dispose();assert.equal(video.listeners.size,0)
 }finally{FakeHls.supported=true}
})
const {connectWhep}=load('lib/video/whep-playback.ts')
class FakePeer {
 static instance;connectionState='new';closed=false
 constructor(){FakePeer.instance=this}
 addTransceiver(){}
 async createOffer(){return {type:'offer',sdp:'preview'}}
 async setLocalDescription(){}
 async setRemoteDescription(){this.answer=true}
 close(){this.closed=true}
}
test('WHEP waits for a decoded frame and aborts negotiation on close',async()=>{
 const originalPeer=global.RTCPeerConnection, originalFetch=global.fetch
 let signal
 global.RTCPeerConnection=FakePeer
 global.fetch=async(_,options)=>{signal=options.signal;return{ok:true,text:async()=> 'answer'}}
 let dispose
 try{
  const video=new Video();let online=0
  dispose=connectWhep(video,'http://test/whep',{onPlaying:()=>online++,onError:()=>assert.fail()})
  await new Promise(resolve=>setImmediate(resolve))
  const peer=FakePeer.instance;assert.equal(peer.answer,true)
  peer.connectionState='connected';peer.onconnectionstatechange();assert.equal(online,0)
  peer.ontrack({streams:[{}]});video.emit('playing');video.frame();assert.equal(online,1)
  dispose();assert.equal(peer.closed,true);assert.equal(signal.aborted,true);assert.equal(video.srcObject,null)
  assert.equal(video.listeners.size,0)
 }finally{dispose?.();global.RTCPeerConnection=originalPeer;global.fetch=originalFetch}
})
test('WHEP first-frame timeout closes a connected but silent peer',async()=>{
 const originalPeer=global.RTCPeerConnection,originalFetch=global.fetch
 global.RTCPeerConnection=FakePeer;global.fetch=()=>new Promise(()=>{})
 let dispose
 try{
  let errors=0;dispose=connectWhep(new Video(),'http://test/whep',{onPlaying:()=>assert.fail(),onError:()=>errors++},10)
  await new Promise(resolve=>setTimeout(resolve,25))
  assert.equal(errors,1);assert.equal(FakePeer.instance.closed,true)
 }finally{dispose?.();global.RTCPeerConnection=originalPeer;global.fetch=originalFetch}
})
