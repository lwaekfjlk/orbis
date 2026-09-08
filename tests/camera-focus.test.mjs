import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/ui/continuous-map.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

// Load the actual UI closure and call its public operations. Only rendering,
// asynchronous town loading and the animation clock are replaced by small fakes.
function fixture({obscured=false}={}){
 const elements=new Map(),frames=[],selections=[];
 const calls={labels:0,titles:0,pins:0,inspectors:0,cityCameras:0,ruinCameras:0,folk:0};
 let now=0,load=()=>Promise.resolve(model);
 const element=()=>({style:{},dataset:{},classList:{add(){},remove(){}},appendChild(){},addEventListener(){},setAttribute(){},replaceChildren(){},querySelectorAll(){return[];},getBoundingClientRect(){return{left:0,top:0};}});
 const get=id=>{if(!elements.has(id)){
  const node=element();
  const observe=(object,key,counter)=>{let value='';Object.defineProperty(object,key,{get(){return value;},set(next){value=next;calls[counter]++;}});};
  if(id==='cmStatus')observe(node,'textContent','titles');
  if(id==='cmLabels')observe(node.style,'display','pins');
  if(id==='inspector')observe(node,'innerHTML','inspectors');
  elements.set(id,node);
 }return elements.get(id);};
 const p={id:0,i:10,x:2,y:3,name:'Test town',settled:true,city:true,pop:1200,urbanPop:700};
 const b={id:'b0',name:'Council hall',x:0,z:0,w:4,d:4,h:5,type:'civic',landmark:false};
 const anchor={x:2,y:.1,z:3,scale:.01,b};
 const model={p,key:'first',city:{buildings:[b],stats:{modules:1},siteEnvironment:{label:'Valley',temperature:15,minElevation:0,maxElevation:100}},frame:{anchors:new Map([[b.id,anchor]]),sx:.01,sz:.01},heights:{b0:5}};
 const renderer={target:[4,1,5],zoom:1,elevation:1.19,azimuth:.018,relief:1,width:1200,height:800,
  options:{},canvas:{id:'map'},dir:[0,-1,0],mvp:[],visible(){return true;},onChange(){calls.labels++;},updateCamera(){},request(){},buildFolk(){calls.folk++;}};
 class Layer{
  constructor(){this.models=new Map();this.focusId=null;this.loading=false;}
  async ensure(id){const m=await load(id);if(m)this.models.set(id,m);return m;}
  select(hit){selections.push(hit);}
  cameraChanged(){calls.cityCameras++;}
  bind(world,sim){this.world=world;this.sim=sim;}
  report(){return{models:this.models.size};}
  ground(){return 0;}
 }
 // No ruins participate in these town-camera races. Keep the new sibling
 // renderer inert so it cannot add a load or animation to the controlled clock.
 class RuinLayer{
  constructor(){this.models=new Map();}
  visible(){return null;}
  cameraChanged(){calls.ruinCameras++;}
  bind(){}
  report(){return{models:this.models.size,failures:[]};}
 }
 const context={window:{},document:{body:element(),getElementById:get,createElement:element,addEventListener(){}},renderer,
  world:{params:{seed:'test'}},sim:{provinces:[p],realms:[{alive:true}]},busy:false,simAdvancing:false,
  ContinuousCityLayer:Layer,ContinuousRuinLayer:RuinLayer,OneMap:{closeDrawer(){this.panel=null;this.detailContext=null;},closeMenus(){},clearSelection(){},scene:'world',openDrawer(panel,detailContext){this.panel=panel;this.detailContext=detailContext;}},
  LandmarkUI:{registry:[]},LandmarkBinding:{highCitadelLabel(){return'';}},
  PlaceVitals:{city(sim,p){return p;}},placeVitalsHTML:p=>`<div data-pop="${p.pop}">${p.urbanPop}</div>`,placeNameOriginHTML(){return'';},fmtPop:String,CITY_PROJECTS:{},
  CityEnvironment:{profile(){return{mountainous:false};}},
  AtlasSpace:{TOWN_ZOOM:16,DETAIL_ZOOM:60,MAX_ZOOM:620,point(w,x,y){return[x,0,y];},grid(x,z){return[x,z];},pickGround(){return obscured?{point:[2,1,3]}:null;}},
  installDepthRasterizer(){},rgb(){return[0,0,0];},mul4(){return[];},ortho(){return[];},lookAt(){return[];},
  project4(){return[0,0,0,1];},sub(a,b){return a.map((v,i)=>v-b[i]);},dot(a,b){return a.reduce((n,v,i)=>n+v*b[i],0);},
  clamp(x,lo=0,hi=1){return Math.max(lo,Math.min(hi,x));},lerp(a,b,t){return a+(b-a)*t;},
  performance:{now:()=>now},requestAnimationFrame(fn){frames.push(fn);},setTimeout(){return 1;},clearTimeout(){},
  escapeHTML:String,CITY_TYPES:{civic:{description:'Council hall'}},toast(){throw Error('Unexpected missing-town toast');}};
 runInNewContext(source,context,{filename:'continuous-map.js'});
 const api=context.window.ContinuousMap;api.init();
 const advance=async(ms,one=false)=>{now+=ms;const queue=one?frames.splice(0,1):frames.splice(0);for(const fn of queue)fn(now);await flush();};
 return{api,renderer,context,model,frames,selections,calls,get,advance,setLoad(fn){load=fn;}};
}

test('Home during the terrain-occlusion correction cancels the old town focus',async()=>{
 const f=fixture({obscured:true}),focus=f.api.focusTown(0);
 await flush();await f.advance(1000);
 assert.equal(f.renderer.elevation,.72,'the first flight completed before its extra terrain correction');
 assert.equal(f.api.moving,true,'the obscured town must begin its second flight');
 assert.equal(f.context.window.__continuousFocus,undefined,'focus is not published before the correction finishes');
 const home=f.api.home();
 await f.advance(280);
 assert.equal(await focus,null,'a cancelled correction cannot return a model to focusSite and restart the flight');
 assert.equal(f.context.window.__continuousFocus,undefined,'the cancelled town cannot publish stale focus state');
 await f.advance(720);assert.equal(await home,true);
 assert.equal(f.renderer.zoom,1);assert.deepEqual([...f.renderer.target],[0,0,0]);
 assert.equal(f.selections.filter(Boolean).length,0);
});

test('Home while a building waits for its town prevents the late load from taking the camera',async()=>{
 const f=fixture();let release;
 f.setLoad(()=>new Promise(resolve=>{release=resolve;}));
 const focus=f.api.focusBuilding(0,'b0'),home=f.api.home();
 await f.advance(1000);assert.equal(await home,true);
 release(f.model);await flush();await focus;
 assert.equal(f.frames.length,0,'the late town result cannot schedule a new building flight');
 assert.equal(f.selections.filter(Boolean).length,0,'the late result cannot reopen building selection');
 assert.equal(f.renderer.zoom,1);assert.deepEqual([...f.renderer.target],[0,0,0]);
 assert.equal(f.api.layer.focusId,null);
});

test('a stale animation frame cannot clear the moving state of its replacement',async()=>{
 const f=fixture(),old=f.api.home(),replacement=f.api.home();
 assert.equal(f.frames.length,2);assert.equal(f.api.moving,true);
 assert.equal(f.renderer.cameraAnimating,true,'renderer refinement observes the active camera flight');
 await f.advance(16,true);
 assert.equal(await old,false);assert.equal(f.api.moving,true,'the replacement is still waiting for its first frame');
 assert.equal(f.renderer.cameraAnimating,true,'an obsolete frame cannot release the replacement flight’s refinement guard');
 await f.advance(984);assert.equal(await replacement,true);assert.equal(f.api.moving,false);
 assert.equal(f.renderer.cameraAnimating,false);
});

test('a current building request still selects and reaches the detail view',async()=>{
 const f=fixture(),focus=f.api.focusBuilding(0,'b0');
 await flush();assert.equal(f.selections.filter(Boolean).length,1);assert.equal(f.api.moving,true);
 await f.advance(850);assert.equal(await focus,true);
 assert(f.renderer.zoom>=60);assert.equal(f.renderer.elevation,.70);assert.equal(f.api.moving,false);
});

test('stationary crowd frames keep diagnostics current without laying out labels, pins or titles',()=>{
 const f=fixture();f.renderer.zoom=60;f.get('names').checked=true;f.renderer.onChange();
 const before={...f.calls};
 for(let i=1;i<=100;i++){f.renderer.folkStats={visible:i};f.renderer.onChange();}
 for(const name of['labels','pins','titles','cityCameras','ruinCameras','inspectors'])assert.equal(f.calls[name],before[name],`${name} repeated for a stationary frame`);
 assert.equal(f.context.window.__folk.visible,100,'crowd diagnostics must not become stale with the UI cache');
 assert.equal(f.api.walking,true,'the idle UI cache does not prevent crowd animation from starting');
});

test('camera pose, viewport and label state each invalidate the relevant UI exactly once',()=>{
 const f=fixture();f.renderer.zoom=60;f.get('names').checked=false;f.renderer.onChange();
 const changes=[[()=>f.renderer.zoom+=1,true],[()=>f.renderer.target[0]+=.1,true],[()=>f.renderer.target[1]+=.1,true],
  [()=>f.renderer.target[2]+=.1,true],[()=>f.renderer.azimuth+=.1,true],[()=>f.renderer.elevation+=.1,true],
  [()=>f.renderer.width+=100,true],[()=>f.renderer.height+=100,true],[()=>f.renderer.layer='faiths',false],
  [()=>f.get('names').checked=true,true],[()=>f.renderer.options.legends=false,false]];
 for(const [change,pinsChanged] of changes){
  const before={...f.calls};change();f.renderer.onChange();
  assert.equal(f.calls.labels,before.labels+1,'changed camera or label state reaches the prior world-label callback');
  assert.equal(f.calls.pins,before.pins+Number(pinsChanged),'building pins update for their view or visibility and reuse placement across thematic/legend changes');
  assert(f.calls.titles>before.titles);
  f.renderer.onChange();assert.equal(f.calls.labels,before.labels+1,'the unchanged follow-up draw is cached');
  assert.equal(f.calls.pins,before.pins+Number(pinsChanged),'the unchanged follow-up draw also reuses pin placement');
 }
});

test('town and ruin model notifications invalidate stationary label caches',()=>{
 const f=fixture();f.renderer.onChange();
 f.api.layer.models.set(0,f.model);
 const notify=[()=>f.api.layer.onChange(),()=>{f.api.ruinLayer.models.set('ruin',{site:{x:80,y:80}});f.api.ruinLayer.onChange();}];
 for(const change of notify){
  const previous=f.calls.labels;change();f.renderer.onChange();
  assert(f.calls.labels>previous,'new model data must reach labels even when the camera is stationary');
  const current=f.calls.labels;f.renderer.onChange();assert.equal(f.calls.labels,current);
 }
 assert.equal(f.context.window.__continuous.models,1);assert.equal(f.context.window.__ruins.models,1);
});

test('an open town Story refreshes for world and model data, not camera or crowd frames',()=>{
 const f=fixture();f.api.layer.models.set(0,f.model);f.api.details(f.model);
 const writes=f.calls.inspectors;f.renderer.onChange();f.renderer.target[0]+=.5;f.renderer.onChange();
 for(let i=0;i<20;i++)f.renderer.onChange();
 assert.equal(f.calls.inspectors,writes,'camera-only events must not reconstruct the open dossier');
 f.model.p.pop=1500;f.model.p.urbanPop=900;f.api.onWorldUpdate();
 assert.equal(f.calls.inspectors,writes+1);assert.match(f.get('inspector').innerHTML,/data-pop="1500">900/);
 f.model.p.name='Renamed town';f.api.layer.onChange();
 assert.match(f.get('inspector').innerHTML,/<h2>Renamed town<\/h2>/);
 assert.equal(f.context.OneMap.detailContext.kind,'town');assert.equal(f.context.OneMap.detailContext.id,0);
 f.context.OneMap.closeDrawer();const closed=f.calls.inspectors;f.api.onWorldUpdate();f.renderer.onChange();
 assert.equal(f.calls.inspectors,closed,'data refresh does not reopen a closed Story');
});
