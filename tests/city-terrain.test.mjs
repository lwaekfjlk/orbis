import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults,root} from './engine-loader.mjs';
import {resolve} from 'node:path';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const E=Function(source+'\nreturn {CityEnvironment,AtlasSpace,generateWorld,createCivilization,generateCity,auditCity,ArtisanCityKit,GW,GH};')();
const cell=50*E.GW+100;
let worldPromise;const worldAndSociety=()=>worldPromise??=(async()=>{const w=await E.generateWorld(defaults);return{w,s:E.createCivilization(w,{realms:18,historySeed:'First-dawn'})};})();
function ridge(){const w={height:new Float64Array(E.GW*E.GH).fill(100),lake:new Float64Array(E.GW*E.GH),ice:new Float64Array(E.GW*E.GH)};w.height[cell]=w.height[cell+E.GW+1]=1000;return w;}
test('refinement samples a curved patch instead of repeating the coarse diagonal faces',()=>{
 const w=ridge(),high=E.AtlasSpace.height(w,cell),low=E.AtlasSpace.height(w,cell+1);
 assert.equal(E.AtlasSpace.surface,E.CityEnvironment.atlasSurface,'mesh registration must share the refined surface');
 for(const[u,v,i]of[[0,0,cell],[1,0,cell+1],[0,1,cell+E.GW],[1,1,cell+E.GW+1]])assert.equal(E.AtlasSpace.surface(w,100+u,50+v),E.AtlasSpace.height(w,i));
 const center=E.AtlasSpace.surface(w,100.5,50.5),quarter=E.AtlasSpace.surface(w,100.25,50.25);
 assert(Math.abs(center-(high+low)/2)<1e-12);assert(Math.abs(quarter-(high*.625+low*.375))<1e-12);
 // The old diagonal connected two high corners with an entirely straight ridge.
 assert(center<high-.3);assert(Math.abs(quarter-(high+center)/2)>.05,'new samples must change the actual surface shape');
 // Parent-cell edges stay linear, so a refined cell can meet a coarse neighbour.
 for(const t of[.125,.37,.75])assert(Math.abs(E.AtlasSpace.surface(w,100+t,50)-(high+(low-high)*t))<1e-12);
});
test('analytic grades follow the curved surface and have no artificial diagonal jump',()=>{
 const w=ridge(),h=1e-5;
 for(const relief of[.5,1,1.7])for(const[x,y]of[[100.15,50.25],[100.52,50.5],[100.75,50.8]]){
  const dx=(E.AtlasSpace.surface(w,x+h,y,relief)-E.AtlasSpace.surface(w,x-h,y,relief))/(2*h*E.AtlasSpace.X),dy=(E.AtlasSpace.surface(w,x,y+h,relief)-E.AtlasSpace.surface(w,x,y-h,relief))/(2*h*E.AtlasSpace.Z);
  assert(Math.abs(E.CityEnvironment.atlasGrade(w,x,y,relief)-Math.hypot(dx,dy))<1e-7);
 }
 assert(E.CityEnvironment.atlasGrade(w,100.5,50.5)<1e-12);
 assert(Math.abs(E.CityEnvironment.atlasGrade(w,100.3-h,50.3)-E.CityEnvironment.atlasGrade(w,100.3+h,50.3))<1e-4);
});
test('exact parcel bounds cover curved patches and peaks between nine survey points',()=>{
 const w=ridge();
 for(const a of[[100.1,50.2,100.8,50.9],[99.2,49.1,101.5,51.3]]){
  const b=E.CityEnvironment.atlasBounds(w,...a),corners=[];
  for(const x of[a[0],a[2]])for(const y of[a[1],a[3]])corners.push(E.AtlasSpace.surface(w,x,y));
  if(a[0]>=100){assert.equal(b.top,Math.max(...corners));assert.equal(b.low,Math.min(...corners));}
  else{const nine=[];for(const x of[a[0],(a[0]+a[2])/2,a[2]])for(const y of[a[1],(a[1]+a[3])/2,a[3]])nine.push(E.AtlasSpace.surface(w,x,y));assert.equal(b.top,E.AtlasSpace.height(w,cell));assert(b.top>Math.max(...nine)+.05);}
  for(let i=0;i<=40;i++)for(let j=0;j<=40;j++){const h=E.AtlasSpace.surface(w,a[0]+(a[2]-a[0])*i/40,a[1]+(a[3]-a[1])*j/40);assert(h>=b.low-1e-10&&h<=b.top+1e-10);}
 }
});
test('Oakwaystead keeps viable neighborhoods and visible uphill roofs with bounded footings',async()=>{
 const {w,s}=await worldAndSociety(),p=s.provinces[168];assert.equal(p.name,'Oakwaystead');
 const c=E.generateCity(w,s,p.id),f=E.AtlasSpace.cityFrame(w,p,c,1);assert(c.buildings.length>150);assert(c.defenses.gates.length>0);
 const audit=E.auditCity(c);for(const k of['wetBuildings','roadBuildings','overlaps','nonfinite','seaRoads'])assert.equal(audit[k],0,k);
 for(let z=5;z<c.n-5;z+=9)for(let x=5;x<c.n-5;x+=9){const q=c.xy(z*c.n+x),a=f.at(q.x,q.z),eps=1e-4,fx=a[0]-Math.floor(a[0]),fy=a[1]-Math.floor(a[1]);
  if(Math.min(fx,fy,1-fx,1-fy)<.001)continue;
  const grade=Math.hypot((f.ground(q.x+eps,q.z)-f.ground(q.x-eps,q.z))/(2*eps*f.sx),(f.ground(q.x,q.z+eps)-f.ground(q.x,q.z-eps))/(2*eps*f.sz));
  assert(Math.abs(c.atlasSlope[z*c.n+x]-grade)<1e-5,'router slope differs from the terrain drawn under its streets');
 }
 for(const b of c.buildings){const a=f.anchors.get(b.id);assert(a.y>=a.top);if(!b.precinct)assert((a.top-a.low)/a.scale<=b.h*.65+1e-5,'ordinary house requires a footing taller than its allowance');}
 const steepest=c.buildings.filter(b=>!b.precinct).sort((a,b)=>b.terrainFall-a.terrainFall).slice(0,16);let roofs=0;
 for(const b of steepest){const a=f.anchors.get(b.id),m=E.ArtisanCityKit.compound(b,c,p,s.realms[p.owner]);
  for(let k=0;k<m.roof.data.length;k+=9){const[x,y,z]=m.roof.data.slice(k,k+3),v=f.vertex(x,y,z,a);assert(v[1]>=f.ground(x,z)-1e-8,`${b.id} roof is buried in the hillside`);roofs++;}
 }
 assert(roofs>1000);
});

test('steep settlements put their market on a reachable face of the terrain',async()=>{
 const {w,s}=await worldAndSociety();
 for(const id of[145,293]){const c=E.generateCity(w,s,id);assert(c.atlasSlope[c.marketIndex]<=c.streetGradeCap,`${c.name} market is impassable`);assert(c.roads.length>0,`${c.name} lost all streets`);assert(c.buildings.length>18,`${c.name} lost its neighborhood`);}
});
