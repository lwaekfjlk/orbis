import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine, root, defaults} from './engine-loader.mjs';
const E=loadEngine();
let w,s,settled,sagas;const report={version:2,checks:{}};
test.before(async()=>{
 w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 settled=s.provinces.filter(p=>p.settled);sagas=settled.map(p=>E.Saga.of(w,s,p));
});

test('every people has labelled, self-contained drawable markup',()=>{
 assert.equal(E.Portrait.FACE.length,E.PEOPLES.length,'one face per modelled people, no more');
 for(let k=0;k<E.PEOPLES.length;k++){
  // -2059693344 makes the hair-colour hash exactly 1 (the upper endpoint).
  for(const seed of [0,k*13+7,-2147483648,2147483647,-2059693344]){
  const svg=E.Portrait.svg(k,seed),name=E.PEOPLES[k].name;
  assert(svg.startsWith('<svg')&&svg.endsWith('</svg>'));
  assert(/viewBox="0 0 100 100"/.test(svg));
  // A NaN in a path coordinate silently drops the whole shape in a browser.
  assert(!/NaN|undefined|Infinity/.test(svg),name+' portrait has a bad coordinate');
  const stack=[],allowed=new Set(['svg','g','path','ellipse','circle','rect','line','polyline','polygon','title']);
  for(const tag of svg.matchAll(/<(\/)?([a-zA-Z][\w:-]*)\b[^>]*>/g)){
   assert(allowed.has(tag[2]),name+' portrait contains a non-vector element: '+tag[2]);
   if(tag[1])assert.equal(stack.pop(),tag[2],name+' portrait has mismatched tags');
   else if(!tag[0].endsWith('/>'))stack.push(tag[2]);
  }
  assert.equal(stack.length,0,name+' portrait leaves a tag open');
  assert.equal((svg.match(/<svg\b/g)||[]).length,1,'one SVG root per portrait');
  assert(svg.includes('role="img"')&&svg.includes(`aria-label="${name} narrator"`),'a portrait is labelled for a screen reader');
  assert(svg.includes('focusable="false"'),'a decorative portrait adds no keyboard stop');
  // Inline copies must work offline and coexist without shared SVG resource IDs.
  assert(!/\b(?:href|src|id|style|on\w+)\s*=|url\s*\(/i.test(svg),name+' portrait depends on a resource or active content');
  assert(svg.length>800&&svg.length<16000,name+' portrait exceeds the inline markup budget: '+svg.length+' bytes');
  }
 }
 report.checks.markup={peoples:E.PEOPLES.length,bytes:E.PEOPLES.map((_,k)=>E.Portrait.svg(k,0).length)};
});

test('the seven faces are actually different, and each shows what its people is',()=>{
 const svgs=E.PEOPLES.map((_,k)=>E.Portrait.svg(k,5));
 assert.equal(new Set(svgs).size,svgs.length,'two peoples render identically');
 const F=E.Portrait.FACE;
 // Preserve the seven anatomical identities without pinning artistic coordinates.
 const traits=[
  ['round',null,'crop',null],['long','circlet','fall',null],
  ['round',null,'beard',null],['tuft',null,'mane','round'],
  ['round','horns','crop',null],['fin','fin','slick',null],
  ['fin','ridge','scale','square']
 ];
 for(let k=0;k<F.length;k++){
  const f=F[k],name=E.PEOPLES[k].name;
  assert.deepEqual([f.ear,f.crown,f.hair,f.snout?.[2]??null],traits[k],name+' loses its identifying features');
  assert.equal((svgs[k].match(/data-feature="muzzle"/g)||[]).length,f.snout?1:0,name+' muzzle does not match its anatomy');
  const pupils=[...svgs[k].matchAll(/<ellipse\b[^>]*data-feature="slit-pupil"[^>]*\/>/g)];
  assert.equal(pupils.length,k===6?2:0,name+' has the wrong pupil type');
  for(const [pupil] of pupils){
   const rx=+pupil.match(/\brx="([\d.]+)"/)[1],ry=+pupil.match(/\bry="([\d.]+)"/)[1];
   assert(rx>0&&ry>rx,'Drakekin slit pupils are narrow vertical shapes');
  }
 }
 assert(F[2].head[0]>F[0].head[0],'the Stonekin are broader in the face');
 // Every face is built from the same fields, so none of them is a special case with
 // extra business bolted on.
 const keys=Object.keys(F[0]).sort().join(',');
 for(const f of F)assert.equal(Object.keys(f).sort().join(','),keys,'one face carries fields the others do not');
 report.checks.distinct={renders:new Set(svgs).size,ears:new Set(F.map(f=>f.ear)).size,
  crowns:new Set(F.map(f=>f.crown)).size,snouts:F.filter(f=>f.snout).length};
});

test('all peoples share eye construction, restrained brows and a complete palette',()=>{
 // Check the shared construction; visual review still determines how expressions read.
 const F=E.Portrait.FACE;
 for(let k=0;k<F.length;k++){
  const svg=E.Portrait.svg(k,3);
  assert.equal((svg.match(/data-feature="eye"/g)||[]).length,2,'every face has two eyes the same way');
  assert((svg.match(/stroke-linecap="round"/g)||[]).length>0,'every face has brows');
  assert(F[k].brow>=.7&&F[k].brow<=1.4,'no brow is drawn into a scowl');
 }
 // The palette uses the people's model colour, mixed with common material tones.
 for(let k=0;k<E.PEOPLES.length;k++){
  const p=E.Portrait.palette(k,0);
  for(const key of ['skin','shade','light','cloth','fold','seam','hair','strand','eye','line','gold','backdrop']){
   assert(/^rgb\(\d+,\d+,\d+\)$/.test(p[key]),`${E.PEOPLES[k].name} ${key} is not an RGB colour`);
   assert(p[key].match(/\d+/g).every(v=>+v<=255),'palette channels stay in range');
  }
 }
 assert.equal(new Set(E.PEOPLES.map((_,k)=>E.Portrait.palette(k,0).skin)).size,E.PEOPLES.length,
  'each people is tinted from its own colour');
 report.checks.parity={sameEyes:true,browRange:[Math.min(...F.map(f=>f.brow)),Math.max(...F.map(f=>f.brow))]};
});

test('a portrait is stable, and varies within a people',()=>{
 for(let k=0;k<E.PEOPLES.length;k++){
  const first=E.Portrait.svg(k,42),name=E.PEOPLES[k].name;
  const faces=new Set(Array.from({length:40},(_,seed)=>E.Portrait.svg(k,seed)));
  assert.equal(first,E.Portrait.svg(k,42),'intervening renders do not change the same narrator');
  assert(faces.size>=12,'forty '+name+' give only '+faces.size+' different faces');
  assert(E.Portrait.svg(k,42,{size:200}).includes('width="200" height="200"'));
  assert.notEqual(E.Portrait.svg(k,42,{speaking:false}),E.Portrait.svg(k,42,{speaking:true}),name+' has open and closed mouth states');
 }
});

test('invalid portrait inputs fall back to a usable face and bounded dimensions',()=>{
 for(const people of [undefined,null,-1,E.PEOPLES.length,1.5,'1',NaN,Infinity,{}]){
  assert.equal(E.Portrait.svg(people,42),E.Portrait.svg(0,42),'invalid people use the Human fallback');
  assert.deepEqual(E.Portrait.palette(people,42),E.Portrait.palette(0,42));
 }
 for(const seed of [null,'42',NaN,Infinity])
  assert.equal(E.Portrait.svg(1,seed),E.Portrait.svg(1,0),'invalid seeds use a stable default');
 for(const size of [undefined,null,'200',NaN,Infinity])
  assert(E.Portrait.svg(1,42,{size}).includes('width="96" height="96"'),'invalid sizes use 96px');
 for(const [size,expected] of [[-1,16],[0,16],[16,16],[72,72],[1024,1024],[2048,1024]])
  assert(E.Portrait.svg(1,42,{size}).includes(`width="${expected}" height="${expected}"`),'finite sizes stay between 16px and 1024px');
 assert.equal(E.Portrait.svg(1,42,null),E.Portrait.svg(1,42),'null options retain defaults');
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
