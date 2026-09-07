import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const E=Function(source+'\nreturn {generateWorld,createCivilization,generateCity,physicalFingerprint,settlementFingerprint,AtlasSpace,createCityRenderer,ContinuousCityLayer,GW,GH,Geometry};')();
let w,s,city,p;
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});p=s.provinces.find(p=>p.name==='Stonefall 5'&&p.settled);assert(p);city=E.generateCity(w,s,p.id);});
test('A single parent surface is preserved at every original grid vertex',()=>{
 for(let y=0;y<E.GH;y++)for(let x=0;x<E.GW;x++)assert(Math.abs(E.AtlasSpace.height(w,y*E.GW+x)-E.AtlasSpace.surface(w,x,y))<1e-10);
});
test('Subdivided terrain shares both sides of every original grid edge',()=>{
 for(let y=1;y<E.GH-1;y+=6)for(let x=1;x<E.GW-1;x+=5){for(const t of[.15,.5,.83]){const left=E.AtlasSpace.surface(w,x-1e-8,y+t),right=E.AtlasSpace.surface(w,x+1e-8,y+t);assert(Math.abs(left-right)<1e-6);}}
});
test('City coordinates refer to the actual Stonefall source and preserve nearby glacial relief',()=>{
 const h=E.physicalFingerprint(w),f=E.AtlasSpace.cityFrame(w,p,city);assert.equal(city.source.parentWorldCell,p.i);assert(city.siteEnvironment.glacialFoothills);assert(city.siteEnvironment.maxElevation>city.siteEnvironment.minElevation+1000);
 const center=E.AtlasSpace.point(w,p.x,p.y);assert.deepEqual(f.origin,center);
 for(const[x,z]of[[0,0],[city.width/2,city.depth/2],[-city.width/2,-city.depth/2]]){const a=f.at(x,z),v=f.vertex(x,f.localGround(x,z),z);assert(Math.abs(v[1]-E.AtlasSpace.surface(w,...a)-.003)<1e-9);assert.deepEqual(E.AtlasSpace.grid(v[0],v[2]).map(x=>+x.toFixed(6)),a.map(x=>+x.toFixed(6)));}
 assert.equal(E.physicalFingerprint(w),h);
});
test('Every building has a rigid elevated anchor and finite transformation',()=>{
 const f=E.AtlasSpace.cityFrame(w,p,city);
 for(const b of city.buildings){const a=f.anchors.get(b.id);assert(a&&a.y>=a.low);for(const dx of[-.5,0,.5])for(const dz of[-.5,0,.5]){const x=b.x+dx*b.w,z=b.z+dz*b.d;assert(a.y>=f.ground(x,z)-1e-9);const v=f.vertex(x,b.y+b.h,z,a);assert(v.every(Number.isFinite));assert(Math.abs(v[1]-a.y-b.h*f.scale)<1e-9);}}
});
test('Mesh collection does not request a second canvas or graphics context',()=>{
 globalThis.window={world:w,sim:s};globalThis.document={createElement(){throw Error('A second canvas was requested');}};
 const h=E.physicalFingerprint(w),pop=E.settlementFingerprint(s),collector=E.createCityRenderer(null,()=>{},{collectOnly:true});collector.setCity(city,p,s.realms[p.owner],s.cityState?.[p.id]||{});
 assert(collector.meshes.buildings.count>0);assert(collector.meshes.roofs.vertices.every(Number.isFinite));assert.equal(E.physicalFingerprint(w),h);assert.equal(E.settlementFingerprint(s),pop);delete globalThis.window;delete globalThis.document;
});
test('Exploration routes delegate to a camera operation, with no city dialog open',()=>{
 const c=readFileSync(resolve(root,'src/ui/city-ui.js'),'utf8');assert(c.includes('if(window.ContinuousMap?.active)return ContinuousMap.focusTown(id)'));
 const u=readFileSync(resolve(root,'src/ui/continuous-map.js'),'utf8');assert(!u.includes('.showModal('));assert(!u.includes("setScene('city')"));assert(!u.includes("setScene('landmark')"));assert(u.includes('max(1,pinch.d),.6,180'));
});
test('Geometry worker includes trusted modules and transfers reusable model buffers',()=>{
 const worker=readFileSync(resolve(root,'src/continuous/generated-worker.js'),'utf8');assert(worker.includes('self.onmessage'));assert(worker.includes('ContinuousCityLayer'));assert(worker.includes('self.postMessage'));
});
