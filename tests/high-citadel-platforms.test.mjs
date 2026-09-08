import test, {describe} from 'node:test';
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
// Keep the published version 1/2 fixtures intact. The version 3 rift has two
// legal platforms and exercises the same accounting and complete layout checks.
for (const scenario of [
 {landformVersion:1,ids:[454,455],sites:[[239,117,'dragon',719],[242,115,'holy',759]],ordinaryCity:419,physical:'cc113c81',settlement:'7ff2f210',political:'90fd7fea'},
 {landformVersion:2,ids:[455,456],sites:[[239,117,'dragon',761],[242,115,'holy',759]],ordinaryCity:421,physical:'2377e4fa',settlement:'254caa7c',political:'24a862f0'},
 {landformVersion:3,params:{seed:'Meridian-21',form:'rift'},ids:[199,407],sites:[[237,68,'dragon',1100],[271,116,'holy',849]],ordinaryCity:200,physical:'648c6ee8',settlement:'fa190ebe',political:'6f14f188'}
]) describe(`high platforms on landform version ${scenario.landformVersion}`,()=>{
let w,sim,ordinary,ordinaryWorld,before;
test.before(async()=>{
 w=await E.generateWorld({...fantasyDefaults,landformVersion:scenario.landformVersion,...scenario.params});before=E.physicalFingerprint(w);ordinaryWorld=structuredClone(w);
 ordinary=E.createCivilization(ordinaryWorld,{...opts,highCitadelsVersion:0});sim=E.createCivilization(w,opts);
});
const high=()=>sim.provinces.filter(p=>p.highCitadel);
test('default platform rules support one dragon and one holy city within their original countries',()=>{
 assert.equal(sim.options.highCitadelsVersion,2);assert.deepEqual(high().map(p=>p.id),scenario.ids);
 assert.equal(before,scenario.physical);assert.equal(E.settlementFingerprint(sim),scenario.settlement);assert.equal(E.politicalFingerprint(sim),scenario.political);
 assert.deepEqual(high().map(p=>[p.x,p.y,p.highCitadel.kind,p.urbanPop]),scenario.sites);
 assert(Math.hypot(high()[0].x-high()[1].x,high()[0].y-high()[1].y)>=2);
 for(const p of high()){
  const old=ordinary.provinces[p.id],h=p.highCitadel;
  assert.equal(h.version,2);assert.equal(h.originalCell,old.i);assert.notEqual(p.i,old.i);assert.equal(w.provinceId[p.i],p.id);assert(p.cells.includes(p.i));assert.deepEqual(p.cells,old.cells);
  assert(!old.settled&&old.urbanPop===0&&old.urbanSupport===0);assert.equal(p.owner,old.owner);assert(sim.realms[p.owner].alive);
  assert.equal(h.elevation,w.height[p.i]);assert(h.elevation>=3500);assert(E.HighCitadels.site(w,p));assert(E.HighCitadelPlan.viable(w,sim,p,h.kind));assert(w.human.waterCapacity[p.i]>=h.support);
  assert(p.urbanPop>=650&&p.urbanPop<=1100&&!p.city);assert.equal(h.sourceCell,p.i);assert.equal(p.highCitadel.originalName,old.name);
  const culture=sim.realms[p.owner].namingCulture;
  assert.equal(p.nameOrigin.baseId,culture.baseId);assert.equal(p.nameOrigin.realmId,p.owner);
  assert.equal(p.nameOrigin.generatedName,p.name);assert(p.name.includes(culture.root),'the founded high city retains its country naming family');
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
 // Compare a real nearby ordinary city in each geography. On version 1 the
 // former spacing rule shrank Swiftmount from 10.409 to 9.164; on version 2
 // Screefield is the nearest ordinary town to these same mountain platforms;
 // version 3 uses the nearest ordinary town in the rift fixture, Flinthollow.
 assert(ordinary.provinces[scenario.ordinaryCity].settled);
 const a=E.generateCity(w,sim,scenario.ordinaryCity),b=E.generateCity(ordinaryWorld,ordinary,scenario.ordinaryCity);assert.equal(hash(a),hash(b),'the complete nearest ordinary-city layout changed');
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
  const s=E.createCivilization(w,{...opts,highCitadelsVersion:version});
  if(scenario.landformVersion<=2||version===0)assert.equal(s.provinces.some(p=>p.highCitadel),false);
  else {const legacy=s.provinces.filter(p=>p.highCitadel);assert.deepEqual(legacy.map(p=>p.id),[199]);assert(legacy.every(p=>p.highCitadel.version===1));}
  const restored=JSON.parse(JSON.stringify(s));
  assert.doesNotThrow(()=>UI.validateSimulation(restored,w));const next=UI.reroll(w,restored);assert.equal(next.options.highCitadelsVersion,version);assert.equal(next.settlementSignature,s.settlementSignature);assert.deepEqual(next.initialSettlements,s.initialSettlements);
 }
 const old=JSON.parse(JSON.stringify(ordinary));delete old.options.highCitadelsVersion;const restored=UI.reroll(w,old);assert.equal(restored.options.highCitadelsVersion,0);assert.equal(restored.settlementSignature,ordinary.settlementSignature);
});
test('version 2 JSON metadata validates and political replay preserves platform locations',()=>{
 const restored=JSON.parse(JSON.stringify(sim));assert.doesNotThrow(()=>UI.validateSimulation(restored,w));assert.deepEqual(restored,sim,'loading preserves all names and historical metadata');const next=UI.reroll(w,restored);assert.equal(next.settlementSignature,sim.settlementSignature);
 const platform=p=>{const{originalName,...geometryAndAccounting}=p.highCitadel;return geometryAndAccounting;};
 const replayedHigh=next.provinces.filter(p=>p.highCitadel);
 assert.deepEqual(replayedHigh.map(platform),high().map(platform));
 // A political reroll starts another founding history, whose districts follow
 // its new countries. Preserve every platform fact but use that history's name.
 const replayedDistricts=E.createCivilization(w,{...next.options,highCitadelsVersion:0});
 for(const p of replayedHigh)assert.equal(p.highCitadel.originalName,replayedDistricts.provinces[p.id].name);
 delete restored.options.highCitadelsVersion;assert.equal(E.HighCitadels.historyOptions(restored).highCitadelsVersion,2);assert.doesNotThrow(()=>UI.validateSimulation(restored,w));
 for(const change of[h=>{h.originalCell=-1;},h=>{h.originalCell=0;},h=>{h.sourceCell++;},h=>{h.populationCap=1101;},h=>{h.version=3;}]){const bad=structuredClone(sim);change(bad.provinces[scenario.ids[0]].highCitadel);assert.throws(()=>UI.validateSimulation(bad,w),/Invalid high citadel/);}
 const bad=structuredClone(sim);bad.provinces[scenario.ids[0]].x++;assert.throws(()=>UI.validateSimulation(bad,w),/Invalid high citadel platform/);
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

});

describe('version 3 default without a feasible high platform',()=>{
 let w,sim,ordinary,ordinaryWorld,before;
 test.before(async()=>{
  w=await E.generateWorld({...fantasyDefaults,landformVersion:3});before=E.physicalFingerprint(w);ordinaryWorld=structuredClone(w);
  ordinary=E.createCivilization(ordinaryWorld,{...opts,highCitadelsVersion:0});sim=E.createCivilization(w,opts);
 });
 test('selects platform version 2 without forcing a city or changing the physical world',()=>{
  assert.equal(sim.options.highCitadelsVersion,2);assert.equal(sim.provinces.filter(p=>p.highCitadel).length,0);
  assert.deepEqual(sim,E.createCivilization(w,{...opts,highCitadelsVersion:2}));
  assert.equal(before,'73fe302b');assert.equal(E.physicalFingerprint(w),before);
  assert.equal(E.settlementFingerprint(sim),'b18c6a8');assert.equal(E.politicalFingerprint(sim),'b007f61e');
  const copy=structuredClone(ordinary),snapshot=JSON.stringify(copy);assert.deepEqual(E.HighCitadels.foundPlatforms(copy,w),[]);assert.equal(JSON.stringify(copy),snapshot);
 });
 test('preserves every ordinary province, survey and population when no platform can be founded',()=>{
  assert.deepEqual(sim.provinces,ordinary.provinces);
  for(const key of['realms','relations','culturalOrigins','administrationGraph','routes','localCommunities','settlementBudget','initialSettlements'])assert.deepEqual(sim[key],ordinary[key],key);
  assert.deepEqual(w.provinceId,ordinaryWorld.provinceId);assert.equal(E.politicalFingerprint(sim),E.politicalFingerprint(ordinary));
  const towns=ordinary.provinces.filter(p=>p.settled);assert(towns.length>0);
  for(const p of towns)assert.deepEqual(E.citySurvey(sim,sim.provinces[p.id]),E.citySurvey(ordinary,p),p.name+' survey was altered');
  const largest=towns.reduce((a,b)=>a.urbanPop>b.urbanPop?a:b);
  assert.equal(hash(E.generateCity(w,sim,largest.id)),hash(E.generateCity(ordinaryWorld,ordinary,largest.id)),'the complete largest ordinary-city layout changed');
 });
 test('explicit saved versions 0/1/2 survive JSON validation and political replay',()=>{
  for(const version of[0,1,2]){
   const original=E.createCivilization(w,{...opts,highCitadelsVersion:version});assert.equal(original.options.highCitadelsVersion,version);
   const restored=JSON.parse(JSON.stringify(original));assert.doesNotThrow(()=>UI.validateSimulation(restored,w));
   assert.equal(E.HighCitadels.historyOptions(restored).highCitadelsVersion,version);
   const replay=UI.reroll(w,restored);assert.equal(replay.options.highCitadelsVersion,version);assert.equal(replay.settlementSignature,original.settlementSignature);assert.deepEqual(replay.initialSettlements,original.initialSettlements);
   assert.deepEqual(replay.provinces.filter(p=>p.highCitadel).map(p=>p.highCitadel),original.provinces.filter(p=>p.highCitadel).map(p=>p.highCitadel));
  }
  const versionless=JSON.parse(JSON.stringify(ordinary));delete versionless.options.highCitadelsVersion;
  assert.doesNotThrow(()=>UI.validateSimulation(versionless,w));assert.equal(E.HighCitadels.historyOptions(versionless).highCitadelsVersion,0);
  const replay=UI.reroll(w,versionless);assert.equal(replay.options.highCitadelsVersion,0);assert.equal(replay.settlementSignature,ordinary.settlementSignature);
 });
});
