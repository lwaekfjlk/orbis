import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine, root, defaults} from './engine-loader.mjs';
const E=loadEngine(),rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);
const build=Function('Geometry','rgb',readFileSync(resolve(root,'src/render/city-renderer.js'),'utf8')+'\nreturn cityStreetMesh;')(E.Geometry,rgb);
const point=(x,z,bridge=false)=>({x,z,y:0,bridge});
const road=(kind,...points)=>({kind,points});
function mesh(roads,ground=()=>0,connectors=[]){const g=new E.Geometry();const stats=build({roads,townProfile:{width:1},connectors},ground,g);return{g,stats};}
const triangles=g=>Array.from({length:g.data.length/27},(_,i)=>[0,9,18].map(j=>({x:g.data[i*27+j],z:g.data[i*27+j+2]})));
const side=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function covers(tri,p){const s=tri.map((a,k)=>side(a,tri[(k+1)%3],p));return s.every(v=>v>=-1e-8)||s.every(v=>v<=1e-8);}

test('shared streets are one ribbon at the widest route class',()=>{
 const a=point(0,0),b=point(4,0),c=point(4,4),wide=road('arterial',a,b,c);
 const single=mesh([wide]),shared=mesh([road('street',c,b,a),wide,wide]);
 assert.equal(shared.stats.edges,2);
 assert.deepEqual(shared.g.data,single.g.data,'replayed routes cannot create coplanar copies');
 const xs=shared.g.data.filter((_,i)=>i%9===0),zs=shared.g.data.filter((_,i)=>i%9===2);
 assert(Math.max(...xs)<=4.670001&&Math.min(...zs)>=-.670001,'junctions stay within their street reservation');
});

test('corners, forks and building connectors have a continuous single surface',()=>{
 const roads=[road('arterial',point(-4,0),point(0,0),point(0,4)),road('street',point(0,0),point(3,-3))];
 const {g}=mesh(roads,()=>0,[{a:point(0,3),b:point(2,3)}]),tris=triangles(g);
 assert(g.data.every(Number.isFinite));
 for(const p of [point(0,0),point(.3,-.3),point(-.4,.4),point(.4,.4),point(0,3),point(1,3)])assert(tris.some(t=>covers(t,p)),`street junction missing at ${p.x},${p.z}`);
 // Strictly interior test points should touch exactly one triangle, so z-fighting
 // cannot return merely because intersecting routes have different triangulations.
 for(let x=-.9;x<.9;x+=.137)for(let z=-.9;z<.9;z+=.143){
  const n=tris.filter(t=>{const s=t.map((a,k)=>side(a,t[(k+1)%3],{x,z}));return s.every(v=>v>1e-8)||s.every(v=>v< -1e-8);}).length;
  assert(n<=1,`overlapping street faces at ${x},${z}`);
 }
});

test('every road corner follows its own ground height and ignores stale centre heights',()=>{
 const ground=(x,z)=>x*.7-z*.9+.12*x*z;
 const {g}=mesh([road('arterial',point(-3,0),point(0,0),point(3,3))],ground);
 assert(g.data.length>0);
 for(let i=0;i<g.data.length;i+=9)assert(Math.abs(g.data[i+1]-ground(g.data[i],g.data[i+2])-.14)<1e-9);
 const bridge=mesh([road('arterial',point(-2,0),point(0,0,true),point(2,0))],ground);
 assert(bridge.g.data.every(Number.isFinite));
 const lifts=[];for(let i=0;i<bridge.g.data.length;i+=9)lifts.push(bridge.g.data[i+1]-ground(bridge.g.data[i],bridge.g.data[i+2]));
 assert(Math.min(...lifts)>=.14-1e-9);assert(Math.max(...lifts)>.6&&Math.max(...lifts)<=.62+1e-9);
});

test('empty and collapsed routes produce finite geometry without a false segment',()=>{
 const {g,stats}=mesh([road('street',point(2,2),point(2,2)),road('street')]);
 assert.equal(stats.edges,0);assert.equal(g.data.length,0);
});

function nearFixture(waterKind=0){
 const w={height:new Float32Array(E.GN).fill(100),lake:new Float32Array(E.GN).fill(-1)},p={id:1,x:150,y:90},n=41,width=152,depth=124;
 const c={n,width,depth,span:7.8,terrainSpan:2.34,townProfile:{width:1},height:new Float32Array(n*n),water:new Uint8Array(n*n),waterKind:new Uint8Array(n*n),environment:{ice:new Float32Array(n*n)},buildings:[{id:1,x:0,z:0,w:16,d:16,y:0}],defenses:{perimeter:[{x:-35,z:-30},{x:35,z:-30},{x:35,z:30},{x:-35,z:30}]},roads:[]};
 c.xy=i=>({x:(i%n/(n-1)-.5)*width,z:(Math.floor(i/n)/(n-1)-.5)*depth});
 c.index=(x,z)=>Math.round(Math.max(0,Math.min(n-1,(z/depth+.5)*(n-1))))*n+Math.round(Math.max(0,Math.min(n-1,(x/width+.5)*(n-1))));
 const gate=c.xy(c.index(60,15));c.roads=[{role:'gate-approach',points:[c.xy(c.index(20,15)),gate]}];
 if(waterKind)for(let i=0;i<n*n;i++)if(c.xy(i).x< -65){c.water[i]=1;c.waterKind[i]=waterKind;}
 const frame=E.AtlasSpace.cityFrame(w,p,c),model={p,city:c,frame},r=Object.create(E.AtlasRenderer.prototype),meshes={};
 Object.assign(r,{world:w,relief:1,roadNetwork:{signature:'fixture',roads:[{cls:'highway',from:2,to:1,path:[146,147,148,149,150].map(x=>p.y*E.GW+x),bridges:[p.y*E.GW+p.x]}]},continuousModels:new Map([[p.id,model]]),target:frame.origin,halfW:3,halfH:3,elevation:1,updateCamera(){},ground(x,y){return E.AtlasSpace.surface(w,x,y)},coord(x,y,h){const q=E.AtlasSpace.point(w,x,y);q[1]=h;return q},upload(name,g){meshes[name]=g;}});
 return{r,c,p,frame,gate,meshes};
}

test('near atlas roads use street widths and enter through an existing exterior gate approach',()=>{
 const {r,c,p,frame,gate,meshes}=nearFixture(),snapshot=JSON.stringify(c);r.buildNearRoads();
 assert.equal(r.nearRoadAccess.length,1,'incoming parent road connects to the city street network');
 const access=r.nearRoadAccess[0].points,last=access.at(-1),end=frame.at(gate.x,gate.z);
 assert(Math.hypot(last.x-end[0],last.y-end[1])<1e-9,'the approach ends on the real gate street');
 for(const q of access){const x=(q.x-p.x)/frame.cells*c.width,z=(q.y-p.y)/frame.cells*c.width;assert(!(x>-35&&x<35&&z>-30&&z<30),'parent roads cannot cut through the curtain and town blocks');}
 const g=meshes.roadsNear;assert(g.data.every(Number.isFinite));
 const west=E.AtlasSpace.point(r.world,p.x-2,p.y);
 for(let i=0;i<g.data.length;i+=9)if(g.data[i]<west[0])assert(Math.abs(g.data[i+2]-west[2])<=.67*frame.scale+1e-8,'near ribbon retained cartographic width');
 assert.equal(JSON.stringify(c),snapshot,'display access routing leaves the generated city intact');
});

test('an inherited river bridge connects the approach, but never turns sea or lake into a road',()=>{
 const river=nearFixture(3);river.r.buildNearRoads();assert.equal(river.r.nearRoadAccess.length,1);assert(river.r.nearRoadAccess[0].points.some(p=>p.lift>0),'real river crossing gets a bridge deck');
 for(const kind of [1,2]){const water=nearFixture(kind);water.r.buildNearRoads();assert.equal(water.r.nearRoadAccess.length,0,'bridge fallback must not cross open water');}
});


test('incoming roads clear curtains that reach the survey boundary in Scorchwell and Whitebeck',async()=>{
 const w=await E.generateWorld(defaults),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'}),net=E.RoadNetwork.ensure(w,s);
 for(const name of ['Scorchwell','Whitebeck','Oakdell']){
  const p=s.provinces.find(p=>p.name===name),city=E.generateCity(w,s,p.id),frame=E.AtlasSpace.cityFrame(w,p,city),model={p,city,frame},r=Object.create(E.AtlasRenderer.prototype);
  Object.assign(r,{world:w,relief:1,roadNetwork:net,continuousModels:new Map([[p.id,model]]),target:frame.origin,halfW:2,halfH:2,elevation:1,updateCamera(){},ground(x,y){return E.AtlasSpace.surface(w,x,y)},coord(x,y,h){const q=E.AtlasSpace.point(w,x,y);q[1]=h;return q},upload(){}});
  r.buildNearRoads();
  for(const road of net.roads.filter(a=>a.from===p.id||a.to===p.id))assert(r.nearRoadAccess.some(a=>a.from===road.from&&a.to===road.to),name+' incoming road remains connected');
  for(const a of r.nearRoadAccess)for(const q of a.points){
   const local={x:(q.x-p.x)/frame.cells*city.width,z:(q.y-p.y)/frame.cells*city.width},grid=city.context;
   const index=Math.round(Math.max(0,Math.min(grid.n-1,(local.z/grid.depth+.5)*(grid.n-1))))*grid.n+Math.round(Math.max(0,Math.min(grid.n-1,(local.x/grid.width+.5)*(grid.n-1))));
   assert(!grid.water[index]||grid.waterKind[index]===3&&q.lift>0,name+' access crossed unbridged water');
   assert(!city.buildings.some(b=>Math.abs(local.x-b.x)<b.w/2+.67*city.townProfile.width&&Math.abs(local.z-b.z)<b.d/2+.67*city.townProfile.width),name+' access crossed a building');
  }
 }
});

test('a curtain beyond the survey edge moves the approach into the inherited context',()=>{
 const {r,c,p,frame}=nearFixture(),n=c.n*2-1;
 c.context={n,width:c.width*2,depth:c.depth*2,height:new Float32Array(n*n),water:new Uint8Array(n*n),waterKind:new Uint8Array(n*n),ice:new Float32Array(n*n)};
 c.context.xy=i=>({x:(i%n/(n-1)-.5)*c.context.width,z:(Math.floor(i/n)/(n-1)-.5)*c.context.depth});
 c.defenses.perimeter=[{x:-77,z:-30},{x:35,z:-30},{x:35,z:30},{x:-77,z:30}];
 r.buildNearRoads();assert.equal(r.nearRoadAccess.length,1,'the fixed survey rectangle must not strand an incoming road at a wall');
 const access=r.nearRoadAccess[0].points;
 assert((access[0].x-p.x)/frame.cells*c.width< -77-.67,'clip at the actual wall clearance');
 for(const q of access){const x=(q.x-p.x)/frame.cells*c.width,z=(q.y-p.y)/frame.cells*c.width;assert(!(x> -77&&x<35&&z> -30&&z<30),'access goes around the curtain');}
});
