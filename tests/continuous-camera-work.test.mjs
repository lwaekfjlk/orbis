import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
// Instrument entry only; the real dossier function and the public UI lifecycle
// remain intact. The layer uses its actual cameraChanged method, including timers.
const ui=read('src/ui/continuous-map.js').replace('function refreshPlaceDetails(){','function refreshPlaceDetails(){ __calls.details++;');
const cityLayer=read('src/continuous/city-layer.js');
const cameraChanged=cityLayer.slice(cityLayer.indexOf(' cameraChanged(){'),cityLayer.indexOf(' async stream(){'));
function fixture({walking=false}={}){
 const calls={folk:0,roads:0,details:0,measures:0,picks:0,requests:0,stream:0},elements=new Map(),timers=new Map(),frames=[],fontListeners=new Map();
 let now=0,nextTimer=0;
 const element=()=>({style:{},dataset:{},checked:true,textContent:'',classList:{add(){},remove(){},contains(){return true;}},appendChild(){},replaceChildren(){},addEventListener(){},setAttribute(){},querySelectorAll(){return[];},get offsetWidth(){calls.measures++;return 90;},get offsetHeight(){return 18;}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const world={params:{seed:'camera-work'},height:[200]},sim={provinces:[{id:0,name:'Camera town',x:0,y:0,i:0,settled:true,urbanPop:10000}],realms:[{alive:true}]};
 const renderer={world,sim,target:[0,0,0],zoom:100,elevation:.8,azimuth:.1,relief:1,width:1200,height:800,options:{},canvas:{id:'map'},dir:[0,-1,0],mvp:[],visible(){return true;},onChange(){},updateCamera(){},request(){calls.requests++;},buildFolk(){calls.folk++;},buildNearRoads(){calls.roads++;}};
 const context={window:{matchMedia:()=>({matches:!walking})},world,sim,renderer,busy:false,simAdvancing:false,__calls:calls,
  document:{body:element(),visibilityState:'visible',getElementById:get,createElement:element,addEventListener(){},fonts:{addEventListener(name,fn){fontListeners.set(name,fn);}}},
  OneMap:{panel:null,scene:'world'},LandmarkUI:{registry:[]},LandmarkBinding:{highCitadelLabel(){return null;}},
  AtlasSpace:{TOWN_ZOOM:16,DETAIL_ZOOM:60,grid(x,z){return[x,z];},pickGround(){calls.picks++;return null;}},
  ContinuousRuinLayer:class{constructor(){this.models=new Map();}report(){return{};}visible(){return null;}cameraChanged(){}reset(){this.models.clear();}bind(){}},
  installDepthRasterizer(){},rgb(){return[];},mul4(){return[];},ortho(){return[];},lookAt(){return[];},project4(){return[0,0,0,1];},
  performance:{now:()=>now},requestAnimationFrame(fn){frames.push(fn);},
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);}
 };
 runInNewContext(`class ContinuousCityLayer{
 constructor(r){this.r=r;this.world=world;this.sim=sim;this.models=new Map();this.natural=true;this.loading=false;this.lastExcavationKey='closed';this.lastTerrainKey='terrain';this.lastEnvironmentKey='environment';}
 report(){return{models:this.models.size,loading:this.loading};}ground(){return 0;}
 excavationKey(){return 'closed';}terrainKey(){return 'terrain';}environmentKey(){return 'environment';}
 bind(w,s){this.world=w;this.sim=s;}reset(w,s){this.world=w;this.sim=s;this.models.clear();clearTimeout(this.timer);}
 stream(){__calls.stream++;}
 ${cameraChanged}
}\n${ui}`,context,{filename:'continuous-camera-work.js'});
 const api=context.window.ContinuousMap;api.init();
 const mount=(key='first')=>{const p=sim.provinces[0],b={id:'hall',name:'Council hall',landmark:true,h:5},anchor={x:0,y:0,z:0,scale:.01};
  const model={p,key,city:{buildings:[b],siteEnvironment:{label:'Valley',minElevation:10,maxElevation:30}},frame:{anchors:new Map([[b.id,anchor]])},heights:{hall:5}};
  api.layer.models.set(0,model);api.layer.onChange();return model;
 };
 const advance=ms=>{now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 const frame=ms=>{now+=ms;const batch=frames.splice(0);for(const fn of batch)fn(now);};
 return{api,calls,renderer,context,mount,advance,frame,fonts:fontListeners,elements};
}

test('pan/orbit keeps roads and labels live but coalesces the still crowd and leaves the dossier intact',()=>{
 const f=fixture();f.mount();f.renderer.onChange();f.advance(200);
 const before={...f.calls};
 for(let i=0;i<12;i++){f.renderer.target[0]+=.1;f.renderer.azimuth+=.02;f.renderer.onChange();}
 assert.equal(f.calls.roads-before.roads,12,'the actual layer updates road coverage on every camera step');
 assert.equal(f.calls.measures-before.measures,12,'building labels track each new view once');
 assert.equal(f.calls.folk,before.folk,'camera reports must not rebuild and upload the crowd inline');
 assert.equal(f.calls.details,before.details,'panning cannot rewrite an open dossier');
 f.advance(149);assert.equal(f.calls.folk,before.folk);
 f.advance(1);assert.equal(f.calls.folk,before.folk+1,'the final camera still re-culls the static crowd');
});

test('walking redraws reuse stationary label layout while residents retain their animation cadence',()=>{
 const f=fixture({walking:true});f.mount();f.renderer.onChange();const before={...f.calls};
 for(let i=0;i<6;i++){f.frame(42);f.renderer.onChange();}
 assert.equal(f.calls.folk-before.folk,6,'walking figures continue to update at the existing cadence');
 assert.equal(f.calls.measures,before.measures);assert.equal(f.calls.picks,before.picks,'stationary crowd frames do not repeat terrain ray picks');
 assert.equal(f.calls.details,before.details);
 f.renderer.target[2]+=.1;f.renderer.onChange();assert.equal(f.calls.measures,before.measures+1);
});

test('new models, simulation refresh and world replacement still refresh dependent content',()=>{
 const f=fixture();f.mount();f.renderer.onChange();const before={...f.calls};
 f.api.layer.loading=true;f.api.layer.onChange();assert.equal(f.context.window.__continuous.loading,true);assert.equal(f.calls.folk,before.folk);assert.equal(f.calls.details,before.details);
 f.mount('replacement');assert.equal(f.calls.folk,before.folk+1);assert.equal(f.calls.details,before.details+1);assert.equal(f.calls.measures,before.measures+1);
 const refreshed={...f.calls};f.api.onWorldUpdate();assert.equal(f.calls.folk,refreshed.folk+1);assert.equal(f.calls.details,refreshed.details+1,'new simulation data refreshes an unchanged town dossier');
 f.renderer.target[0]+=.1;f.renderer.onChange();const reset={...f.calls};f.api.beforeWorldBuild();f.advance(300);assert.equal(f.calls.folk,reset.folk,'old-world crowd timers are cancelled');
 f.mount('next-world');assert.equal(f.calls.details,reset.details+1);assert.equal(f.calls.measures,reset.measures+1);
});

test('resizing, label visibility and completed font loading invalidate stationary pin placement',()=>{
 const f=fixture();f.mount();f.renderer.onChange();const before=f.calls.measures;
 f.renderer.onChange();assert.equal(f.calls.measures,before);
 f.renderer.width+=40;f.renderer.onChange();assert.equal(f.calls.measures,before+1);
 f.elements.get('names').checked=false;f.renderer.onChange();assert.equal(f.elements.get('cmLabels').style.display,'none');assert.equal(f.calls.measures,before+1);
 f.elements.get('names').checked=true;f.renderer.onChange();assert.equal(f.calls.measures,before+2);
 f.fonts.get('loadingdone')();f.renderer.onChange();assert.equal(f.calls.measures,before+3,'new font metrics require a fresh collision layout');
});

test('attaching a busy world avoids a redundant crowd rebuild before the first ready frame',()=>{
 const f=fixture();f.context.busy=true;
 f.api.onWorldUpdate();assert.equal(f.calls.folk,0,'initial world attachment already built its atlas traffic');
 f.renderer.onChange();f.advance(200);assert.equal(f.calls.folk,0,'busy renderer callbacks cannot start a crowd timer');
 f.context.busy=false;f.renderer.onChange();f.advance(150);
 assert.equal(f.calls.folk,1,'the first ready camera still builds the correctly culled crowd');
 const before=f.calls.folk;f.api.onWorldUpdate();assert.equal(f.calls.folk,before+1,'later simulation changes remain live');
});
