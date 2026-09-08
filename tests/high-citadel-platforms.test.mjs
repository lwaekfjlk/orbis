import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {fantasyDefaults} from './engine-loader.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(read).join('\n');
const E=Function(source+';return{HighCitadels,HighCitadelPlan,CityEnvironment,citySurvey,generateWorld,createCivilization,generateCity,auditCity,physicalFingerprint,settlementFingerprint,politicalFingerprint,stepCivilization,auditCivilization};')();
const ui=read('src/ui/world-ui.js'),reroll=ui.slice(ui.indexOf('function rerollPolitics()'),ui.indexOf('function saveBlob(')),validation=ui.slice(ui.indexOf('function validateSimulation('),ui.indexOf('function refreshAll('));
const UI=Function(source+`
let world,sim,busy=false,selectedRealm,selectedCell,diplomacyTarget;const window={};function pause(){}function refreshAll(){}function setLayer(){}function toast(){}
${reroll}\n${validation}
return{validateSimulation,reroll(w,s){world=w;sim=s;rerollPolitics();return sim;}};`)();
const opts={realms:18,historySeed:'First-dawn'},hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
let w,sim,ordinary,ordinaryWorld,before;
test.before(async()=>{
 w=await E.generateWorld(fantasyDefaults);before=E.physicalFingerprint(w);ordinaryWorld=structuredClone(w);
 ordinary=E.createCivilization(ordinaryWorld,{...opts,highCitadelsVersion:0});sim=E.createCivilization(w,opts);
});
const high=()=>sim.provinces.filter(p=>p.highCitadel);
test('new default mountain platforms support one dragon and one holy city within their original countries',()=>{
 assert.equal(sim.options.highCitadelsVersion,2);assert.deepEqual(high().map(p=>p.id),[454,455]);
 assert.deepEqual(high().map(p=>[p.x,p.y,p.highCitadel.kind,p.urbanPop]),[[239,117,'dragon',719],[242,115,'holy',759]]);
 assert(Math.hypot(high()[0].x-high()[1].x,high()[0].y-high()[1].y)>=2);
 for(const p of high()){
  const old=ordinary.provinces[p.id],h=p.highCitadel;
  assert.equal(h.version,2);assert.equal(h.originalCell,old.i);assert.notEqual(p.i,old.i);assert.equal(w.provinceId[p.i],p.id);assert(p.cells.includes(p.i));assert.deepEqual(p.cells,old.cells);
  assert(!old.settled&&old.urbanPop===0&&old.urbanSupport===0);assert.equal(p.owner,old.owner);assert(sim.realms[p.owner].alive);
  assert.equal(h.elevation,w.height[p.i]);assert(h.elevation>=3500);assert(E.HighCitadels.site(w,p));assert(E.HighCitadelPlan.viable(w,sim,p,h.kind));assert(w.human.waterCapacity[p.i]>=h.support);
  assert(p.urbanPop>=650&&p.urbanPop<=1100&&!p.city);assert.equal(h.sourceCell,p.i);assert.equal(p.highCitadel.originalName,old.name);
 }
});
test('rural population and existing capacity fund the platforms exactly once',()=>{
 let support=0;
 for(const p of high()){
  const old=ordinary.provinces[p.id],h=p.highCitadel;assert.equal(p.pop,old.pop);close(p.ruralPop+p.urbanPop,old.ruralPop);
  for(const key of['capacity','ruralCapacity','foodCapacity','waterCapacity'])assert.equal(p[key],old[key]);
  close(h.ruralSupportBefore-h.ruralSupportAfter,h.support);assert(h.ruralSupportAfter>=p.ruralPop);assert(h.support<=p.ruralCapacity*.2);
  assert.equal(p.urbanSupport,h.support);assert.equal(p.detailSupport,h.support);support+=h.support;
 }
 for(const key of['available','allocated','retained'])close(sim.settlementBudget[key]-ordinary.settlementBudget[key],support);
 close(sim.settlementBudget.reservedFromRural,support);const copy=structuredClone(sim),snapshot=JSON.stringify(copy);assert.deepEqual(E.HighCitadels.foundPlatforms(copy,w),[]);assert.equal(JSON.stringify(copy),snapshot);
});
test('country ownership, cultural origins, administration and every ordinary town remain unchanged',()=>{
 const selected=new Set(high().map(p=>p.id));
 for(const p of sim.provinces){const old=ordinary.provinces[p.id];assert.equal(p.pop,old.pop);assert.equal(p.owner,old.owner);assert.deepEqual(p.people,old.people);assert.deepEqual(p.faith,old.faith);
  if(!selected.has(p.id))assert.deepEqual(p,old);
  if(old.settled)assert.deepEqual(E.citySurvey(sim,p),E.citySurvey(ordinary,old),old.name+' survey was altered');
 }
 for(const key of['realms','relations','culturalOrigins','administrationGraph','routes','localCommunities'])assert.deepEqual(sim[key],ordinary[key],key);
 assert.equal(E.politicalFingerprint(sim),E.politicalFingerprint(ordinary));assert.deepEqual(w.provinceId,ordinaryWorld.provinceId);assert.equal(E.physicalFingerprint(w),before);
 // Swiftmount is the closest large city: the former generic spacing rule would
 // shrink its span from 10.409 to 9.164 when these tiny courts were introduced.
 const a=E.generateCity(w,sim,419),b=E.generateCity(ordinaryWorld,ordinary,419);assert.equal(hash(a),hash(b),'the complete nearest ordinary-city layout changed');
});
test('initial records and the exact high-city layouts include both newly founded courts',()=>{
 assert.equal(sim.initialSettlements.length,ordinary.initialSettlements.length+2);assert.equal(sim.settlementSignature,E.settlementFingerprint(sim));assert.equal(sim.foundingPolitics.settlementHash,sim.settlementSignature);
 assert.deepEqual(sim.history,ordinary.history);assert.equal(sim.initialRealmCount,ordinary.initialRealmCount);
 for(const p of high()){
  const record=sim.initialSettlements.find(r=>r.province===p.id);assert.equal(record.cell,p.i);assert.equal(record.urbanPop,p.urbanPop);
  assert(sim.events.some(e=>e.details?.province===p.id&&e.details?.originalCell===p.highCitadel.originalCell));
  const city=E.generateCity(w,sim,p.id);assert(city.buildings.length>=10&&city.buildings.length<=18);assert(city.buildings.some(b=>['keep','sanctuary'].includes(b.highRole)));assert.equal(city.source.parentWorldCell,p.i);
  const audit=E.auditCity(city);for(const key of['overlaps','wetBuildings','iceBuildings','roadBuildings','nonfinite','seaRoads'])assert.equal(audit[key],0,key);
 }
});
test('version 0/1 saves on the new geography do not acquire version 2 cities when replayed',()=>{
 for(const version of[0,1]){
  const s=E.createCivilization(w,{...opts,highCitadelsVersion:version});assert.equal(s.provinces.some(p=>p.highCitadel),false);const restored=JSON.parse(JSON.stringify(s));
  assert.doesNotThrow(()=>UI.validateSimulation(restored,w));const next=UI.reroll(w,restored);assert.equal(next.options.highCitadelsVersion,version);assert.equal(next.settlementSignature,s.settlementSignature);assert.deepEqual(next.initialSettlements,s.initialSettlements);
 }
 const old=JSON.parse(JSON.stringify(ordinary));delete old.options.highCitadelsVersion;const restored=UI.reroll(w,old);assert.equal(restored.options.highCitadelsVersion,0);assert.equal(restored.settlementSignature,ordinary.settlementSignature);
});
test('version 2 JSON metadata validates and political replay preserves platform locations',()=>{
 const restored=JSON.parse(JSON.stringify(sim));assert.doesNotThrow(()=>UI.validateSimulation(restored,w));const next=UI.reroll(w,restored);assert.equal(next.settlementSignature,sim.settlementSignature);
 assert.deepEqual(next.provinces.filter(p=>p.highCitadel).map(p=>p.highCitadel),high().map(p=>p.highCitadel));
 delete restored.options.highCitadelsVersion;assert.equal(E.HighCitadels.historyOptions(restored).highCitadelsVersion,2);assert.doesNotThrow(()=>UI.validateSimulation(restored,w));
 for(const change of[h=>{h.originalCell=-1;},h=>{h.originalCell=0;},h=>{h.sourceCell++;},h=>{h.populationCap=1101;},h=>{h.version=3;}]){const bad=structuredClone(sim);change(bad.provinces[454].highCitadel);assert.throws(()=>UI.validateSimulation(bad,w),/Invalid high citadel/);}
 const bad=structuredClone(sim);bad.provinces[454].x++;assert.throws(()=>UI.validateSimulation(bad,w),/Invalid high citadel platform/);
});
test('unowned districts, missing water, low mountains and failed preflight never force a platform',()=>{
 for(const change of[
  (w,s)=>{for(const p of s.provinces)p.owner=-1;},(w)=>w.human.waterCapacity.fill(0),(w)=>w.height.fill(3000)
 ]){const world=structuredClone(ordinaryWorld),s=structuredClone(ordinary);change(world,s);const before=JSON.stringify(s);assert.deepEqual(E.HighCitadels.foundPlatforms(s,world),[]);assert.equal(JSON.stringify(s),before);}
 const s=structuredClone(ordinary),before=JSON.stringify(s),viable=E.HighCitadelPlan.viable;let called=0;E.HighCitadelPlan.viable=()=>{called++;return false;};
 try{assert.deepEqual(E.HighCitadels.foundPlatforms(s,w),[]);assert(called>0);assert.equal(JSON.stringify(s),before);}finally{E.HighCitadelPlan.viable=viable;}
});
test('annual updates keep each platform small without changing province accounting',()=>{
 const s=structuredClone(sim);for(let year=0;year<8;year++){E.stepCivilization(s,w);for(const p of s.provinces.filter(p=>p.highCitadel)){assert(p.urbanPop<=1100&&p.urbanPop<=p.highCitadel.populationCap);assert.equal(p.city,false);close(p.urbanPop+p.ruralPop,p.pop);assert.equal(w.provinceId[p.i],p.id);}}
 const audit=E.auditCivilization(s,w);assert.equal(audit.badPop,0);assert.equal(audit.badShares,0);assert.equal(audit.invalidOwners,0);assert.equal(E.physicalFingerprint(w),before);
});
