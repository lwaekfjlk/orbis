import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine, root, defaults} from './engine-loader.mjs';
const E=loadEngine();
let w,s,settled,sagas,before;const report={version:1,checks:{}};
const KINDS=['conqueror','siege','rift','legend','mountain','winter','flood','thirst','delve','sea','hunger'];
test.before(async()=>{
 w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 before={physical:E.physicalFingerprint(w),settlement:E.settlementFingerprint(s),politics:E.politicalFingerprint(s),sim:JSON.stringify(s)};
 settled=s.provinces.filter(p=>p.settled);
 sagas=settled.map(p=>E.Saga.of(w,s,p));
});

test('every settlement has a complete telling, and every line shows what it came from',()=>{
 assert(settled.length>40);
 for(const g of sagas){
  assert.equal(g.chapters.length,5,g.name+' is missing a chapter');
  for(const c of g.chapters){
   assert(c.heading&&c.text.length>60,`${g.name}/${c.heading} has no prose`);
   assert(c.basis&&c.basis.length>10,`${g.name}/${c.heading} does not say what it was derived from`);
   // Nothing may reach the reader as a raw template hole or an undefined lookup.
   assert(!/undefined|NaN|\[object|\$\{/.test(c.text),`${g.name}/${c.heading}: ${c.text}`);
   assert(!/undefined|NaN/.test(c.basis),`${g.name}/${c.heading} basis: ${c.basis}`);
  }
  assert(KINDS.includes(g.adversary.kind),g.name+' has adversary kind '+g.adversary.kind);
  assert(g.hero.name&&g.title&&E.PEOPLES[g.hero.people]);
 }
 // A world of a hundred towns must not be a hundred copies of one story.
 assert.equal(new Set(sagas.map(g=>g.title)).size,sagas.length,'every telling has its own title');
 assert(new Set(sagas.map(g=>g.hero.name)).size>sagas.length*.7,'heroes are largely distinct');
 assert(new Set(sagas.map(g=>g.adversary.kind)).size>=5,'a world produces several kinds of trial');
 report.checks.coverage={settlements:sagas.length,titles:new Set(sagas.map(g=>g.title)).size,
  heroes:new Set(sagas.map(g=>g.hero.name)).size,
  kinds:sagas.reduce((a,g)=>(a[g.adversary.kind]=(a[g.adversary.kind]||0)+1,a),{})};
});

test('no people is cast as the enemy, and none is cast as the hero',()=>{
 // The civilization model is explicit that no species has hard-coded intelligence, moral
 // alignment or combat superiority. A saga generator is exactly where that quietly breaks,
 // so it is pinned here rather than left to the prose.
 const names=E.PEOPLES.map(p=>p.name);
 for(const g of sagas){
  assert(!names.includes(g.adversary.name),`${g.name} names a people as its adversary`);
  assert(!names.some(n=>new RegExp(`\\b${n}\\b`,'i').test(g.adversary.styled||'')),`${g.name} styles a people as its adversary`);
  // An adversary is a state, a disaster or a place — never a race.
  if(['conqueror','siege'].includes(g.adversary.kind))assert(g.adversary.realm,'a war adversary is a realm');
  if(g.adversary.kind==='legend')assert(g.adversary.place,'a legend adversary is a place');
 }
 // Heroes are drawn from who actually lives in each province, so across a world their
 // spread must track the population rather than favour anyone.
 const heroes=E.PEOPLES.map(()=>0),living=E.PEOPLES.map(()=>0);
 for(const g of sagas)heroes[g.hero.people]++;
 for(const p of settled)p.people.forEach((v,k)=>living[k]+=v);
 const livingShare=living.map(v=>v/settled.length),heroShare=heroes.map(v=>v/sagas.length);
 for(let k=0;k<E.PEOPLES.length;k++)
  assert(Math.abs(heroShare[k]-livingShare[k])<.09,
   `${E.PEOPLES[k].name}: ${(heroShare[k]*100).toFixed(0)}% of heroes but ${(livingShare[k]*100).toFixed(0)}% of the population`);
 assert(heroes.every(n=>n>0),'every people of this world produces a hero somewhere');
 report.checks.parity={heroShare:heroShare.map(v=>+v.toFixed(3)),populationShare:livingShare.map(v=>+v.toFixed(3))};
});

test('a trial is the world\'s own, not a stock plot',()=>{
 // Each derived adversary has to be true of the place that tells it.
 for(const g of sagas){
  const p=s.provinces[g.province],a=g.adversary;
  if(a.kind==='legend'){
   const f=(w.legends||[]).find(f=>f.name===a.name);
   assert(f,a.name+' is not a legendary place in this world');
   assert(Math.hypot(f.x-p.x,f.y-p.y)<27,a.name+' is not actually near '+p.name);
  }
  if(a.kind==='mountain')assert((w.volcanoes||[]).some(v=>v.active&&Math.hypot(v.x-p.x,v.y-p.y)<14),p.name+' has no live volcano near it');
  if(a.kind==='rift')assert(p.mana>.60||(w.rift?.[p.i]||0)>.55,p.name+' is not on arcane ground');
  if(a.kind==='sea')assert(p.harbor>.35,p.name+' has no exposed coast');
  if(a.kind==='thirst')assert(p.fresh<.45,p.name+' is not short of water');
  if(a.kind==='winter')assert((w.ice?.[p.i]||0)>40||p.altitude>1500,p.name+' is not a cold site');
 }
 // A world without the landform tells no story about it — the legends' own rule.
 if(!(w.volcanoes||[]).some(v=>v.active))assert(!sagas.some(g=>g.adversary.kind==='mountain'));
 report.checks.derivation={legendsInWorld:(w.legends||[]).length,checked:sagas.length};
});

test('history rewrites the telling, and ties the towns that shared it together',()=>{
 const quiet=JSON.parse(JSON.stringify(sagas.map(g=>g.adversary.kind)));
 for(let k=0;k<120;k++){E.stepCivilization(s,w);E.stepCityProjects(s,w);}
 const after=s.provinces.filter(p=>p.settled).map(p=>E.Saga.of(w,s,p));
 const wars=after.filter(g=>['conqueror','siege'].includes(g.adversary.kind));
 assert(wars.length>0,'after 120 years some town remembers a war');
 assert.notDeepEqual(after.map(g=>g.adversary.kind).slice(0,quiet.length),quiet,'the chronicle changes what towns tell');
 for(const g of wars){
  const p=s.provinces[g.province];
  const e=s.events.find(x=>x.details?.province===p.id&&(x.type==='conquest'||x.type==='battle')&&x.year===g.adversary.year);
  assert(e,`${p.name} remembers a ${g.adversary.kind} in ${g.adversary.year} that the chronicle does not record`);
  assert(g.chapters[2].text.includes(String(g.adversary.year)),'the trial names the year it happened');
 }
 // The link is a real settled town and quotes the chronicle's own sentence.
 const linked=after.filter(g=>g.links.length);
 assert(linked.length>0,'shared events tie towns together');
 for(const g of linked)for(const l of g.links){
  const q=s.provinces[l.province];
  assert(q?.settled&&q.id!==g.province,'a link points at another real settlement');
  assert(s.events.some(x=>x.text===l.record),'a link quotes a real chronicle entry');
 }
 report.checks.history={year:s.year,warTellings:wars.length,linkedTowns:linked.length,
  kinds:after.reduce((a,g)=>(a[g.adversary.kind]=(a[g.adversary.kind]||0)+1,a),{})};

 // A conqueror belongs to the realm, not to the town that fell. Seeded from the defender
 // it gave one realm a different warlord in every town it took, and dropped the same name
 // on a hero two districts away — which reads as a bug, not as a history.
 const byRealm=new Map();
 for(const g of wars){
  const a=g.adversary,seen=byRealm.get(a.realm.id)||{names:new Set(),towns:[]};
  seen.names.add(a.lord.name);seen.towns.push(g.name);byRealm.set(a.realm.id,seen);
 }
 for(const [id,v] of byRealm)
  assert.equal(v.names.size,1,`${s.realms[id].name} fields ${v.names.size} different warlords across ${v.towns.length} towns`);
 const repeated=[...byRealm.values()].filter(v=>v.towns.length>1);
 assert(repeated.length>0,'some realm took more than one town, so a name recurs across the map');
 const heroNames=new Set(after.map(g=>g.hero.name)),lordNames=new Set([...byRealm.values()].flatMap(v=>[...v.names]));
 const collisions=[...lordNames].filter(n=>heroNames.has(n)).length;
 assert(collisions<=2,`${collisions} names are both a hero and a warlord; the name space is too small`);
 report.checks.names={realmsWithWarlords:byRealm.size,recurringAcrossTowns:repeated.length,heroWarlordCollisions:collisions};
});

test('a different world tells different stories, and the same world tells the same one twice',()=>{
 const p=settled[0];
 assert.deepEqual(E.Saga.of(w,s,p),E.Saga.of(w,s,p),'a telling is stable');
 assert.equal(E.Saga.of(w,s,s.provinces.find(q=>!q.settled)),null,'an empty district has nothing to tell');
 report.checks.determinism=true;
});

test('composing a saga reads the world and changes nothing in it',()=>{
 // Rebuild cleanly: the history test above advanced the shared sim on purpose.
 return (async()=>{
  const w2=await E.generateWorld(defaults),s2=E.createCivilization(w2,{realms:18,historySeed:'First-dawn'});
  const mark={p:E.physicalFingerprint(w2),s:E.settlementFingerprint(s2),c:E.politicalFingerprint(s2),json:JSON.stringify(s2)};
  const told=s2.provinces.filter(p=>p.settled).map(p=>E.Saga.of(w2,s2,p));
  assert(told.length>40);
  assert.equal(E.physicalFingerprint(w2),mark.p);
  assert.equal(E.settlementFingerprint(s2),mark.s);
  assert.equal(E.politicalFingerprint(s2),mark.c);
  assert.equal(JSON.stringify(s2),mark.json,'a saga is derived, and adds nothing to the save');
  assert.equal(s2.sagas,undefined,'sagas are not simulation state');
  // Another seed is another set of stories, not the same names moved around.
  const w3=await E.generateWorld({...defaults,seed:'Saga-comparison-3'});
  const s3=E.createCivilization(w3,{realms:18,historySeed:'First-dawn'});
  const other=s3.provinces.filter(p=>p.settled).map(p=>E.Saga.of(w3,s3,p));
  const shared=new Set(told.map(g=>g.title));
  const overlap=other.filter(g=>shared.has(g.title)).length;
  assert(overlap<other.length*.15,`${overlap} of ${other.length} titles repeat across worlds`);
  report.checks.acrossWorlds={worldA:told.length,worldB:other.length,repeatedTitles:overlap,
   kindsB:other.reduce((a,g)=>(a[g.adversary.kind]=(a[g.adversary.kind]||0)+1,a),{})};
 })();
});

test.after(()=>writeFileSync(resolve(root,'docs/SAGA_RESULTS.json'),JSON.stringify(report,null,2)));
