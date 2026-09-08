import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker as Thread} from 'node:worker_threads';
import {scripts} from '../scripts/manifest.mjs';
import {defaults,fantasyDefaults} from './engine-loader.mjs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(read).join('\n');
const body=read('src/continuous/worker-body.js'),client=read('src/continuous/world-builder.js');
const E=Function(source+';return{generateWorld,createCivilization,physicalFingerprint,settlementFingerprint,politicalFingerprint,stepCivilization};')();
const fakePayload=()=>({world:{height:new Float32Array([1,2,3])},sim:{provinces:[]}});
function harness({Worker,generateWorld=async()=>fakePayload().world,createCivilization=()=>fakePayload().sim,timer=setTimeout,urlFailure=false}={}){
 const counters={world:0,sim:0,created:[],revoked:[]};
 const url={createObjectURL(){if(urlFailure)throw Error('Blob URL blocked');const value='blob:world-'+counters.created.length;counters.created.push(value);return value;},revokeObjectURL(value){counters.revoked.push(value);}};
 const api=Function('window','Blob','URL','generateWorld','createCivilization','setTimeout','clearTimeout',client+';return WorldBuilder;')(
  {Worker,TELLURIC_TOWN_WORKER:source+'\n'+body},Blob,url,async(...args)=>{counters.world++;return generateWorld(...args);},(...args)=>{counters.sim++;return createCivilization(...args);},timer,clearTimeout);
 return{api,counters};
}
function controlled(){
 const instances=[];
 class Worker{
  constructor(){instances.push(this);this.stopped=false;}
  postMessage(request){this.request=request;this.reply=this.onmessage;}
  terminate(){this.stopped=true;}
 }
 return{Worker,instances};
}
const reply=(worker,data)=>worker.reply({data:{id:worker.request.id,kind:'world-build',...data}});

test('a generated payload waits for ordered progress, ignores stale replies and releases its disposable worker',async()=>{
 const control=controlled(),{api,counters}=harness(control),seen=[];let release;
 const hold=new Promise(resolve=>release=resolve),promise=api.generate({seed:'first'},{realms:18},async text=>{seen.push(text);if(text==='01 / Start')await hold;});
 const worker=control.instances[0],payload=fakePayload();let done=false;promise.then(()=>done=true);
 reply(worker,{progress:'stale',id:worker.request.id+1});reply(worker,{progress:'01 / Start'});reply(worker,{progress:'08 / Towns'});reply(worker,{payload});
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(seen,['01 / Start']);assert.equal(done,false);assert(worker.stopped);
 release();assert.equal(await promise,payload);assert.deepEqual(seen,['01 / Start','08 / Towns']);
 reply(worker,{payload:fakePayload()});assert.equal(counters.world,0);assert.deepEqual(counters.revoked,counters.created);
});

test('missing, blocked, crashed and undecodable workers use the unchanged main-thread generation path once',async()=>{
 for(const mode of ['missing','url','constructor','send','error','messageerror','transport','malformed','timeout']){
  const instances=[];
  class Worker{
   constructor(){if(mode==='constructor')throw Error('Worker forbidden');instances.push(this);}
   postMessage(request){
    if(mode==='send')throw Error('Cannot clone input');
    queueMicrotask(()=>{
     if(mode==='error')this.onerror({preventDefault(){}});
     else if(mode==='messageerror')this.onmessageerror();
     else if(mode==='transport')this.onmessage({data:{id:request.id,kind:'world-build',failure:'transport',error:'Cannot transfer'}});
     else if(mode==='malformed')this.onmessage({data:{id:request.id,kind:'world-build',payload:{}}});
    });
   }
   terminate(){this.stopped=true;}
  }
  const phases=[],params={seed:'fallback',landformVersion:0},options={historySeed:'saved history'};
  const {api,counters}=harness({Worker:mode==='missing'?undefined:Worker,urlFailure:mode==='url',timer:(fn,ms)=>setTimeout(fn,ms===180000?5:ms),
   generateWorld:async(p,progress)=>{assert.equal(p,params);await progress('01 / Ground');return fakePayload().world;},
   createCivilization:(w,o)=>{assert.equal(o,options);assert(w.height.length);return fakePayload().sim;}});
  const result=await api.generate(params,options,text=>phases.push(text));assert(result.world.height.length,mode);
  assert.equal(counters.world,1,mode);assert.equal(counters.sim,1,mode);assert.deepEqual(phases,['01 / Ground','08 / Founding towns and trade routes']);
  assert(instances.every(w=>w.stopped));assert.deepEqual(counters.revoked,counters.created);
 }
});

test('engine failures and progress-callback failures reject without silently regenerating',async()=>{
 const control=controlled(),{api,counters}=harness(control);
 const failed=api.generate({seed:'bad'});reply(control.instances[0],{error:'Unsupported geography',failure:'generation',stack:'engine-stack'});
 await assert.rejects(failed,/Unsupported geography/);assert.equal(counters.world,0);assert(control.instances[0].stopped);
 const second=api.generate({seed:'good'},{},()=>{throw Error('Progress callback failed');});reply(control.instances[1],{progress:'01 / Start'});
 await assert.rejects(second,/Progress callback failed/);assert.equal(counters.world,0);assert(control.instances[1].stopped);
});

test('a failure discards queued obsolete progress before fallback begins',async()=>{
 const control=controlled(),seen=[];let release;
 const hold=new Promise(resolve=>release=resolve),{api,counters}=harness({...control,generateWorld:async(p,progress)=>{await progress('01 / Fallback');return fakePayload().world;}});
 const promise=api.generate({}, {},async text=>{seen.push(text);if(text==='01 / Worker')await hold;}),worker=control.instances[0];
 reply(worker,{progress:'01 / Worker'});await Promise.resolve();reply(worker,{progress:'07 / Obsolete'});worker.onerror({preventDefault(){}});
 assert.equal(counters.world,0);release();await promise;assert.deepEqual(seen,['01 / Worker','01 / Fallback','08 / Founding towns and trade routes']);
});

test('real worker generation transfers the complete current and legacy worlds and preserves later history',async()=>{
 const instances=[];
 class BrowserWorker{
  constructor(){
   this.thread=new Thread("const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;\n"+source+'\n'+body+
    "\nself.postMessage=(data,buffers)=>{if(data.payload){if(!buffers?.length||new Set(buffers).size!==buffers.length)throw Error('Missing unique transfer list');}parentPort.postMessage(data,buffers);if(data.payload&&buffers.some(b=>b.byteLength!==0))throw Error('Worker buffers were copied instead of transferred');};parentPort.on('message',data=>self.onmessage({data}));",{eval:true});
   this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',e=>this.onerror?.(e));instances.push(this);
  }
  postMessage(data){assert.deepEqual(Object.keys(data).sort(),['id','kind','options','params']);this.thread.postMessage(data);}
  terminate(){this.stopped=true;return this.thread.terminate();}
 }
 const fingerprint=(w,s)=>[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)];
 try{
  for(const params of [fantasyDefaults,{...defaults,landformVersion:0}]){
   const options={realms:18,conflict:1},world=await E.generateWorld(params),sim=E.createCivilization(world,options),stages=[];
   const {api,counters}=harness({Worker:BrowserWorker,generateWorld:()=>{throw Error('The real worker must not fall back');}});
   const result=await api.generate(params,options,text=>stages.push(text));
   assert.equal(counters.world,0);assert.deepEqual(stages.map(s=>+s.slice(0,2)),[1,2,3,4,5,6,7,8]);
   assert.deepEqual(fingerprint(result.world,result.sim),fingerprint(world,sim));
   assert.deepEqual(result.world,world);assert.deepEqual(result.sim,sim);assert(result.world.height.byteLength>0);assert(result.world.human.capacity.byteLength>0);assert(result.world.provinceId.byteLength>0);
   E.stepCivilization(result.sim,result.world);E.stepCivilization(sim,world);assert.deepEqual(result.sim,sim,'transferred simulation needs no hidden methods or cache hydration to advance history');
   assert.deepEqual(fingerprint(result.world,result.sim),fingerprint(world,sim));assert.deepEqual(counters.revoked,counters.created);
  }
 }finally{await Promise.all(instances.map(w=>w.terminate()));}
 assert(instances.every(w=>w.stopped));
});
