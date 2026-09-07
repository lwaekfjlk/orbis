import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(s=>readFileSync(resolve(root,s),'utf8')).join('\n');
const E=Function(code+'\nreturn {generateWorld,createCivilization,generateCity,auditCity,physicalFingerprint,ArtisanCityKit,LandmarkCatalog,LandmarkTemplates,FortressPlan,exportGeometryGLB};')();
let world,sim;
// A town that actually reserves a citadel, found rather than remembered: the province
// this was written against stopped being a town when a landform prior moved, and the
// claim is about the reserve, not about an id.
function citadelTown(){
 for(const q of sim.provinces){
  if(!q.city)continue;
  const c=E.generateCity(world,sim,q.id);
  if(c.buildings.some(b=>b.precinct)&&c.citadelSite)return{p:q,c};
 }
 throw Error('no town in this world reserves a citadel');
}const report={version:'11.0.0',checks:{},models:[]};
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
 const before=E.physicalFingerprint(world),snapshot=JSON.stringify(sim),{p,c}=citadelTown(),b=c.buildings.find(b=>b.precinct);
 assert(b);assert(b.w>=18);assert(b.streetSocket!=null);assert(c.citadelSite.gateway!=null);assert(b.y>b.foundationBed);
 const a=E.auditCity(c);for(const k of ['wetBuildings','roadBuildings','overlaps','nonfinite','iceBuildings'])assert.equal(a[k],0,k);
 assert(c.defenses.walls.length>100);assert(c.defenses.towers.length>10);assert(c.defenses.approachCount>0);assert(c.defenses.gates.length>0);
 assert.equal(E.physicalFingerprint(world),before);assert.equal(JSON.stringify(sim),snapshot);
 report.checks.highland={name:p.name,footprints:c.buildings.length,wallSegments:c.defenses.walls.length,towers:c.defenses.towers.length,gates:c.defenses.gates.length,approaches:c.defenses.approachCount,citadelWidth:b.w,terrainUnchanged:true};
});
test('Domestic, infill and citadel meshes stay inside their real parcels, including rotated lots',()=>{
 const {p,c}=citadelTown();let count=0;
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
   const wall=hsv(rgbOf(paint.wall)),roof=hsv(rgbOf(paint.roof));
   wall.rgb=rgbOf(paint.wall);roof.rgb=rgbOf(paint.roof);
   walls.push(wall);roofs.push(roof);
  }
  // Distance in colour, not saturation alone. A mountain tradition is built of grey
  // granite at .026 saturation and a delve town of grey stone at .11: there is almost
  // nothing there to multiply, and demanding a saturation figure of them means tinting
  // stone that should stay stone. What actually matters is whether two houses can be
  // told apart, which they can do through value as readily as through hue.
  const cloud=cols=>{const m=[0,1,2].map(k=>cols.reduce((a,c)=>a+c[k],0)/cols.length);
   return Math.sqrt(cols.reduce((a,c)=>a+m.reduce((t,mk,k)=>t+(c[k]-mk)**2,0),0)/cols.length);};
  const wc=cloud(walls.map(v=>v.rgb)),rc=cloud(roofs.map(v=>v.rgb));
  // Without the material stock these run .102 (granite) to .139; with it, .130 to .201.
  assert(wc>.115,`${p.name} walls are only ${wc.toFixed(3)} apart in colour`);
  assert(rc>.100,`${p.name} roofs are only ${rc.toFixed(3)} apart in colour`);
  // ...and it must stay one town, not a paint chart.
  assert(wc<.34&&rc<.34,`${p.name} has lost its construction language`);
  const ws=spread(walls.map(v=>v[1])),wv=spread(walls.map(v=>v[2])),rs=spread(roofs.map(v=>v[1]));
  // Same block, same paint: this is a lookup, not a roll at draw time.
  assert.equal(E.ArtisanCityKit.blockPaint(c,c.buildings[0]).wall,E.ArtisanCityKit.blockPaint(c,c.buildings[0]).wall);
  rows.push({town:p.name,style:c.townProfile.id,buildings:c.buildings.length,
   wallColourSpread:+wc.toFixed(3),roofColourSpread:+rc.toFixed(3),
   wallSaturation:+ws.toFixed(3),wallBrightness:+wv.toFixed(3),roofSaturation:+rs.toFixed(3)});
 }
 report.checks.buildingColour=rows;
});
function rgbOf(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
test.after(()=>writeFileSync(resolve(root,'docs/ARTISAN_RESULTS.json'),JSON.stringify(report,null,2)));
