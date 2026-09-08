import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults,root} from './engine-loader.mjs';
import {resolve} from 'node:path';
const E=Function(scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n')+'\nreturn{generateWorld,createCivilization,generateCity,generateCityLandmark,auditCity,AtlasSpace,CityEnvironment,HighCitadelPlan,physicalFingerprint,settlementFingerprint,TownCatalog};')();
let w,s,towns;
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});towns=s.provinces.filter(p=>p.highCitadel).map(p=>({p,c:E.generateCity(w,s,p.id)}));assert.equal(towns.length,2);});
test('extreme highland cities are small complete settlements on the inherited rock',()=>{
 for(const {p,c}of towns){assert(c.source.altitude>=3500);assert(c.terrainSpan<.7);assert(c.width<43);assert(c.buildings.length>=10&&c.buildings.length<=14);
  assert.equal(c.trees.length,0);assert.equal(c.farms.length,0);assert.equal(c.walls.length,0);
  assert.equal(c.highCitadel.kind,p.highCitadel.kind);assert.equal(c.stats.structures,c.buildings.length);
  const audit=E.auditCity(c);for(const key of ['iceBuildings','wetBuildings','roadBuildings','overlaps','nonfinite','seaRoads'])assert.equal(audit[key],0,p.name+': '+key);
  for(const b of c.buildings){assert(b.highRole);assert(!b.sacred);assert(b.terrainFall<=b.footingLimit+1e-6);assert(Math.abs(b.x)+b.w/2<c.width/2);assert(Math.abs(b.z)+b.d/2<c.depth/2);}
  const roles=new Set(c.buildings.map(b=>b.highRole));
  for(const role of p.highCitadel.kind==='dragon'?['keep','roost','watch','forge','lodge','gate']:['sanctuary','bell','chapel','hospice','scriptorium','gate'])assert(roles.has(role),p.name+' missing '+role);
  const frame=E.AtlasSpace.cityFrame(w,p,c);for(let k=0;k<c.height.length;k+=151){const q=c.xy(k),[x,z]=frame.at(q.x,q.z),e=E.CityEnvironment.sample(w,x,z);assert(Math.abs(c.environment.bed[k]-e.bed)<.001);assert.equal(c.environment.parentIndex[k],e.parentIndex);}
 }
});
test('every specialized parcel has a clear path into one connected lane network',()=>{
 for(const {p,c}of towns){const graph=new Map();for(const r of c.roads)for(let k=1;k<r.nodes.length;k++){const a=r.nodes[k-1],b=r.nodes[k];if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a).add(b);graph.get(b).add(a);}
  const seen=new Set([c.marketIndex]),queue=[c.marketIndex];for(const k of queue)for(const n of graph.get(k)||[])if(!seen.has(n)){seen.add(n);queue.push(n);}
  assert.equal(c.connectors.length,c.buildings.length);for(const b of c.buildings)assert(seen.has(b.streetSocket),p.name+' isolated '+b.id);
  for(const q of c.connectors)for(let i=0;i<=100;i++){const t=i/100,x=q.a.x+(q.b.x-q.a.x)*t,z=q.a.z+(q.b.z-q.a.z)*t;assert(!c.water[c.index(x,z)]);for(const b of c.buildings)if(b.id!==q.blockId)assert(!(Math.abs(x-b.x)<b.w/2&&Math.abs(z-b.z)<b.d/2));}
 }
});
test('landmark indexing, history changes and repeat builds preserve the dedicated plan',()=>{
 const before=[E.physicalFingerprint(w),E.settlementFingerprint(s)];
 for(const {p,c}of towns){const exact=E.generateCityLandmark(w,s,p.id);assert.equal(exact.buildingCount,c.buildings.length);const anchor=c.buildings.find(b=>['keep','sanctuary'].includes(b.highRole));assert.deepEqual(exact.buildings,[anchor]);
  const old=p.urbanPop;p.urbanPop=650;assert.equal(E.generateCity(w,s,p.id).fingerprint,c.fingerprint);p.urbanPop=old;
  assert.equal(E.generateCity(w,s,p.id).fingerprint,c.fingerprint);
  assert(E.HighCitadelPlan.viable(w,s,p,p.highCitadel.kind));
  const r=E.TownCatalog.resolve(w,s,p,{style:'forest'});assert.equal(r.style,'mountain');assert.equal(r.highCitadel.kind,p.highCitadel.kind);
 }
 assert.deepEqual([E.physicalFingerprint(w),E.settlementFingerprint(s)],before);
});
