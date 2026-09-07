import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,defaults} from './engine-loader.mjs';
const scripts=['src/world/geography.js','src/civilization/realm-names.js', 'src/civilization/simulation.js','src/city/environment.js', 'src/towns/catalog.js','src/towns/grammar.js', 'src/towns/fortifications.js','src/city/generator.js','src/city/actions.js','src/render/world-renderer.js','src/render/export-glb.js','src/landmarks/catalog.js','src/landmarks/kit.js','src/landmarks/templates.js','src/landmarks/world-binding.js'];
const e=Function(scripts.map(f=>readFileSync(resolve(root,f),'utf8')).join('\n')+'\nreturn {LandmarkCatalog,LandmarkTemplates,LandmarkBinding,generateWorld,createCivilization,generateCity,physicalFingerprint,settlementFingerprint,politicalFingerprint,exportGeometryGLB};')();
const C=e.LandmarkCatalog,T=e.LandmarkTemplates;
function geometryHash(m,filter=()=>true){const h=createHash('sha256');for(const p of m.parts.filter(filter))h.update(Buffer.from(new Float32Array(p.geometry.data).buffer));return h.digest('hex')}

test('catalog has fifteen palace families and six separately composed regional landmarks',()=>{
 assert.equal(C.styles.filter(s=>s.type==='palace').length,15);assert.equal(C.styles.filter(s=>s.type==='landmark').length,6);
 for(const s of C.styles)assert.ok(T.builders[s.id]);
});
test('all twenty-one assemblies are deterministic finite meshes, with separate named roof groups',()=>{
 const hashes=new Set();
 for(const s of C.styles){const r=C.recipe(s.id,'mesh-test'),a=T.build(r),b=T.build(r);
  assert.equal(geometryHash(a),geometryHash(b),s.id);assert.ok(a.stats.triangles>3000);assert.ok(a.parts.some(p=>p.role==='roof'));assert.equal(a.parts.length,new Set(a.parts.map(p=>p.id)).size);
  for(const p of a.parts){assert.equal(p.geometry.data.length%27,0);for(const v of p.geometry.data)assert.ok(Number.isFinite(v));}
  hashes.add(geometryHash(a,p=>p.role==='architecture'));
 }
 assert.equal(hashes.size,21,'Architecture differs geometrically, not only through color or metadata.');
});
test('seed recombination, tower-crown substitution and roof substitution change actual mesh geometry',()=>{
 const r=C.recipe('river','composition-test'),a=T.build(r),b=T.build({...r,seed:'composition-test-2',variant:2}),c=T.build({...r,crown:'crystal'}),d=T.build({...r,roofLanguage:'flat'});
 for(const m of[b,c,d])assert.notEqual(geometryHash(a),geometryHash(m));
 assert.ok(c.stats.modules['crystal-crown']>0);assert.ok(d.stats.modules.parapet>0);
});
test('religious geometry changes without relocating the structural foundation',()=>{
 const r=C.recipe('river','same-foundation'),a=T.build({...r,faith:'sun'}),b=T.build({...r,faith:'stars'});
 assert.notEqual(geometryHash(a),geometryHash(b));assert.equal(geometryHash(a,p=>p.role==='foundation'),geometryHash(b,p=>p.role==='foundation'));
});
test('invalid recipes are rejected or normalized without accepting unknown templates',()=>{
 assert.throws(()=>C.validate({format:'no'}));assert.throws(()=>C.validate({...C.recipe(),style:'not-a-template'}));
 const cold=C.validate({...C.recipe('fjord'),roofLanguage:'flat'});assert.equal(cold.roofLanguage,'northern');
 const huge=C.validate({...C.recipe(),roofPitch:1e12});assert.ok(huge.roofPitch<=1.6);
});
test('exported GLB files have named real meshes, not image planes',()=>{
 const manifest=JSON.parse(readFileSync(resolve(root,'assets/landmarks/manifest.json'),'utf8'));
 assert.equal(manifest.models.length,15);
 for(const item of manifest.models){const b=readFileSync(resolve(root,'assets/landmarks',item.file));assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
  const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));assert.ok(j.meshes.length>=7);assert.equal(j.images,undefined);assert.equal(j.textures,undefined);
  assert.equal(j.asset.extras.signature,item.signature);assert.ok(j.accessors.filter(a=>a.min).some(a=>a.max[1]-a.min[1]>5));
 }
});
test('world landmarks and city miniatures inherit the same recipe and never modify natural or settlement fields',async()=>{
 const w=await e.generateWorld(defaults),s=e.createCivilization(w,{realms:18,conflict:1}),before={geo:e.physicalFingerprint(w),settlements:e.settlementFingerprint(s),politics:e.politicalFingerprint(s)};
 const sites=e.LandmarkBinding.inventory(w,s);assert.ok(sites.length>30);
 const p=s.provinces[s.realms[0].capital],c=e.generateCity(w,s,p.id),b=c.buildings.find(b=>b.type==='civic');assert.ok(b);
 const mini=e.LandmarkBinding.miniature(w,s,p,b),r=e.LandmarkBinding.resolve(w,s,p,'civic');assert.equal(mini.recipe.id,r.id);assert.equal(C.signature(mini.recipe),C.signature(r));
 const v=mini.geometry.data,lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];for(let k=0;k<v.length;k+=9){lo[0]=Math.min(lo[0],v[k]);hi[0]=Math.max(hi[0],v[k]);lo[1]=Math.min(lo[1],v[k+2]);hi[1]=Math.max(hi[1],v[k+2]);}
 assert.ok(hi[0]-lo[0]<=b.w);assert.ok(hi[1]-lo[1]<=b.d);
 s.landmarkRecipes={[r.id]:{...r,crown:'crystal',faith:'stars'}};const kept=e.LandmarkBinding.resolve(w,s,p,'civic');assert.equal(kept.crown,'crystal');
 const restored=JSON.parse(JSON.stringify(s));assert.equal(C.signature(e.LandmarkBinding.resolve(w,restored,p)),C.signature(kept));
 assert.deepEqual({geo:e.physicalFingerprint(w),settlements:e.settlementFingerprint(s),politics:e.politicalFingerprint(s)},before);
});
