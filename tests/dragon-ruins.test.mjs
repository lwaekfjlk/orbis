import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {fantasyDefaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {DragonRuins,LandmarkCatalog,LandmarkTemplates,LandmarkBinding,CityEnvironment,generateWorld,createCivilization,physicalFingerprint,settlementFingerprint,politicalFingerprint,exportGeometryGLB,GW,GH};')();
const hash=m=>{const h=createHash('sha256');for(const p of m.parts)h.update(Buffer.from(new Float32Array(p.geometry.data).buffer));return h.digest('hex');};
const fingerprints=(w,s)=>[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)];
const build=(variant,lod,seed='DRAGON / test')=>E.LandmarkTemplates.build(E.LandmarkCatalog.recipe('dragon-ruins',seed,{variant}),{base:false,lod});

test('all dragon ruin variants have deterministic finite geometry, genuine gaps and stable rigid support groups at every LOD',()=>{
 const variants=new Set();
 for(let variant=0;variant<3;variant++){
  const coarse=build(variant,0),fine=build(variant,1);variants.add(hash(fine));
  assert.deepEqual(coarse.parts.map(p=>p.mount),fine.parts.map(p=>p.mount),'changing LOD must not move a masonry support');
  assert.notEqual(hash(coarse),hash(fine));
  for(let lod=0;lod<3;lod++){
   const m=build(variant,lod),again=build(variant,lod);assert.equal(hash(m),hash(again));assert.deepEqual(m.footprint,[36,30]);assert.equal(m.canonicalWidth,36);assert.equal(m.groundY,0);
   assert.ok(m.stats.triangles>1500&&m.stats.triangles<(lod===0?4000:12000));assert.ok(m.parts.length>=18&&m.parts.length<=24);
   assert.ok(m.bounds.min[0]>=-18&&m.bounds.max[0]<=18&&m.bounds.min[2]>=-15&&m.bounds.max[2]<=15);assert.ok(m.bounds.min[1]>=-.101&&m.bounds.max[1]>8);
   for(const name of ['broken-dragon-ring','ancient-dragon-nest','dragon-spine-arch','horned-dragon-gateway','fallen-dragon-masonry'])assert.ok(m.stats.modules[name]>0);
   assert.ok(!m.parts.some(p=>p.role==='roof'||p.role==='site'),'a roofless ruin must not acquire a temple roof or replacement landscape slab');
   assert.ok(!Object.keys(m.stats.modules).some(name=>/hall|dome|tower|window/.test(name)),'the dedicated ruin cannot be an ordinary palace with a different label');
   const groups=new Set();
   for(const p of m.parts){
    assert.equal(p.geometry.data.length%27,0);assert.ok(p.mountGroup&&p.mount.supports.length);groups.add(p.mountGroup);
    for(const support of p.mount.supports)assert.ok(support.w>0&&support.d>0&&support.w<=3&&support.d<=3.1);
    for(let i=0;i<p.geometry.data.length;i+=27){const v=p.geometry.data;for(let n=0;n<27;n++)assert.ok(Number.isFinite(v[i+n]));
     const a=[v[i+9]-v[i],v[i+10]-v[i+1],v[i+11]-v[i+2]],b=[v[i+18]-v[i],v[i+19]-v[i+1],v[i+20]-v[i+2]],area=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);assert.ok(area>1e-8,'every stone face needs a non-degenerate surface');
     for(const at of [i,i+9,i+18])assert.ok(Math.abs(Math.hypot(v[at+3],v[at+4],v[at+5])-1)<1e-6);
    }
    if(p.id.startsWith('ring-'))for(let i=0;i<p.geometry.data.length;i+=9)assert.ok(Math.hypot(p.geometry.data[i],p.geometry.data[i+2])>=11.2,'the broken foundation must leave the central ground open');
   }
   assert.equal(groups.size,m.parts.length,'each separated structural ruin can sit rigidly on its own actual supports');
  }
 }
 assert.equal(variants.size,3,'aerie, spine and gate variants must differ in actual construction');assert.notEqual(hash(build(0,1)),hash(build(0,1,'DRAGON / another')));
});

test('the ruin exports named original 3D meshes without image planes, textures or a fabricated ground stage',()=>{
 const m=build(0,1),data=E.exportGeometryGLB(E.LandmarkTemplates.meshes(m),{recipe:m.recipe,signature:m.signature}),b=Buffer.from(data),json=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(json.meshes.length,m.parts.length);assert.equal(json.images,undefined);assert.equal(json.textures,undefined);assert.ok(b.length<1_000_000);
 assert.ok(json.nodes.some(n=>n.name==='nest'));assert.ok(json.nodes.some(n=>n.name==='maw-west'));
});

test('four real worlds place independent ruins on surveyed uplands without rewriting geography, city founding or country history',async t=>{
 for(const spec of [{seed:'Aereth-47'},{seed:'Tanguine'},{seed:'Ninefold-9'},{seed:'Meridian-21',form:'rift'}]){
  const w=await E.generateWorld({...fantasyDefaults,...spec}),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'}),before=fingerprints(w,s),society=JSON.stringify(s),province=w.provinceId.slice(),sites=E.DragonRuins.sites(w,s);
  assert.equal(sites.length,3,spec.seed+' has enough genuinely eligible upland sites');assert.strictEqual(E.DragonRuins.sites(w,s),sites);
  for(const site of sites){
   assert.equal(site.provinceId,null);assert.equal(site.recipe.provinceId,null);assert.equal(site.recipe.style,'dragon-ruins');assert.equal(site.recipe.geography.sourceCell,site.i);assert.equal(site.recipe.geography.elevation,w.height[site.i]);assert.ok(site.keywords.includes('dragon')&&site.keywords.includes('龙族遗迹'));
   assert.ok(site.survey.relief<=70);assert.deepEqual(E.DragonRuins.survey(w,site.x,site.y),site.survey);
   for(const p of s.provinces)assert.ok(Math.hypot(p.x-site.x,p.y-site.y)>=3.2,'the ruin cannot be inserted into a present or potential town centre');
   for(const other of sites)if(other!==site)assert.ok(Math.hypot(other.x-site.x,other.y-site.y)>=18);
   const model=E.LandmarkTemplates.build(site.recipe,{base:false,lod:1});assert.equal(model.dragonRuins.variant,site.dragonRuins.variant);
  }
  const changed=structuredClone(s);for(const p of changed.provinces){p.pop*=1.1;p.settled=!p.settled;p.owner=-1;}for(const c of changed.realms)c.alive=false;
  assert.deepEqual(E.DragonRuins.sites(w,changed),sites,'ancient ruins cannot move when settlements grow or countries change');
  assert.deepEqual(E.DragonRuins.sites(structuredClone(w),structuredClone(s)),sites,'restoring the same world preserves every site and recipe');
  assert.deepEqual(fingerprints(w,s),before);assert.deepEqual(w.provinceId,province);assert.equal(JSON.stringify(s),society);
  if(spec.seed==='Aereth-47'){assert.equal(w.params.landformVersion,fantasyDefaults.landformVersion);assert.deepEqual(E.LandmarkBinding.inventory(w,s).filter(site=>site.dragonRuins),sites);}
  t.diagnostic(JSON.stringify({seed:spec.seed,sites:sites.map(site=>({name:site.name,x:site.x,y:site.y,elevation:site.recipe.geography.elevation,relief:site.survey.relief}))}));
 }
});
