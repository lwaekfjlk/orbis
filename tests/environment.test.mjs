import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine,defaults,root} from './engine-loader.mjs';
const E=loadEngine(),digest=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
let w,s,p,c,geo,society;const report={version:'9.1.0',seed:defaults.seed,checks:{}};
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});p=s.provinces[507];assert(p?.city);geo=E.physicalFingerprint(w);society=JSON.stringify(s);c=E.generateCity(w,s,p.id);});
test('Stonefall is a dry basin beside glacier-bearing mountains, not a hot-desert theme',()=>{
 assert.equal(p.i,38502);assert.equal(c.siteEnvironment.biome,14);assert(c.siteEnvironment.temperature>0);assert.equal(c.siteEnvironment.ice,0);
 assert(c.siteEnvironment.glacialFoothills);assert(c.siteEnvironment.nearestGlacier<=3.1);assert(c.siteEnvironment.maxElevation>6000);
 assert.equal(c.townRecipe.style,'mountain');assert(!E.TownCatalog.allowed(p,w,'desert'));assert.throws(()=>E.generateCity(w,s,p.id,{style:'desert'}),/incompatible/);
 assert.equal(E.auditCity(c).iceBuildings,0);assert(c.environment.ice.some(x=>x>25));assert(new Set(c.environment.biome).size>3);
 report.site={id:p.id,name:p.name,sourceCell:p.i,siteTemperature:c.siteEnvironment.temperature,siteBiome:'Salt basin',siteIce:c.siteEnvironment.ice,closestGlacierGridDistance:c.siteEnvironment.nearestGlacier,maximumSurroundingElevation:c.siteEnvironment.maxElevation,oldStyle:'desert',newStyle:c.townRecipe.style,buildingCount:c.buildings.length,localBiomes:[...new Set(c.environment.biome)],iceSampleCount:Array.from(c.environment.ice).filter(x=>x>25).length};
 report.checks.stonefall=true;
});
test('local biome, temperature, ice and surface color are sampled from parent coordinates',()=>{
 let samples=0;
 for(let k=0;k<c.n*c.n;k+=29){const x=k%c.n,y=Math.floor(k/c.n),gx=p.x+(x/(c.n-1)-.5)*c.span,gy=p.y+(y/(c.n-1)-.5)*c.span*c.depth/c.width,expected=E.CityEnvironment.sample(w,gx,gy);
  for(const key of ['temperature','aridity','rain','ice','bed','surface'])assert(Math.abs(c.environment[key][k]-expected[key])<Math.max(.002,Math.abs(expected[key])*1e-6),key);
  assert.equal(c.environment.parentIndex[k],expected.parentIndex);assert.equal(c.environment.biome[k],expected.biome);
  for(let j=0;j<3;j++)assert(Math.abs(c.environment.color[k*3+j]-expected.color[j])<1e-6);samples++;
 }
 const center=(c.n*c.n-1)/2;assert.equal(c.environment.biome[center],w.biome[p.i]);assert.equal(c.environment.temperature[center],w.temp[p.i]);
 assert(c.environment.snow[center]===0);report.checks.exactParentSampling={samples};
});
test('changing four architectural families and seeds never repaints or changes physical surroundings',()=>{
 const hashes=[];
 for(const style of ['mountain','river','arcane','basalt']){
  const next=E.generateCity(w,s,p.id,{style,seed:'same-site-'+style});hashes.push(next.fingerprint);
  for(const key of ['height','water','waterKind'])assert.equal(digest(next[key]),digest(c[key]),key);
  for(const key of ['color','biome','temperature','ice','snow'])assert.equal(digest(next.environment[key]),digest(c.environment[key]),key);
  assert.equal(next.environment.signature,c.environment.signature);assert.equal(next.context.signature,c.context.signature);
 }
 assert.equal(new Set(hashes).size,4);report.checks.architectureIndependentGeography={styles:4,signature:c.environment.signature,contextSignature:c.context.signature};
});
test('province-average climate cannot overwrite settlement and hillside climate',()=>{
 const altered=structuredClone(s),q=altered.provinces[p.id];q.temp=40;q.aridity=.01;q.altitude=0;
 const next=E.generateCity(w,altered,p.id);
 assert.equal(next.townRecipe.style,'mountain');assert.equal(next.environment.signature,c.environment.signature);assert.equal(next.source.temperature,w.temp[p.i]);assert.equal(next.source.altitude,w.height[p.i]);
 report.checks.provinceAverageIgnored=true;
});
test('legacy hot-desert saved designs adapt without modifying saves or the physical world',()=>{
 const old=structuredClone(s);old.townRecipes={[p.id]:{format:'telluric-town-recipe',version:1,style:'desert',seed:'old-stonefall',variety:.6,provinceId:p.id,sourceCell:p.i}};const snapshot=JSON.stringify(old);
 const next=E.generateCity(w,old,p.id);assert.equal(next.townRecipe.style,'mountain');assert(next.townRecipe.compatibilityNote.includes('Legacy'));assert.equal(next.townRecipe.seed,'old-stonefall');assert.equal(JSON.stringify(old),snapshot);assert.equal(E.physicalFingerprint(w),geo);
 const saved=structuredClone(s);saved.townRecipes={[p.id]:JSON.parse(JSON.stringify(next.townRecipe))};assert.equal(E.generateCity(w,saved,p.id).fingerprint,next.fingerprint);report.checks.legacyRecipeMigration=true;
});
test('context joins the town at the same geographic coordinates, without arbitrary backdrop peaks',()=>{
 const g=c.context;let checked=0;
 for(let y=0;y<c.n;y++)for(let x=0;x<c.n;x++){
  if(x!==0&&x!==c.n-1&&y!==0&&y!==c.n-1)continue;
  const a=y*c.n+x,b=(y+g.innerStart)*g.n+x+g.innerStart;
  assert.equal(c.environment.parentIndex[a],g.parentIndex[b]);
  assert(Math.abs(c.environment.surface[a]-g.surface[b])<.002);
  for(let j=0;j<3;j++)assert(Math.abs(c.environment.color[a*3+j]-g.color[b*3+j])<1e-6);
  assert(Math.abs(c.height[a]-g.height[b])<.001);checked++;
 }
 report.checks.contextSeam={edgeSamples:checked};
});
test('all existing towns avoid glacier footprints; foliage and fields respect local conditions',()=>{
 let count=0;
 for(const q of s.provinces.filter(q=>q.city)){
  const next=E.generateCity(w,s,q.id);assert.equal(E.auditCity(next).iceBuildings,0,q.name);
  for(const t of next.trees){const i=next.index(t.x,t.z);assert(next.environment.ice[i]<=5);assert(next.environment.treeDensity[i]>0);}
  for(const f of next.farms){const i=next.index(f.x,f.z);assert(next.environment.ice[i]<=1);assert(next.environment.temperature[i]>=3);}
  count++;
 }
 assert.equal(count,96);assert.equal(E.physicalFingerprint(w),geo);assert.equal(JSON.stringify(s),society);report.checks.allTowns={count,parentWorldUnchanged:true,civilizationUnchanged:true};
});
test('world and town surface colors share the same land resolver, including ice and cold deserts',()=>{
 let checked=0;for(let i=0;i<E.GN;i+=17){if(w.height[i]<=0)continue;
  const actual=E.AtlasRenderer.prototype.palette.call({world:w,layer:'relief'},i),expected=E.CityEnvironment.sample(w,i%E.GW,Math.floor(i/E.GW)).color;
  for(let j=0;j<3;j++)assert(Math.abs(actual[j]-expected[j])<1e-6);checked++;
 }
 report.checks.sharedWorldCityPalette={samples:checked};
});
test.after(()=>writeFileSync(resolve(root,'docs/ENVIRONMENT_RESULTS.json'),JSON.stringify(report,null,2)));
