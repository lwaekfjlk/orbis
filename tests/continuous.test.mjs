import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const E=Function(source+'\nreturn {generateWorld,createCivilization,generateCity,physicalFingerprint,settlementFingerprint,AtlasSpace,createCityRenderer,ContinuousCityLayer,AtlasRenderer,ArtisanCityKit,GW,GH,Geometry};')();
let w,s,city,p;
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});p=s.provinces[507];assert(p?.settled);city=E.generateCity(w,s,p.id);});
test('A single parent surface is preserved at every original grid vertex',()=>{
 for(let y=0;y<E.GH;y++)for(let x=0;x<E.GW;x++)assert(Math.abs(E.AtlasSpace.height(w,y*E.GW+x)-E.AtlasSpace.surface(w,x,y))<1e-10);
});
test('Subdivided terrain shares both sides of every original grid edge',()=>{
 for(let y=1;y<E.GH-1;y+=6)for(let x=1;x<E.GW-1;x+=5){for(const t of[.15,.5,.83]){const left=E.AtlasSpace.surface(w,x-1e-8,y+t),right=E.AtlasSpace.surface(w,x+1e-8,y+t);assert(Math.abs(left-right)<1e-6);}}
});
test('Terrain refinement follows the camera, stays on the parent surface and stays bounded',()=>{
 const meshes={};
 const r=Object.create(E.AtlasRenderer.prototype);
 Object.assign(r,{world:w,sim:s,layer:'relief',relief:1,zoom:1,width:1440,height:900,azimuth:.018,elevation:1.19,
  target:[0,0,0],meshes,options:{},upload(name,g){meshes[name]=g;}});
 const layer=new E.ContinuousCityLayer(r);layer.world=w;layer.sim=s;
 const detail={};
 for(const zoom of [1,3,6,12,30,90]){
  r.zoom=zoom;layer.buildTerrain();
  detail[zoom]=layer.terrainDetail;
  // A refinement that grows without bound would remesh the whole grid at 64x.
  assert(layer.terrainTriangles<4e5,`zoom ${zoom} produced ${layer.terrainTriangles} triangles`);
 }
 assert.equal(detail[1],1,'the whole world needs no extra triangles');
 assert(detail[12]>detail[3],'closing in must add detail');
 assert(detail[90]>=detail[12],'refinement must not fall back when closer');
 // The point of the refinement: more triangles, the SAME landscape. Every vertex
 // has to sit on the parent surface, and every normal has to be a unit vector.
 const d=meshes.terrain.data;let checked=0;
 for(let k=0;k<d.length;k+=9){
  const x=d[k],y=d[k+1],z=d[k+2];
  if(y<0)continue;
  const [gx,gy]=E.AtlasSpace.grid(x,z);
  if(gx<0||gx>E.GW-1||gy<0||gy>E.GH-1)continue;
  assert(Math.abs(y-E.AtlasSpace.surface(w,gx,gy))<1e-6,`vertex at ${gx},${gy} left the parent surface`);
  assert(Math.abs(Math.hypot(d[k+3],d[k+4],d[k+5])-1)<1e-5,'shading normals must be unit length');
  checked++;
 }
 assert(checked>1e5,'expected the whole terrain to be checked, saw '+checked);
});
test('Closing in fills the landscape in rather than emptying it',()=>{
 // Past 4.8 the atlas hides its own symbols — trees, dunes, glacier tongues, sea ice,
 // reeds — because they are sized for the whole map. Nothing replaced them outside a
 // loaded town's 22x18 cell box, so approaching a lake or a mountain showed LESS of it
 // than the world view did, and rivers were cut entirely past 14.
 const meshes={};
 globalThis.window={world:w,sim:s};
 const stub=Object.create(E.AtlasRenderer.prototype);
 Object.assign(stub,{world:w,sim:s,relief:1,zoom:1,width:1440,height:900,azimuth:.018,elevation:1.19,
  target:[0,0,0],meshes,options:{},layer:'relief',upload(n,g){meshes[n]={data:g.data,tris:g.data.length/27};},request(){}});
 const layer=new E.ContinuousCityLayer(stub);layer.world=w;layer.sim=s;
 const aim=q=>{stub.target=[(q.x/(E.GW-1)-.5)*168,0,(q.y/(E.GH-1)-.5)*98];};
 aim(p);
 // At world range there is no local scatter: the atlas symbols are still on.
 stub.zoom=1;layer.natural=false;layer.buildEnvironment();
 assert(!layer.environmentStats,'the world view is carried by the atlas symbols');
 assert(!meshes['cm:env:flora'],'and builds no local scatter');
 // Close in, and the ground has to be populated wherever the camera is looking.
 const seen=[];
 for(const zoom of [4.8,8,16,30,70]){
  stub.zoom=zoom;layer.natural=true;layer.buildEnvironment();
  const st=layer.environmentStats;
  assert(st,`no environment built at zoom ${zoom}`);
  // Ground cover, not trees specifically. What fills a landscape is what belongs in it:
  // this site is a dry basin under glacier-bearing cliffs and comes out at 1807 stones
  // to 130 plants at zoom 16, where a forested site comes out the other way round.
  assert(st.plants+st.stones>400,`only ${st.plants+st.stones} things on the ground at zoom ${zoom}`);
  // ...and the cost has to stay flat, or a remesh on every settle is unaffordable.
  assert(st.triangles<160000,`${Math.round(st.triangles)} triangles of scatter at zoom ${zoom}`);
  seen.push(st);
 }
 // The scatter is climate-driven, not one bush repeated: steep ground gets stone.
 assert(seen.some(st=>st.stones>50),'no rock scatter anywhere on the steep ground');
 // Rivers are no longer cut at 14, and the local layers answer their own toggles.
 stub.zoom=20;
 assert.equal(layer.visible('rivers'),true,'a river must survive the approach to it');
 assert.equal(layer.visible('cm:env:flora'),true);
 stub.options={trees:false};
 assert.equal(layer.visible('cm:env:flora'),false,'the scatter answers the forest toggle');
 delete globalThis.window;
});
test('The regional silhouette of a town is painted, not stamped',()=>{
 // TOWN_ZOOM to DETAIL_ZOOM is where a whole town is on screen, so it is the view most of the map is
 // read in — and every silhouette in every town on the world shared one hardcoded
 // beige wall and one slate roof, the wall not even asking which town it was in.
 const meshes={};
 globalThis.window={world:w,sim:s};
 const stub={relief:1,upload(name,g){meshes[name]={data:g.data};}};
 const layer=new E.ContinuousCityLayer(stub);layer.world=w;layer.sim=s;
 const model=layer.build(p);
 const data=meshes[`cm:${p.id}:silhouettes`].data;
 const seen=new Set();
 for(let k=0;k<data.length;k+=9)seen.add([6,7,8].map(j=>Math.round(data[k+j]*255)).join(','));
 assert(seen.size>model.city.buildings.length,`${seen.size} colours for ${model.city.buildings.length} buildings`);
 // The paint has to be the one the detailed mesh uses for the same building, or the
 // town changes colour as you close in.
 const first=model.city.buildings[0];
 const paint=E.ArtisanCityKit.blockPaint(model.city,first);
 const wall=[1,3,5].map(i=>Math.round(parseInt(paint.wall.slice(i,i+2),16)));
 assert(seen.has(wall.join(',')),'the silhouette must use the same wall paint as the detail');
 delete globalThis.window;
});
test('City coordinates refer to the actual Stonefall source and preserve nearby glacial relief',()=>{
 const h=E.physicalFingerprint(w),f=E.AtlasSpace.cityFrame(w,p,city);assert.equal(city.source.parentWorldCell,p.i);assert(city.siteEnvironment.glacialFoothills);assert(city.siteEnvironment.maxElevation>city.siteEnvironment.minElevation+1000);
 const center=E.AtlasSpace.point(w,p.x,p.y);assert.deepEqual(f.origin,center);
 for(const[x,z]of[[0,0],[city.width/2,city.depth/2],[-city.width/2,-city.depth/2]]){const a=f.at(x,z),v=f.vertex(x,f.localGround(x,z),z);assert(Math.abs(v[1]-E.AtlasSpace.surface(w,...a)-.003)<1e-9);assert.deepEqual(E.AtlasSpace.grid(v[0],v[2]).map(x=>+x.toFixed(6)),a.map(x=>+x.toFixed(6)));}
 assert.equal(E.physicalFingerprint(w),h);
});
test('Every building is seated in its own ground, with a rigid finite transformation',()=>{
 const f=E.AtlasSpace.cityFrame(w,p,city);
 // Blocks used to sit on their HIGHEST corner, which left the downhill side on a plinth
 // taller than the house. They now cut into the bank, so an uphill sample legitimately
 // stands above the anchor. What must still never happen is a block floating clear of the
 // parcel it was surveyed on, or perching on a plinth instead of cutting in.
 for(const b of city.buildings){const a=f.anchors.get(b.id);
  // .006 is the seating lift that keeps the slab off the terrain it stands on.
  assert(a&&a.y>=a.low-1e-9&&a.y<=a.top+.0061,b.id+' is anchored outside its own ground range');
  let seated=0;
  for(const dx of[-.5,0,.5])for(const dz of[-.5,0,.5]){const x=b.x+dx*b.w,z=b.z+dz*b.d;
   if(f.ground(x,z)<=a.y+1e-9)seated++;
   const v=f.vertex(x,b.y+b.h,z,a);assert(v.every(Number.isFinite));assert(Math.abs(v[1]-a.y-b.h*f.scale)<1e-9);}
  assert(seated>0,b.id+' floats clear of its own parcel');
  // The same .006 lift dominates on ground that is essentially level, where there is no
  // bank to cut into in the first place.
  if(!b.precinct)assert(a.y-a.low<=(a.top-a.low)*.5+.0061,b.id+' stands on a plinth instead of cutting into the bank');}
});
test('A sea lane holds a bearing, and never holds one across land',()=>{
 // The flood fill that finds a lane may only step N/S/E/W, so its raw path is a staircase
 // of single cells. Straightening it is only sound if every surviving leg is genuinely
 // navigable, so both halves are asserted together: a lane must be a handful of long legs,
 // AND no leg may cut a corner over land or pack ice.
 const routes=s.routes||[];assert(routes.length>10,'the world should open sea lanes at all');
 let crossings=0,worst=0;
 for(const r of routes){
  worst=Math.max(worst,r.path.length);
  for(let k=1;k<r.path.length;k++){
   const i=r.path[k-1],j=r.path[k],x0=i%E.GW,y0=i/E.GW|0,x1=j%E.GW,y1=j/E.GW|0;
   const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))*2;
   for(let t=1;t<steps;t++){
    const x=Math.round(x0+(x1-x0)*t/steps),y=Math.round(y0+(y1-y0)*t/steps),c=y*E.GW+x;
    if(w.height[c]>0||w.seaIce[c]>=.88)crossings++;
   }
  }
 }
 assert.equal(crossings,0,'a straightened leg cut across land or pack ice');
 const nodes=routes.map(r=>r.path.length).sort((a,b)=>a-b);
 assert(nodes[nodes.length>>1]<=8,`a lane should be a few long legs, median is ${nodes[nodes.length>>1]} nodes`);
 assert(worst<=40,`no lane should still be a staircase, longest is ${worst} nodes`);
});
test('Mesh collection does not request a second canvas or graphics context',()=>{
 globalThis.window={world:w,sim:s};globalThis.document={createElement(){throw Error('A second canvas was requested');}};
 const h=E.physicalFingerprint(w),pop=E.settlementFingerprint(s),collector=E.createCityRenderer(null,()=>{},{collectOnly:true});collector.setCity(city,p,s.realms[p.owner],s.cityState?.[p.id]||{});
 assert(collector.meshes.buildings.count>0);assert(collector.meshes.roofs.vertices.every(Number.isFinite));assert.equal(E.physicalFingerprint(w),h);assert.equal(E.settlementFingerprint(s),pop);delete globalThis.window;delete globalThis.document;
});
test('The folk and ship scales stay pinned to the town footprint',()=>{
 // folk-renderer sizes people and hulls in ATLAS units reconciled against the town
 // model, so it has to shrink with it. It cannot read AtlasSpace at module-eval time
 // (temporal dead zone in the concatenated bundle), so the literal is cross-checked.
 const src=readFileSync(resolve(root,'src/render/folk-renderer.js'),'utf8');
 const m=src.match(/const F = \.(\d+);/);
 assert(m,'folk-renderer must declare its footprint factor as a literal');
 assert.equal(Number('.'+m[1]),E.AtlasSpace.CITY_FOOTPRINT,'folk-renderer F has drifted from AtlasSpace.CITY_FOOTPRINT');
});
test('Exploration routes delegate to a camera operation, with no city dialog open',()=>{
 const c=readFileSync(resolve(root,'src/ui/city-ui.js'),'utf8');assert(c.includes('if(window.ContinuousMap?.active)return ContinuousMap.focusTown(id)'));
 const u=readFileSync(resolve(root,'src/ui/continuous-map.js'),'utf8');assert(!u.includes('.showModal('));assert(!u.includes("setScene('city')"));assert(!u.includes("setScene('landmark')"));assert(u.includes('max(1,pinch.d),.6,AtlasSpace.MAX_ZOOM'));
});
test('The cartographic quay hands over to the town waterfront, exactly where the town marker does',()=>{
 // A quay symbol is drawn to the same scale as the town marker beside it, which is about
 // forty ordinary buildings across. Leaving it on once the architecture resolves puts a
 // giant pier through the middle of the streets — which is what happened. The symbol
 // travels with the town marker, so pin them together rather than to a bare number.
 const layer=Object.create(E.ContinuousCityLayer.prototype);
 const at=zoom=>{layer.r={zoom,options:{},continuousRoofs:true};return layer;};
 for(const zoom of [1,3,4.7]){
  const l=at(zoom);
  assert.equal(l.visible('ports'),l.visible('settlements'),`at zoom ${zoom} the quay symbol must follow the town symbol`);
  assert.equal(l.visible('seaLanes'),l.visible('settlements'));
 }
 for(const zoom of [16,40,60,100,400]){
  const l=at(zoom);
  assert.equal(l.visible('settlements'),false,`town markers are already gone at zoom ${zoom}`);
  assert.equal(l.visible('ports'),false,`a quay symbol forty buildings across is still drawn at zoom ${zoom}`);
  assert.equal(l.visible('seaLanes'),false);
  // What replaces it is the town's own waterfront, at the town's own scale.
  assert.equal(l.visible('cm:7:port'),true,`the real waterfront must be showing by zoom ${zoom}`);
 }
 // And it is still the roads-and-ports toggle that turns it off.
 layer.r={zoom:30,options:{roads:false},continuousRoofs:true};
 assert.equal(layer.visible('cm:7:port'),false);
});
test('Geometry worker includes trusted modules and transfers reusable model buffers',()=>{
 const worker=readFileSync(resolve(root,'src/continuous/generated-worker.js'),'utf8');assert(worker.includes('self.onmessage'));assert(worker.includes('ContinuousCityLayer'));assert(worker.includes('self.postMessage'));
 // The road network and the walking crowd are built on the main thread, but the town
 // waterfront is town geometry, so the worker has to know how to make it.
 assert(worker.includes('RoadNetwork'));assert(worker.includes('city.port'));
});
test('The town waterfront streams into the atlas with the rest of the town',()=>{
 const src=readFileSync(resolve(root,'src/continuous/city-layer.js'),'utf8');
 const whitelist=src.match(/if\(!\[([^\]]+)\]\.includes\(name\)\)continue/)[1];
 assert(whitelist.includes("'port'"),'the port mesh must be copied into atlas coordinates');
 // It is a ground-hugging assembly, so it must NOT be in the rigid-anchor list that
 // seats compounds on a level deck; a quay follows the shore it was fitted to.
 assert(!/const rigid=\[[^\]]*'port'/.test(src));
 assert(/type!=='port'\|\|this\.r\.options\.roads!==false/.test(src),'the port follows the roads and ports toggle');
});
test('Figures and ground-seated roads change over at the existing detail threshold',()=>{
 const road=readFileSync(resolve(root,'src/render/road-renderer.js'),'utf8');
 assert(new RegExp('AtlasRenderer\\.FOLK_ZOOM\\s*=\\s*'+E.AtlasSpace.DETAIL_ZOOM).test(road),'the crowd threshold is the town-detail threshold');
 assert(/zoom>=AtlasSpace\.TOWN_ZOOM&&this\.r\.zoom<AtlasSpace\.DETAIL_ZOOM/.test(readFileSync(resolve(root,'src/continuous/city-layer.js'),'utf8')),'silhouettes still hand over at the same zoom');
 // The locked world renderer is extended, never edited.
 assert(/const priorBuild\s*=\s*AtlasRenderer\.prototype\.buildCivilization/.test(road));
 assert(/const priorVisible\s*=\s*AtlasRenderer\.prototype\.visible/.test(road));
});
