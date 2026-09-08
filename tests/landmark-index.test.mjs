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
let w,s,baseline,inventory,before;
const fingerprints=(w,s)=>[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)];
// Public directory baseline from complete eager town generation under the current
// sovereignty rules. The optimized query must preserve that independent result.
// Final local building data remains available explicitly, outside the search index.
const metadata=entries=>entries.map(({id,name,recipe,provinceId,i,x,y,priority,kind})=>({id,name,recipe,provinceId,i,x,y,priority,kind}));

test.before(async()=>{
 w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 baseline=E.createCivilization(w,{realms:18,historySeed:'First-dawn',highCitadelsVersion:0});
 // Candidate founding performs its own placement preflight. Directory counts
 // begin after both simulations are initialized on exactly the same geography.
 Object.assign(E.calls,{full:0,query:0,context:0});
 before=fingerprints(w,s);inventory=E.LandmarkBinding.inventory(w,s);
});

test('the directory preserves the 152 current founding entries and adds two exact high cities',()=>{
 assert.equal(E.calls.full,0);assert.equal(E.calls.context,0);
 assert.equal(E.calls.query,80,'78 ordinary candidates and two compact high cities receive exact placement queries');
 const ordinary=inventory.filter(site=>!site.highCitadel),high=inventory.filter(site=>site.highCitadel);
 assert.equal(inventory.length,154);assert.equal(ordinary.length,152);assert.equal(high.length,2);
 assert.deepEqual(high.map(site=>site.highCitadel.kind).sort(),['dragon','holy']);
 assert(high.every(site=>site.buildingId&&site.recipe.buildingId===site.buildingId&&!site.recipe.sacred));
 assert.equal(inventory.filter(site=>site.recipe.sacred).length,69);
 const original=E.LandmarkBinding.inventory(w,baseline);
 assert.equal(original.length,152);assert(original.every(site=>!site.highCitadel));
 const digest=createHash('sha256').update(JSON.stringify(metadata(original))).digest('hex');
 assert.equal(digest,'21acd52dc3052aca20b261d8adbfc3beb613e5ceffe3fde15fbafd72d543ca23');
 assert.deepEqual(metadata(ordinary),metadata(original),'founding the high cities must preserve every ordinary directory entry from the same world');
 for(const id of [414,365,458,150,291,366,320,354,111])
  assert(!inventory.some(site=>site.provinceId===id&&site.recipe.sacred),'unplaceable wonder in province '+id);
 assert.deepEqual(fingerprints(w,s),before);
});

test('cloning or searching the index does not invoke the local-building getter',()=>{
 const calls={...E.calls};
 assert.equal(JSON.parse(JSON.stringify(inventory)).length,154);
 assert.equal(structuredClone(inventory).length,154);
 const search=inventory.map(site=>({...site,type:'site'}));
 assert.equal(search.length,154);assert.deepEqual(E.calls,calls);
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

test('a same-world capital change invalidates synchronous and preloaded site existence',async()=>{
 const worlds=[];
 class Worker {
  constructor(){worlds.push(this);}
  postMessage(request){this.request=request;}
  terminate(){}
 }
 const browser={Worker,TELLURIC_TOWN_WORKER:'controlled trusted worker'};
 const fresh=()=>Function('window',source+`
  const query=generateCityLandmark;let queries=0;
  generateCityLandmark=(...args)=>{queries++;return query(...args)};
  return {SacredCityKit,citySurvey,TownCatalog,wonderFor,query,get queries(){return queries}};
 `)(browser);
 const probe=fresh();let states;
 // Use actual owned towns and the shared survey, so both capital assignments
 // are valid and the test does not depend on a particular seed's government IDs.
 for(const p of s.provinces.filter(p=>p.city&&p.owner>=0)){
  const q=s.provinces.find(q=>q.city&&q.owner===p.owner&&q.id!==p.id);
  if(!q||!probe.wonderFor(probe.TownCatalog.resolve(w,s,p).style,p.detailSupport??p.urbanSupport,p))continue;
  const old=structuredClone(s),next=structuredClone(s);
  old.realms[p.owner].capital=q.id;next.realms[p.owner].capital=p.id;
  if(probe.citySurvey(old,p).terrainSpan===probe.citySurvey(next,p).terrainSpan)continue;
  // Limit the indexing queue, keeping all settled neighbours and populations.
  for(const state of[old,next])for(const town of state.provinces)town.city=town.id===p.id;
  states={old,next,id:p.id};break;
 }
 assert(states,'fixture requires a wonder town whose capital allowance changes its survey');
 const {old,next,id}=states,p=old.provinces[id],q=next.provinces[id];
 const e=fresh(),kit=e.SacredCityKit;
 kit.site(w,old,p);
 const calls=e.queries;
 const expected=e.query(w,next,id);
 assert.equal(!!kit.site(w,next,q),!!expected.buildings.length);
 assert.equal(e.queries,calls+1,'site must recompute the new capital footprint');
 kit.site(w,next,q);assert.equal(e.queries,calls+1,'the unchanged footprint still reuses its entry');

 const other=fresh(),oldJob=other.SacredCityKit.preload(w,old),first=worlds.at(-1);
 const reply=(worker,payload)=>worker.onmessage({data:{...worker.request,payload}});
 reply(first,null);assert.equal((await oldJob.promise).status,'complete');
 const newJob=other.SacredCityKit.preload(w,next),second=worlds.at(-1);
 assert.notStrictEqual(second,first,'a cached negative result must not suppress the new survey query');
 assert.notEqual(second.request.key,first.request.key);
 reply(second,expected.buildings.length?expected:null);
 assert.deepEqual(await newJob.promise,{status:'complete',completed:1,total:1});
 assert.equal(!!other.SacredCityKit.site(w,next,q),!!expected.buildings.length);
 assert.equal(other.queries,0,'the newly verified worker entry must serve the index');
});
