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
test('Nine precinct families have distinct finite geometry and deterministic replay',()=>{
 const signatures=[];
 for(const style of Object.keys(E.ArtisanCityKit.palettes)){
  const recipe=E.LandmarkCatalog.recipe(style,'artisan-reference',{artisan:true,urbanStyle:style}),m=E.ArtisanCityKit.precinct(recipe);
  assert(m.stats.triangles>1500,style);assert(m.bounds.max.every(Number.isFinite));
  const hash=createHash('sha256');for(const p of m.parts){assert(p.geometry.data.every(Number.isFinite));hash.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));}
  const digest=hash.digest('hex');signatures.push(digest);const n=E.ArtisanCityKit.precinct(recipe);assert.deepEqual(n.bounds,m.bounds);assert.equal(n.stats.triangles,m.stats.triangles);
  const bytes=E.exportGeometryGLB(E.LandmarkTemplates.meshes(m),{recipe});assert.equal(new DataView(bytes).getUint32(0,true),0x46546c67);
  report.models.push({style,triangles:m.stats.triangles,parts:m.parts.length,sha256:digest,glbBytes:bytes.byteLength});
 }
 assert.equal(new Set(signatures).size,9);report.checks.nineGeometricFamilies=true;
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
test.after(()=>writeFileSync(resolve(root,'docs/ARTISAN_RESULTS.json'),JSON.stringify(report,null,2)));
