import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {ExcavationTerrain,ContinuousCityLayer,AtlasSpace,Geometry,GW,GH};')();
const H=E.ExcavationTerrain;
const vertex=(x,z)=>[x,2+x*.1+z*.2,z,0,1,0,.3+x*.02,.4+z*.02,.5];
const square=(x,z,r,floor=-2,id=1)=>H.prepare([[x-r,z-r],[x+r,z-r],[x+r,z+r],[x-r,z+r]],floor,id);
const area=g=>{let n=0;for(let i=0;i<g.data.length;i+=27){const d=g.data,a=[d[i],d[i+2]],b=[d[i+9],d[i+11]],c=[d[i+18],d[i+20]];n+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;}return n;};
function flatQuad(holes=[]){const g=new E.Geometry(),a=vertex(-2,-2),b=vertex(-2,2),c=vertex(2,2),d=vertex(2,-2);H.triangle(g,a,b,c,holes);H.triangle(g,a,c,d,holes);return g;}
function hasSurface(g,x,z){for(let i=0;i<g.data.length;i+=27){const[a,b,c]=[0,9,18].map(j=>g.data.slice(i+j,i+j+3)),ab=[b[0]-a[0],b[2]-a[2]],ac=[c[0]-a[0],c[2]-a[2]],det=ab[0]*ac[1]-ab[1]*ac[0];if(Math.abs(det)<1e-12)continue;
 const u=((x-a[0])*ac[1]-(z-a[2])*ac[0])/det,v=(ab[0]*(z-a[2])-ab[1]*(x-a[0]))/det;if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9)return true;
}return false;}

test('convex excavation subtraction preserves exact area and interpolates the existing terrain plane',()=>{
 const hole=square(.37,.16,.53),g=flatQuad([hole]);assert.ok(Math.abs(area(g)-(16-1.06**2))<1e-9,'cut only the polygon area, not whole intersecting triangles');
 assert.equal(hasSurface(g,.37,.16),false);assert.equal(hasSurface(g,.91,.16),true,'ground immediately outside the cut survives');
 for(let i=0;i<g.data.length;i+=9){const d=g.data,x=d[i],z=d[i+2];assert.ok(Math.abs(d[i+1]-(2+x*.1+z*.2))<1e-10);assert.ok(Math.abs(d[i+6]-(.3+x*.02))<1e-10);assert.ok(Math.abs(d[i+7]-(.4+z*.02))<1e-10);assert.ok(Math.abs(Math.hypot(...d.slice(i+3,i+6))-1)<1e-10);}
});
test('a tiny hole crossing a triangle diagonal is removed without deleting its surroundings',()=>{
 const hole=square(.123,.123,.003),g=flatQuad([hole]);assert.ok(Math.abs(area(g)-(16-.006**2))<1e-10);assert.equal(hasSurface(g,.123,.123),false);assert.equal(hasSurface(g,.127,.123),true);assert.equal(hasSurface(g,.123,.127),true);
});
test('multiple holes subtract their union and outside triangles stay byte-identical',()=>{
 const holes=[square(-.9,0,.3),square(.85,.1,.4)],g=flatQuad(holes);assert.ok(Math.abs(area(g)-(16-.6**2-.8**2))<1e-9);assert.equal(hasSurface(g,0,0),true);
 const overlap=flatQuad([square(0,0,.5),square(.5,0,.5)]);assert.ok(Math.abs(area(overlap)-14.5)<1e-9,'overlapping openings remove the union only once');
 const outside=flatQuad([square(20,20,1)]);assert.deepEqual(outside.data,flatQuad().data,'bbox rejection preserves original geometry exactly');
 const reversed=H.prepare([[1,1],[1,-1],[-1,-1],[-1,1]],-3,2);assert.equal(H.contains(reversed,0,0),true);assert.equal(H.contains(reversed,2,0),false);
});
test('town excavation outlines and floor use the same rigid anchor as their building',()=>{
 const anchor={y:6,b:{y:12}},frame={anchors:new Map([[7,anchor]]),vertex(x,y,z,a){return[100+x*.2,a.y+(y-a.b.y)*.3,50+z*.4];}};
 const local={buildingId:7,outline:[[1,2],[4,2],[4,6],[1,6]],floorY:-8};H.seat([local],frame);assert.equal(anchor.y,6,'legacy data without an entrance retains its original anchor');const holes=H.map([local],frame);assert.equal(holes.length,1);assert.deepEqual(holes[0].outline,[[100.2,50.8],[100.8,50.8],[100.8,52.4],[100.2,52.4]]);assert.equal(holes[0].floorY,0);assert.equal(holes[0].buildingId,7);
 assert.deepEqual(H.map([{...local,buildingId:9}],frame),[],'unknown building anchors cannot excavate the world');
});

function terrainFixture(){
 const count=E.GW*E.GH,w={height:new Float32Array(count).fill(100),lake:new Float32Array(count),ice:new Float32Array(count)},meshes={};
 const r={world:w,zoom:E.AtlasSpace.DETAIL_ZOOM,layer:'relief',relief:1,width:800,height:600,meshes,options:{},request(){},updateCamera(){},palette(){return[.3,.4,.5];},upload(name,g){meshes[name]=g;}};
 const layer=new E.ContinuousCityLayer(r);layer.world=w;layer.sim={};layer.tessellation=()=>1;layer.viewBox=()=>({x0:0,x1:1,y0:0,y1:1});r.buildTerrain=()=>layer.buildTerrain();
 const hole=square(0,0,.27,-2,7),model={p:{id:3,x:50,y:50},key:'test',excavations:[hole],meshNames:[],frame:{anchors:new Map()}};layer.models.set(3,model);
 return{layer,r,w,hole,model};
}
test('visible terrain opens only at detail LOD and eviction/reset restore the original surface',()=>{
 const{layer,r,w,model}=terrainFixture(),height=w.height.slice(),lake=w.lake.slice(),ice=w.ice.slice(),grid=E.AtlasSpace.grid(0,0);
 r.zoom=E.AtlasSpace.DETAIL_ZOOM-1;layer.buildTerrain();const original=r.meshes.terrain.data.slice(),closedKey=layer.terrainKey();assert.equal(hasSurface(r.meshes.terrain,0,0),true);assert.ok(layer.ground(...grid)>0);
 r.zoom=E.AtlasSpace.DETAIL_ZOOM;assert.notEqual(layer.terrainKey(),closedKey);layer.buildTerrain();assert.equal(hasSurface(r.meshes.terrain,0,0),false);assert.equal(hasSurface(r.meshes.terrain,.28,0),true);assert.equal(layer.ground(...grid),-2);assert.equal(layer.lowestFloor,-2);
 r.zoom--;layer.buildTerrain();assert.deepEqual(r.meshes.terrain.data,original,'regional LOD restores all original triangles');assert.equal(layer.lowestFloor,-.1);
 r.zoom++;layer.buildTerrain();layer.remove(3);assert.deepEqual(r.meshes.terrain.data,original,'evict immediately fills the opening');
 layer.models.set(3,model);layer.buildTerrain();layer.reset(w,{});assert.deepEqual(r.meshes.terrain.data,original,'reset restores terrain even when the same world object is retained');
 assert.deepEqual(w.height,height);assert.deepEqual(w.lake,lake);assert.deepEqual(w.ice,ice);
});
test('terrain keys and ground queries distinguish multiple loaded openings and leave exterior heights alone',()=>{
 const{layer,r,hole}=terrainFixture(),outside=E.AtlasSpace.grid(2,2),expected=E.AtlasSpace.coarseSurface(r.world,...outside);assert.equal(layer.ground(...outside),expected);
 const key=layer.terrainKey(),other=square(.8,.7,.16,-4,8);layer.models.get(3).excavations.push(other);assert.notEqual(layer.terrainKey(),key);assert.equal(layer.ground(...E.AtlasSpace.grid(.8,.7)),-4);assert.equal(layer.ground(...E.AtlasSpace.grid(0,0)),hole.floorY);assert.equal(layer.lowestFloor,-4);
});

test('excavated buildings preserve their rigid below-entry walls while ordinary slope footings still conform',()=>{
 const buildings=[{id:1,x:0,z:0,y:10,w:4,d:4,h:5},{id:2,x:10,z:0,y:10,w:4,d:4,h:5}],c={buildings,rivers:[],width:40,depth:40},frame={scale:.1,sx:.1,sz:.1,cells:1,ground:x=>x===7?1.5:1,anchors:new Map(buildings.map(b=>[b.id,{b,y:2,x:b.x*.1,z:0,scale:.1}]))};
 frame.vertex=(x,y,z,a)=>[x*.1,a.y+(y-a.b.y)*.1,z*.1];
 const vertices=[];for(const b of buildings)for(const p of[[b.x,9,0],[b.x+1,9,0],[b.x,9,1]])vertices.push(...p,0,1,0,.3,.4,.5);
 const collector={setCity(){},landmarkHeights:{},excavations:[{buildingId:1,outline:[[-2,-2],[2,-2],[2,2],[-2,2]],floorY:-10,entrance:[7,0]}],meshes:{buildings:{vertices,shadow:true}},buildingRanges:{buildings:[{start:0,end:27,id:1},{start:27,end:54,id:2}]}};
 const localSource=readFileSync(new URL('../src/continuous/city-layer.js',import.meta.url),'utf8');
 const Layer=Function('Geometry','AtlasSpace','generateCity','createCityRenderer','CityEnvironment','ArtisanCityKit','rgb','noise','hash2','GW','GH',localSource+'\nreturn ContinuousCityLayer;')(E.Geometry,{cityFrame:()=>frame},()=>c,()=>collector,{sample:()=>({water:true})},{blockPaint:()=>({wall:'wall',roof:'roof'})},()=>[.3,.4,.5],()=>0,()=>0,200,200);
 const meshes={},r={relief:1,upload(name,g){meshes[name]=g;}},layer=new Layer(r);layer.world={seed:1};layer.sim={realms:[{}]};layer.key=()=> 'qa';const m=layer.build({id:3,x:100,y:100,owner:0});
 assert.equal(m.excavations.length,1);assert.equal(m.excavations[0].floorY,-.5);assert.equal(m.excavations[0].groundY,1.5);assert.equal(frame.anchors.get(1).y,1.5);assert.equal(frame.anchors.get(2).y,2);
 const d=meshes['cm:3:buildings'].data;assert.ok(Math.abs(d[1]-1.4)<1e-12,'well wall remains rigid relative to its entry anchor');assert.ok(Math.abs(d[28]-.994)<1e-12,'ordinary foundation still follows the lower slope');
});
test('worker payload carries excavation outlines and main-thread installation retains them',async()=>{
 const hole={...square(.2,.4,.3,-5,2),groundY:2.75,entrance:[.2,.7]},responses=[],city={n:2,width:40,depth:40,span:1,height:new Float32Array(4),buildings:[{id:2,x:0,z:0,y:12,w:3,d:3,h:4}],context:{n:2,width:40,depth:40},xy(){}};
 const self={postMessage(response,buffers){responses.push({response,buffers});}},workerSource=readFileSync(new URL('../src/continuous/worker-body.js',import.meta.url),'utf8');
 class WorkerLayer{constructor(r){this.r=r;}build(){this.r.upload('cm:1:buildings',{data:new Array(27).fill(0)});return{city,heights:{},triangles:1,excavations:[hole]};}}
 Function('self','ContinuousCityLayer',workerSource)(self,WorkerLayer);self.onmessage({data:{id:4,world:{},sim:{provinces:[{id:0}]},pid:0,relief:1}});
 const payload=responses[0].response.payload;assert.deepEqual(payload.excavations,[hole]);assert.equal(typeof payload.city.xy,'undefined');assert.ok(responses[0].buffers.length>0,'geometry keeps its transferable payload');
 const prior=globalThis.window;globalThis.window={Worker:true,TELLURIC_TOWN_WORKER:'test'};
 try{const{layer,r,w}=terrainFixture();layer.key=()=> 'worker-qa';layer.world=w;layer.workerWorld=w;
  layer.worker={postMessage(request){layer.workerJobs.get(request.id).resolve(payload);}};
  const m=await layer.workerBuild({id:1,x:30,y:30});assert.deepEqual(m.excavations,[hole]);assert.ok(m.meshNames.includes('cm:1:buildings'));assert.equal(m.frame.anchors.get(2).y,2.75,'hydrated camera/pick anchor exactly matches the worker entry height');
 }finally{globalThis.window=prior;}
});
test('selection ground caches invalidate with terrain and roof/road switches do not close visible pits',()=>{
 const{layer,r}=terrainFixture();r.selectionKey='stale';layer.buildTerrain();assert.equal(r.selectionKey,null);const key=layer.terrainKey();
 r.continuousRoofs=false;r.options.roads=false;assert.equal(layer.activeExcavations().length,1);assert.equal(layer.terrainKey(),key);r.zoom=E.AtlasSpace.DETAIL_ZOOM-1;assert.equal(layer.activeExcavations().length,0);
});

test('ray breakpoints bracket both edges of a narrow opening and include its floor plane',()=>{
 const{layer}=terrainFixture();layer.models.get(3).excavations=[square(0,0,.0001,-2,7)];
 const origin=[-1,3,0],dir=[1,-5,0],cuts=layer.groundBreakpoints(origin,dir,0,2);
 for(const t of[.9999,1,1.0001]){assert.ok(cuts.some(v=>Math.abs(v-t)<1e-10),'missing boundary/floor '+t);assert.ok(cuts.some(v=>v<t&&Math.abs(v-t)<2e-7),'no sample before '+t);assert.ok(cuts.some(v=>v>t&&Math.abs(v-t)<2e-7),'no sample after '+t);}
 assert.deepEqual(cuts,cuts.slice().sort((a,b)=>a-b));assert.ok(cuts.every(v=>v>0&&v<2));
 const limited=layer.groundBreakpoints(origin,dir,1,1.0001);assert.ok(limited.every(v=>v>1&&v<1.0001),'all edge-side samples respect caller bounds');
});
test('vertical ground rays receive the well floor even without any XZ edge intersections',()=>{
 const{layer,r}=terrainFixture(),cuts=layer.groundBreakpoints([0,3,0],[0,-1,0],0,8);
 assert.deepEqual(cuts,[5-1e-7,5,5+1e-7]);assert.deepEqual(layer.groundBreakpoints([2,3,2],[0,-1,0],0,8),[],'outside rays do not gain fictitious floors');
 r.zoom=E.AtlasSpace.DETAIL_ZOOM-1;assert.deepEqual(layer.groundBreakpoints([0,3,0],[0,-1,0],0,8),[],'regional silhouettes restore ordinary ground picking');
});

test('rotated excavation entrances seat on their own surface sample without lifting ordinary buildings',()=>{
 for(const angle of[0,Math.PI/2,Math.PI*.73]){
  const entry=[10-Math.sin(angle)*3,20+Math.cos(angle)*3],anchor={y:9,b:{y:12}},ordinary={y:8,b:{y:12}},frame={anchors:new Map([[7,anchor],[8,ordinary]]),ground:(x,z)=>3+x*.02-z*.01,vertex:(x,y,z,a)=>[100+x*.2,a.y+(y-a.b.y)*.3,50+z*.4]};
  const item={buildingId:7,outline:[[8,18],[12,18],[12,22],[8,22]],floorY:-8,entrance:entry},expected=frame.ground(...entry);
  H.seat([item],frame);assert.equal(anchor.y,expected,'seat at the rotated threshold, not the parcel centre or high point');assert.equal(ordinary.y,8);H.seat([item],frame);assert.equal(anchor.y,expected,'seating is idempotent');
  const hole=H.map([item],frame)[0];assert.equal(hole.groundY,expected);assert.deepEqual(hole.entrance,[100+entry[0]*.2,50+entry[1]*.4]);assert.equal(hole.floorY,expected-6);
  const restored={anchors:new Map([[7,{y:20}],[8,{y:8}]])};H.restore([hole],restored);assert.equal(restored.anchors.get(7).y,expected);assert.equal(restored.anchors.get(8).y,8);
 }
});

test('a renderer world replacement never samples stale excavation floors before the layer binds',()=>{
 const{layer,r}=terrainFixture(),grid=E.AtlasSpace.grid(0,0);assert.equal(layer.ground(...grid),-2);
 const replacement={height:new Float32Array(E.GW*E.GH).fill(900),lake:new Float32Array(E.GW*E.GH),ice:new Float32Array(E.GW*E.GH)};r.world=replacement;
 assert.deepEqual(layer.activeExcavations(),[]);assert.equal(layer.lowestFloor,-.1);assert.equal(layer.ground(...grid),E.AtlasSpace.coarseSurface(replacement,...grid));assert.deepEqual(layer.groundBreakpoints([0,3,0],[0,-1,0],0,8),[]);
 layer.world=null;assert.equal(layer.ground(...grid),E.AtlasSpace.coarseSurface(replacement,...grid),'initial renderer world is readable before bind');
});
