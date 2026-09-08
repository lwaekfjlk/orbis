import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker as Thread} from 'node:worker_threads';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const workerBody=readFileSync(new URL('../src/continuous/worker-body.js',import.meta.url),'utf8');
const browser={},workers=[],requests=[];
// Use the actual worker body in a separate thread, including real structured
// cloning and transferable buffers. Only the browser Worker event adapter is fake.
class BrowserWorker {
 constructor(){
  this.thread=new Thread("const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;\n"+source+'\n'+workerBody+"\nself.postMessage=(data,buffers)=>parentPort.postMessage(data,buffers);parentPort.on('message',data=>self.onmessage({data}));",{eval:true});
  this.thread.on('message',data=>this.onmessage?.({data}));
  this.thread.on('error',error=>this.onerror?.(error));workers.push(this);
 }
 postMessage(data){requests.push({pid:data.pid,world:!!data.world});this.thread.postMessage(data);}
 terminate(){return this.thread.terminate();}
}
const E=Function('window','Worker',source+`
 const originalCollector=createCityRenderer;
 const collections=[];
 createCityRenderer=(canvas,changed,config)=>{const r=originalCollector(canvas,changed,config);collections.push(r);return r;};
 return {generateWorld,createCivilization,ContinuousCityLayer,AtlasRenderer,collections,createCityRenderer:originalCollector,
  withExcavatedLandmark(fn){const previous=TownCityBinding.resolve;TownCityBinding.resolve=()=>LandmarkCatalog.recipe('labyrinth','collector-excavation');try{return fn();}finally{TownCityBinding.resolve=previous;}},
  withStandaloneTerrain(fn){const previous=createCityRenderer;createCityRenderer=(canvas,changed,config)=>previous(canvas,changed,{...config,includeTerrain:true});try{return fn();}finally{createCityRenderer=previous;}}};
`)(browser,BrowserWorker);
let w,s;
const expected=new Map();
const collect=()=>({relief:1,meshes:{},upload(name,g,shadow=true,unlit=0,alpha=1){this.meshes[name]={vertices:Float32Array.from(g.data),count:g.data.length/9,shadow,unlit,alpha};}});
const bytes=v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
function sameMeshes(actual,reference){
 assert.deepEqual(Object.keys(actual),Object.keys(reference),'no atlas assembly may be removed');
 for(const name of Object.keys(reference)){
  assert.deepEqual(bytes(actual[name].vertices),bytes(reference[name].vertices),name+' must preserve every float bit');
  for(const field of ['count','shadow','unlit','alpha'])assert.equal(actual[name][field],reference[name][field],name+'/'+field);
 }
}
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});browser.world=w;browser.sim=s;});
test.after(async()=>{await Promise.all(workers.map(worker=>worker.terminate()));});

test('continuous collection omits only discarded terrain and preserves every atlas mesh and owner range',async()=>{
 for(const pid of [507,349]){
  const p=s.provinces[pid],r=collect(),layer=new E.ContinuousCityLayer(r);layer.world=w;layer.sim=s;
  const before=E.withStandaloneTerrain(()=>layer.build(p)),standalone=E.collections.pop();
  assert(standalone.meshes.terrain.count>0);assert(standalone.meshes.contextTerrain.count>0);
  const optimizedRenderer=collect(),optimized=new E.ContinuousCityLayer(optimizedRenderer);optimized.world=w;optimized.sim=s;
  const after=await optimized.workerBuild(p),collector=E.collections.pop();
  assert.deepEqual(Object.keys(collector.meshes).sort(),['buildings','cityWalls','details','farms','port','roofs','streets','trees']);
  sameMeshes(optimizedRenderer.meshes,r.meshes);
  assert.deepEqual(collector.buildingRanges,standalone.buildingRanges,'rigid owners and terrain support metadata are unchanged');
  assert.deepEqual(collector.excavations,standalone.excavations,'skipping standalone clipping must retain atlas excavation metadata');
  assert.deepEqual(after.heights,before.heights);assert.deepEqual(after.excavations,before.excavations);assert.equal(after.triangles,before.triangles);
  assert.equal(after.city.fingerprint,before.city.fingerprint);
  expected.set(pid,{model:after,meshes:optimizedRenderer.meshes});
 }
});

test('the real worker and no-worker fallback retain identical meshes across the cached-world request',async()=>{
 browser.Worker=BrowserWorker;browser.TELLURIC_TOWN_WORKER=source+'\n'+workerBody;
 const r=collect(),layer=new E.ContinuousCityLayer(r);layer.world=w;layer.sim=s;
 for(const pid of [507,349]){
  r.meshes={};const model=await layer.workerBuild(s.provinces[pid]),before=expected.get(pid);
  sameMeshes(r.meshes,before.meshes);
  assert.equal(model.city.fingerprint,before.model.city.fingerprint);
  assert.deepEqual(model.heights,before.model.heights);assert.deepEqual(model.excavations,before.model.excavations);assert.equal(model.triangles,before.model.triangles);
  assert.deepEqual(model.city.xy(123),before.model.city.xy(123));
  assert.deepEqual(model.city.context.xy(123),before.model.city.context.xy(123));
  for(const [id,anchor] of model.frame.anchors){const previous=before.model.frame.anchors.get(id);assert.equal(anchor.y,previous.y);assert.equal(anchor.low,previous.low);assert.equal(anchor.top,previous.top);}
 }
 assert.deepEqual(requests,[{pid:507,world:true},{pid:349,world:false}]);
});

test('skipping standalone excavation clipping retains the real underground assembly and opening metadata',()=>{
 const p=s.provinces[507],original=expected.get(p.id).model.city,b={...original.buildings.find(b=>b.landmark),type:'temple',landmark:true,sacred:false};
 const city={...original,buildings:[b]};
 E.withExcavatedLandmark(()=>{
  const full=E.createCityRenderer(null,()=>{},{collectOnly:true}),assemblies=E.createCityRenderer(null,()=>{},{collectOnly:true,includeTerrain:false});
  full.setCity(city,p,s.realms[p.owner]);assemblies.setCity(city,p,s.realms[p.owner]);
  assert.equal(full.excavations.length,1);assert(full.excavations[0].floorY<b.y,'the fixture must contain an actual below-ground court');
  assert.deepEqual(assemblies.excavations,full.excavations);assert.deepEqual(assemblies.buildingRanges,full.buildingRanges);
  const wanted=Object.fromEntries(Object.keys(assemblies.meshes).map(name=>[name,full.meshes[name]]));
  sameMeshes(assemblies.meshes,wanted);assert(full.meshes.terrain.count>0);assert.equal(assemblies.meshes.terrain,undefined);
 });
});

test('WebGL uploads retain the received Float32 view and share a single conversion for ordinary geometry',()=>{
 const uploaded=[],deleted=[],gl={deleteBuffer(b){deleted.push(b);},deleteVertexArray(){},createBuffer(){return{};},createVertexArray(){return{};},bindVertexArray(){},bindBuffer(){},bufferData(target,vertices){uploaded.push(vertices);},enableVertexAttribArray(){},vertexAttribPointer(){}};
 const r={gl,meshes:{}},storage=new Float32Array(36),vertices=storage.subarray(9);vertices.set([.1,.2,.3]);
 E.AtlasRenderer.prototype.upload.call(r,'mesh',{data:vertices},false,.4,.7);
 assert.equal(uploaded[0],vertices);assert.equal(r.meshes.mesh.vertices,vertices,'preserve the exact transferred view, including its offset');
 assert.equal(r.meshes.mesh.count,3);assert.equal(r.meshes.mesh.shadow,false);assert.equal(r.meshes.mesh.unlit,.4);assert.equal(r.meshes.mesh.alpha,.7);
 const previous=r.meshes.mesh.buffer,array=Array.from(vertices);
 E.AtlasRenderer.prototype.upload.call(r,'mesh',{data:array});
 assert(uploaded[1] instanceof Float32Array);assert.equal(uploaded[1],r.meshes.mesh.vertices);
 assert.deepEqual(bytes(uploaded[1]),bytes(vertices));assert.deepEqual(deleted,[previous]);
 array[0]=100;assert.notEqual(r.meshes.mesh.vertices[0],100,'ordinary mutable geometry retains its upload snapshot');
});
