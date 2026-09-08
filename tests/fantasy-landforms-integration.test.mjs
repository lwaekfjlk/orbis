import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {fantasyDefaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'return {generateWorld,createCivilization,generateCity,auditCity,auditCivilization,physicalFingerprint,settlementFingerprint,politicalFingerprint,stepCivilization,RoadNetwork,AtlasSpace,CityEnvironment,LandscapeRelief,GW,GH,GN};')();
const scenarios=[];
test.before(async()=>{
 for(const params of [fantasyDefaults,{...fantasyDefaults,seed:'Fantasy-crossroads',form:'rift'},{...fantasyDefaults,seed:'Fantasy-island-realms',form:'isles'}]){
  const w=await E.generateWorld(params),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
  scenarios.push({w,s});
 }
});

test('new landforms still support connected majority countries and settled communities',()=>{
 for(const {w,s} of scenarios){
  assert.equal(w.params.landformVersion,2);assert(w.landformRegions.length>=3);
  const audit=E.auditCivilization(s,w);
  for(const field of ['invalidOwners','badShares','badPop','badCapitals','waterClaims','routeErrors'])assert.equal(audit[field],0,w.params.seed+' '+field);
  const realms=s.realms.filter(c=>c.alive);assert(realms.length>1&&realms.length<s.provinces.filter(p=>p.settled).length);
  for(const c of realms){
   const held=s.provinces.filter(p=>p.owner===c.id),population=held.reduce((n,p)=>n+p.pop,0);
   const shares=c.people.map((_,k)=>held.reduce((n,p)=>n+p.pop*p.people[k],0)/population);
   assert(Math.max(...shares)>.5,c.name+' lost its founding majority');
   const owned=new Set(held.map(p=>p.id)),seen=new Set([c.capital]),todo=[c.capital];
   while(todo.length)for(const edge of s.administrationGraph[todo.pop()])if(owned.has(edge.to)&&!seen.has(edge.to)){seen.add(edge.to);todo.push(edge.to);}
   assert.equal(seen.size,owned.size,c.name+' annexed disconnected land');
  }
  assert(s.provinces.filter(p=>p.settled).every(p=>s.realms[p.owner]?.alive),'a settlement was stranded by the new terrain');
  const total=s.provinces.reduce((n,p)=>n+p.pop,0),unclaimed=s.provinces.filter(p=>p.owner<0).reduce((n,p)=>n+p.pop,0);
  assert(unclaimed/total<.025,'too many residents were left outside all countries');
 }
});

test('roads and rivers remain connected to their real dry land and drainage after carving',()=>{
 for(const {w,s} of scenarios){
  const before=E.physicalFingerprint(w),net=E.RoadNetwork.ensure(w,s);assert(net.roads.length>10);
  for(const road of net.roads){
   assert.equal(road.path[0],s.provinces[road.from].i);assert.equal(road.path.at(-1),s.provinces[road.to].i);
   for(let k=0;k<road.path.length;k++){
    const i=road.path[k];assert(w.height[i]>0&&w.lake[i]<0,'a road crosses open water');
    if(k){const j=road.path[k-1];assert(Math.abs(i%E.GW-j%E.GW)<=1&&Math.abs(Math.floor(i/E.GW)-Math.floor(j/E.GW))<=1);}
   }
   for(const i of road.bridges)assert(w.flow[i]>(w.channelThreshold?.[i]||w.riverThreshold),'a bridge has no river');
  }
  assert.equal(w.riverCycleCells,0);assert(w.waterBudgetError<1e-9);
  assert.equal(E.physicalFingerprint(w),before,'road generation changed the terrain');
 }
});

test('town parcels stay dry and seated on the new surface, including a town near the landforms',()=>{
 for(const {w,s} of scenarios){
  const hash=E.physicalFingerprint(w),snapshot=JSON.stringify(s),settled=s.provinces.filter(p=>p.city).sort((a,b)=>b.urbanPop-a.urbanPop);
  E.LandscapeRelief.prepare(w,s);
  const near=settled.slice().sort((a,b)=>b.cells.reduce((n,i)=>n+(w.landformStrength?.[i]||0),0)/b.cells.length-a.cells.reduce((n,i)=>n+(w.landformStrength?.[i]||0),0)/a.cells.length)[0];
  for(const p of new Set([settled[0],near])){
   const city=E.generateCity(w,s,p.id),audit=E.auditCity(city),frame=E.AtlasSpace.cityFrame(w,p,city);
   assert(city.buildings.length>20);assert.equal(audit.wetBuildings,0,p.name+' has flooded buildings');assert.equal(audit.nonfinite,0);
   for(const b of city.buildings){
    const a=frame.anchors.get(b.id);assert(a&&Number.isFinite(a.y));assert(a.y>=a.top-1e-9);
    if(!b.precinct)assert((a.top-a.low)/a.scale<=b.footingLimit+1e-5,p.name+' has an oversized footing');
   }
   for(const [dx,dy] of [[-.37,.24],[.41,-.19]]){
    const gx=p.x+dx,gy=p.y+dy;assert(Math.abs(E.AtlasSpace.surface(w,gx,gy)-E.CityEnvironment.atlasSurface(w,gx,gy))<1e-8,'the surveyed town moved off its protected ground');
   }
  }
  assert.equal(E.physicalFingerprint(w),hash);assert.equal(JSON.stringify(s),snapshot,'visiting towns changed their civilization');
 }
});

test('JSON restoration and continued history are deterministic on the new geography',()=>{
 for(const {w,s} of scenarios){
  const live=JSON.parse(JSON.stringify(s)),restored=JSON.parse(JSON.stringify(s)),before=E.physicalFingerprint(w);
  for(let year=0;year<3;year++){E.stepCivilization(live,w);E.stepCivilization(restored,w);}
  assert.deepEqual(restored,live);assert.equal(E.physicalFingerprint(w),before);
 }
});
