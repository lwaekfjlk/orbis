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
 let now=0,load=()=>Promise.resolve(model);
 const element=()=>({style:{},dataset:{},classList:{add(){},remove(){}},appendChild(){},addEventListener(){},setAttribute(){},replaceChildren(){},querySelectorAll(){return[];},getBoundingClientRect(){return{left:0,top:0};}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const p={id:0,x:2,y:3,name:'Test town',settled:true,city:true};
 const b={id:'b0',name:'Council hall',x:0,z:0,w:4,d:4,h:5,type:'civic',landmark:false};
 const anchor={x:2,y:.1,z:3,scale:.01,b};
 const model={p,city:{buildings:[b],siteEnvironment:{label:'Valley',minElevation:0,maxElevation:100}},frame:{anchors:new Map([[b.id,anchor]]),sx:.01,sz:.01},heights:{b0:5}};
 const renderer={target:[4,1,5],zoom:1,elevation:1.19,azimuth:.018,relief:1,width:1200,height:800,
  options:{},canvas:{id:'map'},dir:[0,-1,0],mvp:[],visible(){return true;},onChange(){},updateCamera(){},request(){}};
 class Layer{
  constructor(){this.models=new Map();this.focusId=null;this.loading=false;}
  async ensure(id){const m=await load(id);if(m)this.models.set(id,m);return m;}
  select(hit){selections.push(hit);}
  cameraChanged(){}
  ground(){return 0;}
 }
 const context={window:{},document:{body:element(),getElementById:get,createElement:element,addEventListener(){}},renderer,
  world:{params:{seed:'test'}},sim:{provinces:[p],realms:[{alive:true}]},busy:false,simAdvancing:false,
  ContinuousCityLayer:Layer,OneMap:{closeDrawer(){},closeMenus(){},clearSelection(){},scene:'world'},
  CityEnvironment:{profile(){return{mountainous:false};}},
  AtlasSpace:{TOWN_ZOOM:16,DETAIL_ZOOM:60,MAX_ZOOM:620,point(w,x,y){return[x,0,y];},grid(x,z){return[x,z];},pickGround(){return obscured?{point:[2,1,3]}:null;}},
  installDepthRasterizer(){},rgb(){return[0,0,0];},mul4(){return[];},ortho(){return[];},lookAt(){return[];},
  project4(){return[0,0,0,1];},sub(a,b){return a.map((v,i)=>v-b[i]);},dot(a,b){return a.reduce((n,v,i)=>n+v*b[i],0);},
  clamp(x,lo=0,hi=1){return Math.max(lo,Math.min(hi,x));},lerp(a,b,t){return a+(b-a)*t;},
  performance:{now:()=>now},requestAnimationFrame(fn){frames.push(fn);},clearTimeout(){},
  escapeHTML:String,CITY_TYPES:{civic:{description:'Council hall'}},toast(){throw Error('Unexpected missing-town toast');}};
 runInNewContext(source,context,{filename:'continuous-map.js'});
 const api=context.window.ContinuousMap;api.init();
 const advance=async(ms,one=false)=>{now+=ms;const queue=one?frames.splice(0,1):frames.splice(0);for(const fn of queue)fn(now);await flush();};
 return{api,renderer,context,model,frames,selections,advance,setLoad(fn){load=fn;}};
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
 await f.advance(16,true);
 assert.equal(await old,false);assert.equal(f.api.moving,true,'the replacement is still waiting for its first frame');
 await f.advance(984);assert.equal(await replacement,true);assert.equal(f.api.moving,false);
});

test('a current building request still selects and reaches the detail view',async()=>{
 const f=fixture(),focus=f.api.focusBuilding(0,'b0');
 await flush();assert.equal(f.selections.filter(Boolean).length,1);assert.equal(f.api.moving,true);
 await f.advance(850);assert.equal(await focus,true);
 assert(f.renderer.zoom>=60);assert.equal(f.renderer.elevation,.70);assert.equal(f.api.moving,false);
});
