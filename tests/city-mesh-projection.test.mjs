import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {CityMeshProjection,AtlasSpace,Geometry,GW,GH};')();
const bytes=v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
// The original public-helper path is the reference for coordinates, normals,
// rejection of collapsed faces and the distinct rigid / footing semantics.
function reference(data,ranges,frame,excavated){
 const g=new E.Geometry();let ri=0;
 for(let k=0;k<data.length;k+=27){
  while(ri<ranges.length&&ranges[ri].end<=k)ri++;
  const range=ranges[ri],anchor=range&&range.start<=k?frame.anchors.get(range.id):null,points=[];
  for(let j=0;j<3;j++){const t=k+j*9,q=frame.vertex(data[t],data[t+1],data[t+2],anchor,range?.footing);
   if(anchor&&!range.footing&&!excavated.has(range.id)&&data[t+1]<anchor.b.y-.015)q[1]=Math.min(q[1],frame.ground(data[t],data[t+2])-.006);
   points.push(q);
  }
  g.tri(points[0],points[1],points[2],[data[k+6],data[k+7],data[k+8]]);
 }
 return new Float32Array(g.data);
}

test('direct city projection preserves every uploaded float for slopes, ownership and excavation',()=>{
 const height=Float32Array.from({length:E.GW*E.GH},(_,i)=>900+Math.sin(i%E.GW/3)*240+Math.cos(Math.floor(i/E.GW)/4)*170),world={height,lake:new Float32Array(height.length).fill(-1),ice:new Float32Array(height.length)},p={x:150,y:90};
 const buildings=[{id:'rigid',x:-5,z:0,w:5,d:4,y:7},{id:'court',x:4,z:2,w:6,d:5,y:9}],city={n:5,width:24,depth:20,terrainSpan:1.2,buildings,height:Float32Array.from({length:25},(_,i)=>i%5*.9+Math.floor(i/5)*.7)};
 const frame=E.AtlasSpace.cityFrame(world,p,city),g=new E.Geometry(),ranges=[];
 const emit=(id,footing)=>{const b=buildings.find(b=>b.id===id),start=g.data.length;
  for(let i=0;i<6;i++){const z=b.z-1+i*.25;g.tri([b.x-1,b.y-(id==='court'?.02:1.1),z],[b.x+1,b.y+.4,z],[b.x,b.y+2,z+.4],[.35+i*.03,.55,.72]);}
  ranges.push({id,start,end:g.data.length,...(footing?{footing}:{})});
 };
 emit('rigid',{depth:2.7});emit('rigid');emit('court');
 // Unowned roads and decorations follow the ground instead of a house anchor.
 for(let i=0;i<6;i++)g.tri([-2,3,4],[2,4,4],[1,3,6],[.6,.4,.2]);
 const input=new Float32Array(g.data),snapshot=input.slice(),excavated=new Set(['court']);
 const result=E.CityMeshProjection.mesh(input,ranges,frame,excavated).data,wanted=reference(input,ranges,frame,excavated);
 assert.deepEqual(bytes(result),bytes(wanted));assert.deepEqual(input,snapshot);
 assert(result.every(Number.isFinite));assert(result instanceof Float32Array);
 // A below-ground court must not inherit the ordinary footing's terrain clamp.
 assert.notDeepEqual(bytes(result),bytes(E.CityMeshProjection.mesh(input,ranges,frame,new Set()).data));
});

test('repeated terrain vertices are sampled once and collapsed faces retain the old rejection rule',()=>{
 const g=new E.Geometry();for(let i=0;i<60;i++)g.tri([0,0,0],[2,0,0],[0,0,2],[.4,.5,.6]);
 // This triangle is valid locally but too small after projection, just as in
 // the existing collector. No uninitialised tail may become uploaded geometry.
 g.data.push(...g.data.slice(0,27).map((v,i)=>i%9<3?v*1e-8:v));
 let samples=0;
 const f={origin:[1,2,3],sx:.01,sz:.02,scale:.015,anchors:new Map(),localGround:(x,z)=>x*.1-z*.2,
  ground(x,z){samples++;return 2+x*.3-z*.2+x*z*.05;},
  vertex(x,y,z){return[this.origin[0]+x*this.sx,this.ground(x,z)+(y-this.localGround(x,z)+E.AtlasSpace.BUILDING_LIFT)*this.scale,this.origin[2]+z*this.sz];}};
 const input=new Float32Array(g.data),result=E.CityMeshProjection.mesh(input,[],f).data,cached=samples;samples=0;
 const wanted=reference(input,[],f,new Set());
 assert.deepEqual(bytes(result),bytes(wanted));assert.equal(result.length,60*27);
 assert(cached<=5,'shared ground coordinates need one sample each');assert(samples>cached*20);
 const snapshot=result.slice();input.fill(0);assert.deepEqual(result,snapshot,'upload storage is independent of collector memory');
});
