import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine, root, defaults} from './engine-loader.mjs';
const E=loadEngine();
let w,s,settled,sagas;const report={version:1,checks:{}};
test.before(async()=>{
 w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 settled=s.provinces.filter(p=>p.settled);sagas=settled.map(p=>E.Saga.of(w,s,p));
});

test('every people has a face, and it is well-formed drawable markup',()=>{
 assert.equal(E.Portrait.FACE.length,E.PEOPLES.length,'one face per modelled people, no more');
 for(let k=0;k<E.PEOPLES.length;k++){
  const svg=E.Portrait.svg(k,k*13+7);
  assert(svg.startsWith('<svg')&&svg.endsWith('</svg>'));
  assert(/viewBox="0 0 100 100"/.test(svg));
  // A NaN in a path coordinate silently drops the whole shape in a browser.
  assert(!/NaN|undefined|Infinity/.test(svg),E.PEOPLES[k].name+' portrait has a bad coordinate');
  // Tags balance: every element opened is self-closed, since this is injected as innerHTML.
  const opens=(svg.match(/<(path|ellipse|circle|text|g)\b/g)||[]).length;
  const closes=(svg.match(/\/>/g)||[]).length;
  assert.equal(opens,closes,E.PEOPLES[k].name+' portrait leaves a tag open');
  assert(svg.includes(`aria-label="${E.PEOPLES[k].name} narrator"`),'a portrait is labelled for a screen reader');
  assert(svg.length>800&&svg.length<6000,E.PEOPLES[k].name+' portrait is '+svg.length+' bytes');
 }
 report.checks.markup={peoples:E.PEOPLES.length,bytes:E.PEOPLES.map((_,k)=>E.Portrait.svg(k,0).length)};
});

test('the seven faces are actually different, and each shows what its people is',()=>{
 const svgs=E.PEOPLES.map((_,k)=>E.Portrait.svg(k,5));
 assert.equal(new Set(svgs).size,svgs.length,'two peoples render identically');
 const F=E.Portrait.FACE;
 // The features the request named: a dragon, a human, an elf, each recognisable.
 const drake=F[6],elf=F[1],human=F[0],dwarf=F[2];
 assert.equal(drake.crown,'ridge','the Drakekin carry horns and a crest');
 assert(drake.snout&&drake.snout[1]>=25,'the Drakekin have a long snout, not a bump');
 assert(/ry="4.4"/.test(svgs[6]),'the Drakekin have slit pupils');
 assert.equal(elf.ear,'long','the Sylvans have long ears');
 assert.equal(elf.crown,'circlet');
 assert.equal(human.ear,'round');
 assert(!human.snout&&!human.crown,'the Humans are the plain case');
 assert.equal(dwarf.hair,'beard');
 assert(dwarf.head[0]>human.head[0],'the Stonekin are broader in the face');
 // Every face is built from the same fields, so none of them is a special case with
 // extra business bolted on.
 const keys=Object.keys(F[0]).sort().join(',');
 for(const f of F)assert.equal(Object.keys(f).sort().join(','),keys,'one face carries fields the others do not');
 report.checks.distinct={renders:new Set(svgs).size,ears:new Set(F.map(f=>f.ear)).size,
  crowns:new Set(F.map(f=>f.crown)).size,snouts:F.filter(f=>f.snout).length};
});

test('no face is drawn nobler or more dangerous than another',()=>{
 // A cartoon is exactly where a species gets quietly editorialised. Nothing in the model
 // ranks these peoples, so nothing here may either: same eyes, same construction, and the
 // colour comes from each people's own entry rather than from anything chosen in this file.
 const F=E.Portrait.FACE;
 for(let k=0;k<F.length;k++){
  const svg=E.Portrait.svg(k,3);
  assert.equal((svg.match(/fill="#fbf7ec"/g)||[]).length,2,'every face has two eyes the same way');
  assert((svg.match(/stroke-linecap="round"/g)||[]).length>0,'every face has brows');
  assert(F[k].brow>=.7&&F[k].brow<=1.4,'no brow is drawn into a scowl');
 }
 // Skin, cloth and line are all mixed from PEOPLES[k].color. Change that colour and the
 // whole portrait moves with it; nothing is hard-coded per species.
 for(let k=0;k<E.PEOPLES.length;k++){
  const p=E.Portrait.palette(k,0);
  for(const key of ['skin','shade','cloth','hair','eye','line'])
   assert(/^rgb\(\d+,\d+,\d+\)$/.test(p[key]),`${E.PEOPLES[k].name} ${key} is not a derived colour`);
 }
 assert.equal(new Set(E.PEOPLES.map((_,k)=>E.Portrait.palette(k,0).skin)).size,E.PEOPLES.length,
  'each people is tinted from its own colour');
 report.checks.parity={sameEyes:true,browRange:[Math.min(...F.map(f=>f.brow)),Math.max(...F.map(f=>f.brow))]};
});

test('a portrait is stable, and varies within a people',()=>{
 assert.equal(E.Portrait.svg(0,42),E.Portrait.svg(0,42),'the same narrator keeps the same face');
 const faces=new Set(Array.from({length:40},(_,k)=>E.Portrait.svg(0,k)));
 assert(faces.size>=12,'forty Humans give only '+faces.size+' different faces');
 assert(E.Portrait.svg(0,42,{size:200}).includes('width="200"'));
 assert(E.Portrait.svg(0,42,{speaking:false})!==E.Portrait.svg(0,42,{speaking:true}),'a closed mouth differs from an open one');
});

test('somebody who lives in the town is the one telling you',()=>{
 for(const g of sagas){
  const n=g.narrator;
  assert(n&&E.PEOPLES[n.people],g.name+' has no narrator');
  assert(n.name&&n.office&&n.opener&&Number.isInteger(n.seed),g.name+' narrator is incomplete');
  assert(E.Portrait.svg(n.people,n.seed).startsWith('<svg'),'the narrator has a drawable face');
 }
 // The narrator is a resident, drawn like any other, so their spread tracks who lives here.
 const told=E.PEOPLES.map(()=>0),living=E.PEOPLES.map(()=>0);
 for(const g of sagas)told[g.narrator.people]++;
 for(const p of settled)p.people.forEach((v,k)=>living[k]+=v);
 for(let k=0;k<E.PEOPLES.length;k++)
  assert(Math.abs(told[k]/sagas.length-living[k]/settled.length)<.09,
   `${E.PEOPLES[k].name}: ${(told[k]/sagas.length*100).toFixed(0)}% of narrators on ${(living[k]/settled.length*100).toFixed(0)}% of the population`);
 assert(told.every(n=>n>0),'every people of this world narrates somewhere');
 assert(new Set(sagas.map(g=>g.narrator.office)).size>=8,'offices vary with what each town had to survive');
 assert(new Set(sagas.map(g=>g.narrator.name)).size>sagas.length*.7,'narrators are largely distinct people');
 report.checks.narrators={count:sagas.length,names:new Set(sagas.map(g=>g.narrator.name)).size,
  offices:new Set(sagas.map(g=>g.narrator.office)).size,
  share:told.map(v=>+(v/sagas.length).toFixed(3))};
});

test('the narrator only claims a people as their own when it is',()=>{
 // The first cut had a Hornkin gate-warden saying "the Humans began here and it is still
 // ours". Whose story it is and who is telling it are two different facts.
 for(const g of sagas){
  const first=g.people,opening=g.chapters[0].text;
  if(g.narrator.people!==first){
   assert(!/still ours/.test(opening),`${g.name}: a ${E.PEOPLES[g.narrator.people].name} narrator calls the ${E.PEOPLES[first].name} share "ours"`);
   assert(!/My people began/.test(opening),`${g.name}: the narrator claims a founding that is not theirs`);
  }
  // Whoever is speaking, the telling is first-person and addressed to a visitor.
  assert(/\b(I|we|my|our|us)\b/i.test(opening),g.name+' does not read as somebody speaking');
 }
 const outsiders=sagas.filter(g=>g.narrator.people!==g.people);
 assert(outsiders.length>0,'some towns are narrated by someone not of the local majority');
 report.checks.voice={outsiderNarrators:outsiders.length,of:sagas.length};
});

test.after(()=>writeFileSync(resolve(root,'docs/PORTRAIT_RESULTS.json'),JSON.stringify(report,null,2)));
