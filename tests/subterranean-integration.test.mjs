import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const browser={},E=Function('window',source+'\nreturn {generateWorld,createCivilization,physicalFingerprint,settlementFingerprint,politicalFingerprint,ContinuousCityLayer,AtlasSpace,TownCityBinding,ExcavationTerrain,createCityRenderer};')(browser);
const rows=[];let world,sim,fingerprints,worker;
const fingerprint=()=>[E.physicalFingerprint(world),E.settlementFingerprint(sim),E.politicalFingerprint(sim)];
const hash=data=>createHash('sha256').update(Buffer.from(Float32Array.from(data).buffer)).digest('hex');
function yHits(vertices,x,z){const result=[];for(let i=0;i<vertices.length;i+=27){const a=vertices.slice(i,i+3),b=vertices.slice(i+9,i+12),c=vertices.slice(i+18,i+21),bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;if(Math.abs(det)<1e-12)continue;const s=((x-a[0])*cz-(z-a[2])*cx)/det,t=(bx*(z-a[2])-bz*(x-a[0]))/det;if(s>=-1e-7&&t>=-1e-7&&s+t<=1+1e-7)result.push(a[1]+s*(b[1]-a[1])+t*(c[1]-a[1]));}return result;}
function posed(model,b){const lo=model.bounds.min,hi=model.bounds.max,c=Math.cos(b.angle||0),s=Math.sin(b.angle||0),w=hi[0]-lo[0],d=hi[2]-lo[2],scale=Math.min(b.w/(Math.abs(c)*w+Math.abs(s)*d),b.d/(Math.abs(s)*w+Math.abs(c)*d))*.985,cx=(lo[0]+hi[0])/2,cz=(lo[2]+hi[2])/2;return {scale,at(x,y,z){return[b.x+((x-cx)*c-(z-cz)*s)*scale,b.y+y*scale,b.z+((x-cx)*s+(z-cz)*c)*scale]}};}
test.before(async()=>{
 world=await E.generateWorld(defaults);sim=E.createCivilization(world,{realms:18,historySeed:'First-dawn'});browser.world=world;browser.sim=sim;fingerprints=fingerprint();
 // Keep the original two excavated sites when display names change.
 for(const[name,id,cell]of[['Stormbeck',398,33970],['Pineshore',317,27560]]){const p=sim.provinces[id];assert.equal(p.i,cell,name+' fixture moved');const meshes={},renderer={relief:1,zoom:90,world,meshes,upload(name,g,shadow,unlit,alpha){meshes[name]={vertices:new Float32Array(g.data),shadow,unlit,alpha};}},layer=new E.ContinuousCityLayer(renderer);layer.world=world;layer.sim=sim;layer.natural=true;const model=layer.build(p);layer.models.set(p.id,model);
  const b=model.city.buildings.find(b=>['sunless-well','forge-hollow'].includes(b.wonder));assert.ok(b,name+' lacks its excavated wonder');const recipe=E.TownCityBinding.resolve(world,sim,p,model.city,b.type),placed=E.TownCityBinding.miniature(recipe,b),pose=posed(placed.model,b),anchor=model.frame.anchors.get(b.id),hole=model.excavations.find(h=>h.buildingId===b.id);assert.ok(hole,name+' lost its excavation metadata');
  rows.push({name,p,model,b,placed,pose,anchor,hole,layer,meshes});
 }
 const responses=[],self={postMessage(response,buffers){responses.push({response,buffers});}};Function('self','window',source+'\n'+readFileSync(new URL('../src/continuous/worker-body.js',import.meta.url),'utf8'))(self,self);worker={self,responses};
});
test('two actual cities preserve negative-depth geometry, parcel mapping and the inherited world',()=>{
 for(const row of rows){const{model,b,placed,pose,anchor,hole,meshes,name}=row;assert.ok(placed.depth>0);assert.ok(placed.height>0);
  const expectedFloor=anchor.y+(placed.excavation.floorY-b.y)*model.frame.scale;assert.ok(Math.abs(hole.floorY-expectedFloor)<1e-10,name+' floor mapping changed');
  for(const [x,z]of placed.excavation.outline){assert.ok(x>=b.x-b.w/2&&x<=b.x+b.w/2&&z>=b.z-b.d/2&&z<=b.z+b.d/2,name+' opening leaves its existing lot');const p=model.frame.vertex(x,placed.excavation.floorY,z,anchor);assert.ok(hole.outline.some(q=>Math.hypot(p[0]-q[0],p[2]-q[1])<1e-10),name+' opening uses a different transform from its model');}
  const details=meshes[`cm:${row.p.id}:details`].vertices,expected=[];for(let i=0;i<placed.body.data.length;i+=9){const d=placed.body.data,p=model.frame.vertex(Math.fround(d[i]),Math.fround(d[i+1]),Math.fround(d[i+2]),anchor);if(d[i+1]<b.y-.1)expected.push(p);}
  const key=p=>p.map(v=>Math.fround(v)).join(','),actual=new Set();for(let i=0;i<details.length;i+=9)actual.add(key(details.slice(i,i+3)));assert.ok(expected.length>100,name+' has no underground geometry');assert.ok(expected.every(p=>actual.has(key(p))),name+' underground vertices were stretched by the footing clamp');
  const sample=pose.at(b.wonder==='forge-hollow'?5:0,0,0),sampleAtlas=model.frame.vertex(...sample,anchor),visible=yHits(details,sampleAtlas[0],sampleAtlas[2]);assert.ok(visible.length>0);assert.ok(Math.max(...visible)<anchor.y-.05*model.frame.scale,name+' floor is capped by an above-ground surface');
  for(const kind of['buildings','streets','farms','cityWalls']){const data=meshes[`cm:${row.p.id}:${kind}`]?.vertices;if(data)assert.equal(yHits(data,sampleAtlas[0],sampleAtlas[2]).filter(y=>y>=anchor.y-.1*model.frame.scale).length,0,name+' '+kind+' fills the excavation');}
  const collector=E.createCityRenderer(null,()=>{},{collectOnly:true});collector.setCity(model.city,row.p,sim.realms[row.p.owner],{});assert.equal(yHits(collector.meshes.terrain.vertices,sample[0],sample[2]).length,0,name+' standalone city/export terrain still covers the opening');
 }assert.deepEqual(fingerprint(),fingerprints,'render-only excavation changed the physical or simulated world');
});
test('real worker payloads retain exactly the same excavation and geometry buffers for the two cities',async()=>{
 const workerWorld=structuredClone(world),workerSim=structuredClone(sim);
 for(let i=0;i<rows.length;i++){const{name,p,model,meshes}=rows[i];worker.self.onmessage({data:{id:i+1,...(i===0?{world:workerWorld}:{}),sim:workerSim,pid:p.id,relief:1}});const{response,buffers}=worker.responses.at(-1);assert.equal(response.error,undefined,response.stack);const payload=response.payload;assert.deepEqual(payload.excavations,model.excavations,name+' worker drops or remaps the hole');assert.deepEqual(payload.heights,model.heights,name+' worker changes ground-relative heights');
  for(const [key,mesh]of Object.entries(meshes)){assert.ok(payload.meshes[key],key);assert.equal(hash(payload.meshes[key].vertices),hash(mesh.vertices),key+' diverges from the main-thread build');assert.ok(buffers.includes(payload.meshes[key].vertices.buffer),key+' was not registered for transfer');}
  browser.Worker=true;browser.TELLURIC_TOWN_WORKER='trusted-test-payload';const receiver=new E.ContinuousCityLayer({world,relief:1,upload(){}});receiver.world=world;receiver.sim=sim;receiver.workerWorld=world;receiver.worker={postMessage(request){receiver.workerJobs.get(request.id).resolve(payload);}};
  const restored=await receiver.workerBuild(p),original=rows[i].anchor,restoredAnchor=restored.frame.anchors.get(rows[i].b.id);assert.equal(restoredAnchor.y,original.y,name+' hydrated UI anchor returns to the parcel summit');assert.deepEqual(restored.excavations,model.excavations,name+' UI hydration changes its opening');assert.equal(restored.heights[rows[i].b.id],model.heights[rows[i].b.id]);
 }assert.deepEqual(fingerprint(),fingerprints);
});
test('measure the rim and entrance against the canonical local surface at the existing parcel',t=>{
 for(const{name,model,b,placed,pose,anchor,hole,layer}of rows){const gaps=hole.outline.map(([x,z])=>{const[gx,gy]=E.AtlasSpace.grid(x,z);return anchor.y-E.AtlasSpace.surface(world,gx,gy,1);}),entry=placed.excavation.entrance,at=model.frame.vertex(entry[0],b.y,entry[1],anchor),entryGround=model.frame.ground(entry[0],entry[1]),artScale=pose.scale*model.frame.scale,center=[hole.outline.reduce((s,p)=>s+p[0],0)/hole.outline.length,hole.outline.reduce((s,p)=>s+p[1],0)/hole.outline.length],[gx,gy]=E.AtlasSpace.grid(...center);
  assert.equal(anchor.y,entryGround,name+' entrance is still raised above the parent surface');assert.equal(hole.groundY,entryGround,name+' opening datum disagrees with its anchor');assert.ok(Math.hypot(hole.entrance[0]-at[0],hole.entrance[1]-at[2])<1e-10,name+' entrance transform diverges');
  assert.ok(Number.isFinite(layer.ground(gx,gy))&&layer.ground(gx,gy)>=hole.floorY-1e-10,'ground picking falls below the modeled floor');
  t.diagnostic(JSON.stringify({city:name,wonder:b.wonder,parcel:[b.w,b.d],angle:b.angle,modelScale:pose.scale,atlasScale:model.frame.scale,canonicalArtScale:artScale,entryGapAtlas:at[1]-entryGround,entryGapArtUnits:(at[1]-entryGround)/artScale,rimGapArtMin:Math.min(...gaps)/artScale,rimGapArtMax:Math.max(...gaps)/artScale,depthArtUnits:(anchor.y-hole.floorY)/artScale}));
 }
});
