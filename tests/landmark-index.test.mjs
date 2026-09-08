import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(file=>readFileSync(resolve(root,file),'utf8')).join('\n');
const E=Function(source+`
const full=generateCity,query=generateCityLandmark,context=CityEnvironment.context;
const calls={full:0,query:0,context:0};
generateCity=(...args)=>{calls.full++;return full(...args)};
generateCityLandmark=(...args)=>{calls.query++;return query(...args)};
CityEnvironment.context=(...args)=>{calls.context++;return context(...args)};
return {generateWorld,createCivilization,generateCity,generateCityLandmark,LandmarkBinding,
LandmarkCatalog,SacredCityKit,TownCityBinding,TownCatalog,wonderFor,physicalFingerprint,
settlementFingerprint,politicalFingerprint,calls,
withoutDryConnections(fn){const prior=cityDrySegment;cityDrySegment=()=>false;try{return fn()}finally{cityDrySegment=prior}}};`)();
let w,s,inventory,before;
const fingerprints=(w,s)=>[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)];
// Stable public directory data captured before removing eager full-town builds.
// Final local building data remains available explicitly, outside the search index.
const metadata=entries=>entries.map(({id,name,recipe,provinceId,i,x,y,priority,kind})=>({id,name,recipe,provinceId,i,x,y,priority,kind}));

test.before(async()=>{
 w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 // Founding may validate candidate highland layouts. Measure directory work
 // separately from those simulation preflight queries.
 Object.assign(E.calls,{full:0,query:0,context:0});
 before=fingerprints(w,s);inventory=E.LandmarkBinding.inventory(w,s);
});

test('the first directory preserves all 168 ordinary entries and adds two exact high cities without full-town builds',()=>{
 assert.equal(E.calls.full,0);assert.equal(E.calls.context,0);
 assert.equal(E.calls.query,80,'the 78 existing candidates and two compact high cities each receive an exact placement query');
 const ordinary=inventory.filter(site=>!site.highCitadel),high=inventory.filter(site=>site.highCitadel);
 assert.equal(inventory.length,170);assert.equal(ordinary.length,168);assert.equal(high.length,2);
 assert.deepEqual(high.map(site=>site.highCitadel.kind).sort(),['dragon','holy']);
 assert(high.every(site=>site.buildingId&&site.recipe.buildingId===site.buildingId&&!site.recipe.sacred));
 assert.equal(inventory.filter(site=>site.recipe.sacred).length,69);
 const digest=createHash('sha256').update(JSON.stringify(metadata(ordinary))).digest('hex');
 assert.equal(digest,'477aa02d80cb23a15195810a2158971cb0a63b50475def7954a6698d7e06146d');
 for(const id of [414,365,458,150,291,366,320,354,111])
  assert(!inventory.some(site=>site.provinceId===id&&site.recipe.sacred),'unplaceable wonder in province '+id);
 assert.deepEqual(fingerprints(w,s),before);
});

test('cloning or searching the index does not invoke the local-building getter',()=>{
 const calls={...E.calls};
 assert.equal(JSON.parse(JSON.stringify(inventory)).length,170);
 assert.equal(structuredClone(inventory).length,170);
 const search=inventory.map(site=>({...site,type:'site'}));
 assert.equal(search.length,170);assert.deepEqual(E.calls,calls);
 const site=inventory.find(site=>site.recipe.sacred);
 assert.equal(Object.getOwnPropertyDescriptor(site,'building').enumerable,false);
});

test('full layouts, placement coordinates and explicit building access retain their old results',()=>{
 const expected=[
  [127,'196d91e4',14.739393939393938,0,18,3.5599046421051024,4944],
  [349,'67738405',0,23.83900556026821,38,3.083621091842651,6496],
  [414,'f08bbdb7'],
  [507,'e8b01c2b',0,24.790518659871566,38,3.231337852478027,6483]
 ];
 for(const [id,fingerprint,x,z,width,y,socket] of expected){
  const p=s.provinces[id],city=E.generateCity(w,s,id),b=city.buildings.find(b=>b.sacred);
  assert.equal(city.fingerprint,fingerprint,p.name+' full layout changed');
  const site=E.SacredCityKit.site(w,s,p);
  if(!b){assert.equal(site,null);continue;}
  assert.deepEqual([b.x,b.z,b.w,b.y,b.streetSocket],[x,z,width,y,socket]);
  assert.deepEqual(site.building,b,'explicit site access must retain final angle, frontage and LOD');
  const count=E.calls.full;assert.strictEqual(site.building,site.building);assert.equal(E.calls.full,count);
  const query=E.generateCityLandmark(w,s,id),qb=query.buildings[0];
  assert.deepEqual([qb.id,qb.x,qb.z,qb.w,qb.d],[b.id,b.x,b.z,b.w,b.d]);
  assert.deepEqual(site.recipe,E.TownCityBinding.resolve(w,s,p,city,'temple'));
 }
 assert.deepEqual(fingerprints(w,s),before);
});

test('a reachable precinct is excluded when its final dry doorway cannot be seated',()=>{
 const id=127;
 assert(E.generateCityLandmark(w,s,id).buildings.length,'fixture needs a normally accessible sanctuary');
 E.withoutDryConnections(()=>{
  assert.equal(E.generateCityLandmark(w,s,id).buildings.length,0,'reachability alone must not admit a sanctuary rejected by the final connector');
  const city=E.generateCity(w,s,id);
  assert(!city.buildings.some(b=>b.sacred));
 });
});

test('a different world and saved landmark designs share exact placement and recipes',async()=>{
 const w2=await E.generateWorld({...defaults,seed:'Landmark-index-2'});
 const s2=E.createCivilization(w2,{realms:18,historySeed:'First-dawn'}),seen=new Set();
 const towns=s2.provinces.filter(p=>p.city&&p.urbanPop>=650).sort((a,b)=>b.urbanPop-a.urbanPop).filter(p=>{
  const recipe=E.TownCatalog.resolve(w2,s2,p);if(!E.wonderFor(recipe.style,p.detailSupport??p.urbanSupport,p)||seen.has(recipe.style))return false;
  seen.add(recipe.style);return true;
 }).slice(0,6);
 assert.equal(towns.length,6);
 for(const p of towns){
  const city=E.generateCity(w2,s2,p.id),b=city.buildings.find(b=>b.sacred),query=E.generateCityLandmark(w2,s2,p.id),site=E.SacredCityKit.site(w2,s2,p);
  assert.equal(!!query.buildings.length,!!b,p.name+' placement existence differs');
  assert.equal(!!site,!!b,p.name+' directory presence differs');
  if(!b)continue;
  assert.deepEqual([query.buildings[0].x,query.buildings[0].z,query.buildings[0].w,query.buildings[0].d],[b.x,b.z,b.w,b.d]);
  assert.deepEqual(site.recipe,E.TownCityBinding.resolve(w2,s2,p,city,'temple'));
  s2.landmarkRecipes??={};s2.landmarkRecipes[site.id]={...site.recipe,crown:'spires',roofLanguage:'gable'};
  assert.deepEqual(E.SacredCityKit.site(w2,s2,p).recipe,E.TownCityBinding.resolve(w2,s2,p,city,'temple'));
 }
});
