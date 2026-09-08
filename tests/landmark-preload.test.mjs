import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker as Thread} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')).join('\n');
const workerBody=readFileSync(new URL('../src/continuous/worker-body.js',import.meta.url),'utf8');
function engine(browser={},timer=setTimeout){
 return Function('window','setTimeout','clearTimeout',source+`
 let queries=0;const query=generateCityLandmark;generateCityLandmark=(...args)=>{queries++;return query(...args)};
 return {generateWorld,createCivilization,generateCityLandmark,SacredCityKit,LandmarkBinding,physicalFingerprint,settlementFingerprint,
 get queries(){return queries}};`)(browser,timer,clearTimeout);
}
const E=engine();let w,s;
const workers=[],requests=[];
class BrowserWorker {
 constructor(){
  this.index=workers.length;this.stopped=false;
  this.thread=new Thread("const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;\n"+source+'\n'+workerBody+"\nself.postMessage=(data,buffers)=>parentPort.postMessage(data,buffers);parentPort.on('message',data=>self.onmessage({data}));",{eval:true});
  this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.(error));workers.push(this);
 }
 postMessage(data,...transfer){
  assert.equal(transfer.length,0,'parent buffers must be cloned, never transferred');
  requests.push({worker:this.index,pid:data.pid,world:!!data.world,sim:!!data.sim});this.thread.postMessage(data);
 }
 terminate(){this.stopped=true;return this.thread.terminate();}
}
function limitedSim(ids=[127]){
 // Keep every settlement and realm for exact layout context. Limit only which
 // entries the test asks the atlas directory to index.
 const state=structuredClone(s);for(const p of state.provinces)p.city=ids.includes(p.id);return state;
}
const response=(request,changes={})=>({kind:'landmark-index',token:request.token,id:request.id,pid:request.pid,key:request.key,payload:null,...changes});
function controlled(){
 const instances=[];let peak=0;
 class Worker {
  constructor(){instances.push(this);this.stopped=false;peak=Math.max(peak,instances.filter(worker=>!worker.stopped).length);}
  postMessage(request){this.request=request;this.reply=this.onmessage;}
  terminate(){this.stopped=true;}
 }
 return {Worker,instances,get peak(){return peak}};
}

test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});});
test.after(async()=>{await Promise.all(workers.map(worker=>worker.terminate()));});

test('two real workers prewarm every exact entry while parent buffers remain usable',async()=>{
 const browser={Worker:BrowserWorker,TELLURIC_TOWN_WORKER:source+'\n'+workerBody},e=engine(browser);
 const before=[e.physicalFingerprint(w),e.settlementFingerprint(s)],bytes=w.height.byteLength;
 const result=await e.SacredCityKit.preload(w,s).promise;
 assert.deepEqual(result,{status:'complete',completed:78,total:78});
 assert.equal(workers.length,2);assert(workers.every(worker=>worker.stopped));
 assert.equal(requests.length,78);assert.equal(new Set(requests.map(request=>request.pid)).size,78);
 for(let id=0;id<2;id++){
  const sent=requests.filter(request=>request.worker===id);assert(sent.length>1);
  assert(sent[0].world&&sent[0].sim);assert(sent.slice(1).every(request=>!request.world&&!request.sim));
 }
 assert.equal(w.height.byteLength,bytes);assert(bytes>0);
 assert.deepEqual([e.physicalFingerprint(w),e.settlementFingerprint(s)],before);
 const inventory=e.LandmarkBinding.inventory(w,s);
 assert.equal(e.queries,0,'synchronous inventory must consume verified worker cache');
 const metadata=inventory.map(({id,name,recipe,provinceId,i,x,y,priority,kind})=>({id,name,recipe,provinceId,i,x,y,priority,kind}));
 assert.equal(createHash('sha256').update(JSON.stringify(metadata)).digest('hex'),'477aa02d80cb23a15195810a2158971cb0a63b50475def7954a6698d7e06146d');
 assert.deepEqual(await e.SacredCityKit.preload(w,s).promise,{status:'complete',completed:0,total:0});
 assert.equal(workers.length,2,'a populated cache must not create more workers');
});

test('cancellation and a replacement world cannot hydrate late responses',async()=>{
 const control=controlled(),browser={Worker:control.Worker,TELLURIC_TOWN_WORKER:'trusted-test-source'},e=engine(browser),state=limitedSim([127,349,414]);
 const old=e.SacredCityKit.preload(w,state),first=control.instances[0];
 const otherWorld=structuredClone(w),replacement=e.SacredCityKit.preload(otherWorld,state),second=control.instances[2];
 assert.equal((await old.promise).status,'cancelled');assert(first.stopped);assert.equal(control.peak,2,'replacement must terminate the old pool synchronously');
 first.reply({data:response(first.request)});
 replacement.cancel();replacement.cancel();
 assert.equal((await replacement.promise).status,'cancelled');assert(second.stopped);
 second.reply({data:response(second.request)});
 assert(e.SacredCityKit.site(otherWorld,state,state.provinces[127]),'cancelled negative result must not hide a real sanctuary');
 assert.equal(e.queries,1);
});

test('stale request keys and changed designs fall back to an exact synchronous query',async()=>{
 for(const changedDesign of [false,true]){
  const control=controlled(),e=engine({Worker:control.Worker,TELLURIC_TOWN_WORKER:'trusted-test-source'}),state=limitedSim();
  const job=e.SacredCityKit.preload(w,state),worker=control.instances[0];
  if(changedDesign)state.townRecipes={127:{seed:'edited while indexing'}};
  worker.reply({data:response(worker.request,changedDesign?{}:{token:worker.request.token+1})});
  assert.equal((await job.promise).status,'failed');assert(worker.stopped);
  assert(e.SacredCityKit.site(w,state,state.provinces[127]));assert.equal(e.queries,1);
 }
});

test('invalid geometry metadata falls back rather than poisoning an exact site entry',async()=>{
 const valid=E.generateCityLandmark(w,s,127);
 for(const mutate of [b=>{b.w=NaN},b=>{b.wonder='wrong-wonder'}]){
  const control=controlled(),e=engine({Worker:control.Worker,TELLURIC_TOWN_WORKER:'trusted'}),state=limitedSim();
  const job=e.SacredCityKit.preload(w,state),worker=control.instances[0],payload=structuredClone(valid);mutate(payload.buildings[0]);
  worker.reply({data:response(worker.request,{payload})});
  assert.equal((await job.promise).status,'failed');assert(worker.stopped);
  assert(e.SacredCityKit.site(w,state,state.provinces[127]));assert.equal(e.queries,1);
 }
});

test('a duplicated completed response cannot overcount an idle lane',async()=>{
 const control=controlled(),e=engine({Worker:control.Worker,TELLURIC_TOWN_WORKER:'trusted'}),state=limitedSim([127,414]);
 const job=e.SacredCityKit.preload(w,state),[first,second]=control.instances;
 const good=response(first.request,{payload:E.generateCityLandmark(w,state,first.request.pid)});
 first.reply({data:good});first.reply({data:good});second.reply({data:response(second.request)});
 assert.deepEqual(await job.promise,{status:'complete',completed:2,total:2});assert(control.instances.every(worker=>worker.stopped));
});

test('unavailable, failed and timed-out workers settle cleanly without losing sites',async()=>{
 const cases=[
  {browser:{},status:'unavailable'},
  {browser:{Worker:class{constructor(){throw Error('Worker blocked')}},TELLURIC_TOWN_WORKER:'trusted'},status:'failed'},
  {browser:{Worker:class{postMessage(){queueMicrotask(()=>this.onerror?.({message:'Worker crashed'}))}terminate(){}},TELLURIC_TOWN_WORKER:'trusted'},status:'failed'},
  {browser:{Worker:class{postMessage(){}terminate(){}},TELLURIC_TOWN_WORKER:'trusted'},status:'failed',timer:(fn,ms)=>setTimeout(fn,ms===30000?1:ms)}
 ];
 for(const fixture of cases){
  const e=engine(fixture.browser,fixture.timer),state=limitedSim(),job=e.SacredCityKit.preload(w,state);
  assert.equal((await job.promise).status,fixture.status);job.cancel();
  assert(e.SacredCityKit.site(w,state,state.provinces[127]));assert.equal(e.queries,1);
 }
});
