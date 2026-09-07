import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,defaults} from './engine-loader.mjs';
const sources=['src/world/geography.js','src/civilization/simulation.js','src/city/environment.js', 'src/towns/catalog.js','src/towns/grammar.js', 'src/towns/fortifications.js','src/city/generator.js','src/city/actions.js','src/render/world-renderer.js','src/landmarks/catalog.js','src/landmarks/kit.js','src/landmarks/templates.js','src/landmarks/world-binding.js','src/towns/building-kit.js'];
const E=Function(sources.map(f=>readFileSync(resolve(root,f),'utf8')).join('\n')+'\nreturn {generateWorld,createCivilization,generateCity,auditCity,physicalFingerprint,settlementFingerprint,politicalFingerprint,TownCatalog,TownBuildingKit,TownCityBinding};')();
const digest=x=>createHash('sha256').update(Buffer.from(x.buffer??JSON.stringify(x))).digest('hex');
let w,s,base;const records={version:10,checks:{},styles:[]};
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});base=E.physicalFingerprint(w);});
const pick=id=>s.provinces.filter(p=>p.city&&E.TownCatalog.allowed(p,w,id)).sort((a,b)=>((E.TownCatalog.native(b,w)===id?1e9:0)+b.urbanPop)-((E.TownCatalog.native(a,w)===id?1e9:0)+a.urbanPop))[0];
function check(c){const a=E.auditCity(c);for(const key of ['wetBuildings','roadBuildings','overlaps','nonfinite','seaRoads'])assert.equal(a[key],0,c.name+':'+key);assert(c.buildings.length>15);assert.equal(c.connectors.length,c.buildings.length);assert(c.blocks.every(b=>b.streetSocket!=null));return a;}
test('thirteen whole-town grammars place connected compounds on existing settlements, without changing nature',()=>{
 const snapshot=JSON.stringify(s),planHashes=new Set();
 for(const t of E.TownCatalog.styles){const p=pick(t.id);assert(p,t.id+' has compatible source town');const c=E.generateCity(w,s,p.id,{style:t.id,seed:'Town-assembly-9'});check(c);assert.equal(E.physicalFingerprint(w),base);planHashes.add(c.fingerprint);
 records.styles.push({style:t.id,provinceId:p.id,town:p.name,modules:c.stats.modules,landmarks:c.stats.landmarks,roads:c.roads.length,grammar:c.townProfile.plan,blocksConnected:c.connectors.length,footprints:c.buildings.length,terrainHash:digest(c.height),waterHash:digest(c.water),fingerprint:c.fingerprint});}
 assert.equal(planHashes.size,13);assert.equal(JSON.stringify(s),snapshot);records.checks.grammars=13;
});
test('on the SAME site four types change streets and ordinary modules, not only a central palace',()=>{
 const p=pick('river'),rows=['river','basilica','arcane','basalt'].map(style=>E.generateCity(w,s,p.id,{style,seed:'one-site'}));
 for(const c of rows){check(c);assert.equal(digest(c.height),digest(rows[0].height));assert.equal(digest(c.water),digest(rows[0].water));}
 assert.equal(new Set(rows.map(c=>digest(c.roads.map(r=>r.nodes)))).size,4);
 assert.equal(new Set(rows.map(c=>c.blocks[0].template.split('/')[0])).size,4);records.checks.sameSite={provinceId:p.id,roadsDiffer:true,ordinaryModuleFamiliesDiffer:true,terrainAndWaterIdentical:true};
});
test('ordinary compounds are distinct actual 3D meshes, bounded by their placed parcels',()=>{
 const hashes=new Set();
 for(const t of E.TownCatalog.styles){const p=pick(t.id),c=E.generateCity(w,s,p.id,{style:t.id}),b=c.buildings.find(b=>!b.landmark),m=E.TownBuildingKit.build(b,c,p,s.realms[p.owner]);
  assert(m.body.data.length>100);assert(m.roof.data.length>0||t.id==='desert');
  for(const g of [m.body,m.roof])for(let i=0;i<g.data.length;i+=9){assert(g.data.slice(i,i+9).every(Number.isFinite));assert(g.data[i]>=b.x-b.w/2-1e-5&&g.data[i]<=b.x+b.w/2+1e-5);assert(g.data[i+2]>=b.z-b.d/2-1e-5&&g.data[i+2]<=b.z+b.d/2+1e-5)}
  hashes.add(digest(new Float32Array(m.body.data)));const again=E.TownBuildingKit.build(b,c,p,s.realms[p.owner]);assert.equal(digest(new Float32Array(m.body.data)),digest(new Float32Array(again.body.data)));
 }
 assert.equal(hashes.size,13);records.checks.realMeshes={families:13,boundedByDryParcels:true,deterministic:true};
});
test('composition seed rerolls the town; recipe JSON replays it and invalid combinations are rejected',()=>{
 const p=pick('river'),c=E.generateCity(w,s,p.id,{style:'river',seed:'draft-A'}),d=E.generateCity(w,s,p.id,{style:'river',seed:'draft-B'});
 assert.notEqual(c.fingerprint,d.fingerprint);assert.equal(digest(c.height),digest(d.height));assert.equal(digest(c.water),digest(d.water));
 const restored=JSON.parse(JSON.stringify(s));restored.townRecipes={[p.id]:E.TownCatalog.validate(JSON.parse(JSON.stringify(c.townRecipe)))};
 assert.equal(E.generateCity(w,restored,p.id).fingerprint,c.fingerprint);
 assert.throws(()=>E.TownCatalog.validate({...c.townRecipe,style:'alien'}));assert.throws(()=>E.TownCatalog.validate({...c.townRecipe,variety:Infinity}));
 const inland=s.provinces.find(p=>p.city&&!E.TownCatalog.allowed(p,w,'delta'));assert(inland);assert.throws(()=>E.generateCity(w,s,inland.id,{style:'delta'}),/incompatible/);
 records.checks.recipes={rerollChangesLayout:true,JSONReplayExact:true,invalidGeographiesRejected:true};
});
test('A walled town closes its ring; only a gateway is left open',()=>{
 // Every reason the enceinte stopped used to collapse into "water" and be left as
 // a silent hole, so not one walled town on this world enclosed itself: a harbour
 // front, a lane hugging the wall and a hull reaching a few units past the tile
 // margin all read as sea. Waterfront runs now carry a quay section, and a run no
 // gateway will span goes back to curtain.
 const towns=s.provinces.filter(p=>p.settled&&p.urbanPop>=650).sort((a,b)=>b.urbanPop-a.urbanPop).slice(0,30);
 let walled=0,quayed=0,widest=0,widestName='';
 for(const p of towns){
  const c=E.generateCity(w,s,p.id),d=c.defenses;
  if(!d?.walls.length)continue;
  walled++;if(d.quays.length)quayed++;
  assert(d.enclosed,p.name+' left its perimeter open');
  assert.equal(d.terrainGapSegments,0,p.name+' has an unexplained gap');
  for(const q of d.quays){
   assert(Number.isFinite(q.a.y+q.b.y+q.height+q.width),p.name+' has a malformed quay');
   assert(q.height>0&&q.height<d.walls[0].height,'a quay is lower than the curtain it continues');
  }
  // Walk the ring: every remaining opening has to be a gateway the builder spanned.
  const ring=[...d.walls,...d.quays],angle=g=>Math.atan2(g.a.z-c.market.z,g.a.x-c.market.x);
  ring.sort((a,b)=>angle(a)-angle(b));
  for(let j=0;j<ring.length;j++){
   const a=ring[j],b=ring[(j+1)%ring.length],gap=Math.hypot(a.b.x-b.a.x,a.b.z-b.a.z);
   if(gap>widest){widest=gap;widestName=p.name;}
  }
 }
 assert(walled>=12,'this world should raise walls somewhere');
 assert(quayed>=6,'and some of those towns stand on water');
 // 12 is the gate builder's own span limit, so nothing wider than a gate survives.
 assert(widest<=13,`${widestName} still has a ${widest.toFixed(1)} unit breach`);
 records.checks.enceinte={walledTowns:walled,withQuays:quayed,allEnclosed:true,widestOpening:+widest.toFixed(2)};
});
test.after(()=>writeFileSync(resolve(root,'docs/TOWN_MODEL_RESULTS.json'),JSON.stringify(records,null,2)));
