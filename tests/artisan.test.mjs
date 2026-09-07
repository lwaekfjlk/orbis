import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(s=>readFileSync(resolve(root,s),'utf8')).join('\n');
const E=Function(code+'\nreturn {generateWorld,createCivilization,generateCity,auditCity,physicalFingerprint,ArtisanCityKit,LandmarkCatalog,LandmarkTemplates,FortressPlan,exportGeometryGLB};')();
let world,sim;const report={version:'11.0.0',checks:{},models:[]};
test.before(async()=>{world=await E.generateWorld(defaults);sim=E.createCivilization(world,{realms:18,historySeed:'First-dawn'});});
test('Fifteen precinct families have distinct finite geometry and deterministic replay',()=>{
 const signatures=[];
 for(const style of Object.keys(E.ArtisanCityKit.palettes)){
  const recipe=E.LandmarkCatalog.recipe(style,'artisan-reference',{artisan:true,urbanStyle:style}),m=E.ArtisanCityKit.precinct(recipe);
  assert(m.stats.triangles>1500,style);assert(m.bounds.max.every(Number.isFinite));
  const hash=createHash('sha256');for(const p of m.parts){assert(p.geometry.data.every(Number.isFinite));hash.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));}
  const digest=hash.digest('hex');signatures.push(digest);const n=E.ArtisanCityKit.precinct(recipe);assert.deepEqual(n.bounds,m.bounds);assert.equal(n.stats.triangles,m.stats.triangles);
  const bytes=E.exportGeometryGLB(E.LandmarkTemplates.meshes(m),{recipe});assert.equal(new DataView(bytes).getUint32(0,true),0x46546c67);
  report.models.push({style,triangles:m.stats.triangles,parts:m.parts.length,sha256:digest,glbBytes:bytes.byteLength});
 }
 assert.equal(new Set(signatures).size,15);report.checks.geometricFamilies=15;
});
test('Hilltop reserve precedes roads; main citadel remains dry and road accessible',()=>{
 const before=E.physicalFingerprint(world),snapshot=JSON.stringify(sim),p=sim.provinces[179],c=E.generateCity(world,sim,p.id),b=c.buildings.find(b=>b.precinct);
 assert(b);assert(b.w>=18);assert(b.streetSocket!=null);assert(c.citadelSite.gateway!=null);assert(b.y>b.foundationBed);
 const a=E.auditCity(c);for(const k of ['wetBuildings','roadBuildings','overlaps','nonfinite','iceBuildings'])assert.equal(a[k],0,k);
 assert(c.defenses.walls.length>100);assert(c.defenses.towers.length>10);assert(c.defenses.approachCount>0);assert(c.defenses.gates.length>0);
 assert.equal(E.physicalFingerprint(world),before);assert.equal(JSON.stringify(sim),snapshot);
 report.checks.highland={name:p.name,footprints:c.buildings.length,wallSegments:c.defenses.walls.length,towers:c.defenses.towers.length,gates:c.defenses.gates.length,approaches:c.defenses.approachCount,citadelWidth:b.w,terrainUnchanged:true};
});
test('Domestic, infill and citadel meshes stay inside their real parcels, including rotated lots',()=>{
 const p=sim.provinces[179],c=E.generateCity(world,sim,p.id);let count=0;
 for(const b of [c.buildings.find(b=>b.precinct),...c.buildings.filter(b=>!b.landmark).slice(0,8),...c.buildings.filter(b=>b.infill).slice(0,8)]){
  assert(b);const a=E.ArtisanCityKit.compound(b,c,p,sim.realms[p.owner]);
  for(const g of[a.body,a.roof])for(let j=0;j<g.data.length;j+=9){assert(g.data[j]>=b.x-b.w/2-.001&&g.data[j]<=b.x+b.w/2+.001,b.id+' x');assert(g.data[j+2]>=b.z-b.d/2-.001&&g.data[j+2]<=b.z+b.d/2+.001,b.id+' z');assert(g.data[j+1]>=b.y-.001);}
  count++;
 }report.checks.boundedParcels=count;
});
test('A quarter is many houses, not one house repeated',()=>{
 // Measured before this: across five towns a wall's hue varied by 2-6 degrees and its
 // brightness by 8%, so every building in a town was the same colour at slightly
 // different exposures. Each house now draws one of the town's building materials
 // first — its own stock, limewashed, fired earth, weathered stone — and weathers
 // that. One construction language, several materials in it.
 const hsv=c=>{const mx=Math.max(...c),mn=Math.min(...c),d=mx-mn;
  const h=d<1e-9?0:mx===c[0]?((c[1]-c[2])/d+6)%6:mx===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;
  return[h*60,mx?d/mx:0,mx];};
 const spread=v=>{const m=v.reduce((a,b)=>a+b,0)/v.length;return Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);};
 const rows=[];
 for(const p of sim.provinces.filter(q=>q.settled&&q.urbanPop>=650).sort((a,b)=>b.urbanPop-a.urbanPop).slice(0,4)){
  const c=E.generateCity(world,sim,p.id);
  assert(E.ArtisanCityKit.palettes[c.townProfile.id],c.townProfile.id+' has no palette');
  const walls=[],roofs=[];
  for(const b of c.buildings){
   const paint=E.ArtisanCityKit.blockPaint(c,b);
   walls.push(hsv(rgbOf(paint.wall)));roofs.push(hsv(rgbOf(paint.roof)));
  }
  // Saturation is the honest axis here: hue is unstable on a near-grey stone and
  // wraps at zero, which is what made the old numbers look better than they were.
  const ws=spread(walls.map(v=>v[1])),wv=spread(walls.map(v=>v[2])),rs=spread(roofs.map(v=>v[1]));
  assert(ws>.065,`${p.name} walls vary by only ${ws.toFixed(3)} in saturation`);
  assert(wv>.085,`${p.name} walls vary by only ${wv.toFixed(3)} in brightness`);
  assert(rs>.055,`${p.name} roofs vary by only ${rs.toFixed(3)} in saturation`);
  // ...and it must stay one town, not a paint chart.
  assert(ws<.30&&wv<.30,`${p.name} has lost its construction language`);
  // Same block, same paint: this is a lookup, not a roll at draw time.
  assert.equal(E.ArtisanCityKit.blockPaint(c,c.buildings[0]).wall,E.ArtisanCityKit.blockPaint(c,c.buildings[0]).wall);
  rows.push({town:p.name,style:c.townProfile.id,buildings:c.buildings.length,
   wallSaturation:+ws.toFixed(3),wallBrightness:+wv.toFixed(3),roofSaturation:+rs.toFixed(3)});
 }
 report.checks.buildingColour=rows;
});
function rgbOf(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
test.after(()=>writeFileSync(resolve(root,'docs/ARTISAN_RESULTS.json'),JSON.stringify(report,null,2)));
