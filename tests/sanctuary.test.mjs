import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const E=Function(code+'\nreturn {generateWorld,createCivilization,generateCity,auditCity,physicalFingerprint,settlementFingerprint,politicalFingerprint,stepCivilization,LandmarkTemplates,LandmarkCatalog,LandmarkBinding,SacredCityKit,TownCityBinding,TownCatalog,TOWN_WONDERS,ArtisanCityKit,exportGeometryGLB};')();
let w,s,city,lot,recipe,model,sacredIds,siteId;
const results={version:'12.0.0',checks:[]};
const digest=m=>{const h=createHash('sha256');for(const p of m.parts)h.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));return h.digest('hex')};
// Derive the sacred set instead of pinning province ids: the geography classifier decides
// which towns are pilgrimage towns, and that set moves whenever it is retuned.
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 sacredIds=s.provinces.filter(p=>p.city&&p.urbanPop>=650&&E.TownCatalog.native(p,w)==='basilica'&&(p.detailSupport??p.urbanSupport)>=6500).map(p=>p.id);
 assert(sacredIds.length>=3,'the world must still produce pilgrimage towns');siteId=sacredIds[0];
 city=E.generateCity(w,s,siteId);lot=city.buildings.find(b=>b.sacred);recipe=E.TownCityBinding.resolve(w,s,s.provinces[siteId],city,'temple');model=E.SacredCityKit.build(recipe);});
test('Grand sanctuary is placed inside an existing pilgrimage town, on a reserved accessible dry parcel',()=>{
 assert(lot);assert(lot.w>=30);assert(lot.streetSocket!=null);assert(city.citadelSite.gateway!=null);assert(city.buildings.length>40);
 const audit=E.auditCity(city);for(const k of['iceBuildings','wetBuildings','roadBuildings','overlaps','nonfinite','seaRoads'])assert.equal(audit[k],0,k);
 assert(!city.citadelReserve[city.marketIndex],'the sacred site must never enclose the market seed');
 results.checks.push({name:'existing-city-placement',provinceId:siteId,city:city.name,width:lot.w,audit});
});
test('Sanctuary geometry has a monumental silhouette and actual modeled detail, with deterministic replay',()=>{
 assert(model.stats.triangles>150000);assert(model.bounds.max[1]>50);assert(model.parts.length>=10);
 for(const id of['great-nave','west-front','crown-of-light','sacred-acropolis','chapter-cloisters'])assert(model.parts.some(p=>p.id===id),id);
 for(const module of['pointed-arch','traceried-window','double-flying-buttress','radial-stained-glass','connected-grand-stair','guardian-sculpture'])assert(model.stats.modules[module]>0,module);
 const repeat=E.SacredCityKit.build(recipe);assert.equal(digest(model),digest(repeat));
 results.checks.push({name:'real-geometry',triangles:model.stats.triangles,parts:model.parts.length,bounds:model.bounds,modules:model.stats.modules,sha256:digest(model)});
});
test('World-site, town miniature and architectural closeup all resolve the identical sacred recipe',()=>{
 const site=E.SacredCityKit.site(w,s,s.provinces[siteId]);const inventory=E.LandmarkBinding.inventory(w,s),entry=inventory.find(x=>x.id===recipe.id);
 assert(site&&entry);assert(entry.recipe.sacred);assert.equal(E.LandmarkCatalog.signature(site.recipe),E.LandmarkCatalog.signature(recipe));
 const close=E.LandmarkTemplates.build(entry.recipe);assert.equal(digest(close),digest(model));
 const mini=E.TownCityBinding.miniature(recipe,lot);assert.equal(mini.model.signature,model.signature);
 for(const g of[mini.body,mini.roof])for(let j=0;j<g.data.length;j+=9){assert(Number.isFinite(g.data[j]));assert(g.data[j]>=lot.x-lot.w/2-.001&&g.data[j]<=lot.x+lot.w/2+.001);assert(g.data[j+2]>=lot.z-lot.d/2-.001&&g.data[j+2]<=lot.z+lot.d/2+.001);assert(g.data[j+1]>=lot.y-.001);}
 results.checks.push({name:'same-recipe-at-three-scales',signature:model.signature,placedHeight:mini.height});
});
test('Every native sacred town retains housing, connected roads and collision-free landmark parcels',()=>{
 const before=[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)],rows=[];
 for(const id of sacredIds){const c=E.generateCity(w,s,id),b=c.buildings.find(b=>b.sacred),a=E.auditCity(c);assert(c.buildings.length>=20,c.name);assert(b,c.name);assert(!c.citadelReserve[c.marketIndex]);for(const k of['wetBuildings','overlaps','nonfinite','roadBuildings'])assert.equal(a[k],0,c.name+' '+k);rows.push({id,name:c.name,blocks:c.buildings.length,sanctuary:b.w});}
 assert.deepEqual([E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)],before);results.checks.push({name:'native-sacred-towns',count:rows.length,rows});
});
test('Every tradition that can raise a wonder raises its own, as real geometry',()=>{
 // Only the pilgrimage towns used to build anything above a citadel, so every skyline in
 // the world resolved to the same cathedral. Each tradition now has its own monument, and
 // the claim is that they are actually DIFFERENT buildings on the map — not one model with
 // five names — so the geometry of each is hashed and compared.
 // Largest first, and stop once every kind has been seen: generating all ninety-odd towns
 // to find five buildings cost half a minute of the suite for nothing.
 const towns=s.provinces.filter(q=>q.city&&q.urbanPop>=650).sort((a2,b2)=>b2.urbanPop-a2.urbanPop);
 const kinds=new Set(Object.keys(E.TOWN_WONDERS).map(k=>E.TOWN_WONDERS[k].id)),seen=new Map(),shapes=new Set();
 for(const q of towns){
  if(seen.size>=kinds.size)break;
  const c=E.generateCity(w,s,q.id),b=c.buildings.find(x=>x.wonder);
  if(!b||seen.has(b.wonder))continue;
  const recipe=E.TownCityBinding.resolve(w,s,q,c,'temple'),model=E.SacredCityKit.build(recipe);
  assert.equal(recipe.wonder,b.wonder,b.wonder+' must reach the recipe');
  assert(recipe.name.includes(q.name),'a wonder is named for the town that raised it');
  assert(model.parts.length>=4,b.wonder+' has too few parts to be a monument');
  for(const part of model.parts){
   assert.equal(part.geometry.data.length%27,0);
   for(const v of part.geometry.data)assert(Number.isFinite(v),b.wonder+' emitted a non-finite vertex');
  }
  const height=model.bounds.max[1]-model.bounds.min[1],width=model.bounds.max[0]-model.bounds.min[0];
  assert(height>18&&height<70,`${b.wonder} stands ${height.toFixed(0)} tall`);
  assert(width>12&&width<52,`${b.wonder} is ${width.toFixed(0)} wide`);
  // Same recipe, same building: these are cached and re-derived all over the UI.
  assert.equal(digest(model),digest(E.SacredCityKit.build(recipe)),b.wonder+' is not deterministic');
  shapes.add(digest(model));
  seen.set(b.wonder,{town:q.name,triangles:Math.round(model.parts.reduce((n,p2)=>n+p2.geometry.data.length/27,0))});
 }
 assert(seen.size>=4,`only ${seen.size} kinds of wonder exist in this world`);
 assert.equal(shapes.size,seen.size,'two traditions produced the same building');
 assert(seen.has('cathedral'),'the pilgrimage cathedral must survive the generalisation');
 results.checks.push({name:'wonders-per-tradition',kinds:[...seen].map(([k,v])=>({wonder:k,...v}))});
});
test('Ritual and crown variants change actual geometry, and dry input does not produce a fountain',()=>{
 const variants=[];for(const [faith,crown]of[['sun','spire'],['stars','crystal'],['hearth','dome'],['grove','battlement']]){const m=E.SacredCityKit.build({...recipe,faith,crown});variants.push(digest(m));assert(m.parts.every(p=>p.geometry.data.every(Number.isFinite)));}
 assert.equal(new Set(variants).size,4);
 const dry=E.SacredCityKit.build({...recipe,geography:{...recipe.geography,freshwater:0}});assert.equal(dry.stats.modules.cistern||0,0);
 results.checks.push({name:'architectural-variants-and-water-constraint',uniqueVariants:4});
});
test('Generated saved recipes replay in the same city without changing geography or population',()=>{
 const before=[E.physicalFingerprint(w),E.settlementFingerprint(s)];
 s.landmarkRecipes={[recipe.id]:{...recipe,crown:'dome',faith:'stars'}};
 const loaded=JSON.parse(JSON.stringify(s)),resolved=E.TownCityBinding.resolve(w,loaded,loaded.provinces[siteId],city,'temple');
 assert(resolved.sacred);assert.equal(resolved.crown,'dome');assert.equal(resolved.faith,'stars');
 assert.deepEqual([E.physicalFingerprint(w),E.settlementFingerprint(s)],before);results.checks.push({name:'save-load-recipe',crown:resolved.crown,faith:resolved.faith});
});
test('Sacred models export as named GLB triangle meshes without images or external resources',()=>{
 const bytes=E.exportGeometryGLB(E.LandmarkTemplates.meshes(model),{recipe,sourceCity:'Silverford'}),v=new DataView(bytes);assert.equal(v.getUint32(0,true),0x46546c67);assert.equal(v.getUint32(8,true),bytes.byteLength);
 const j=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,v.getUint32(12,true))));assert(j.meshes.length>=10);assert(!j.images);assert(!j.textures);assert(j.buffers.every(b=>!b.uri));
 results.checks.push({name:'embedded-GLB',bytes:bytes.byteLength,meshes:j.meshes.length});
});
test.after(()=>writeFileSync(resolve(root,'docs/SANCTUARY_NODE_RESULTS.json'),JSON.stringify(results,null,2)));
