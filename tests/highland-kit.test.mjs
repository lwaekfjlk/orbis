import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const {HighlandCityKit:Kit,cityFootingMesh,Geometry}=Function(source+'\nreturn {HighlandCityKit,cityFootingMesh,Geometry};')();
const kinds={dragon:['keep','gate','watch','roost','forge','lodge','store'],holy:['sanctuary','gate','bell','chapel','hospice','scriptorium','store']};

test('every highland role stays deterministic, rigid and within its parcel at both map LODs and five rotations',t=>{
 let count=0;
 for(const [kind,roles]of Object.entries(kinds))for(const highRole of roles)for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5,.37])for(const lod of [0,2]){
  const b={id:'parcel-proof',highRole,angle,lod,x:7,z:-3,y:2.8,w:4.1,d:3.3};
  const c={highCitadel:{kind},townRecipe:{seed:'highland-geometry-proof'}};
  const a=Kit.compound(b,c),again=Kit.compound(b,c);assert.deepEqual(a.body.data,again.body.data);assert.deepEqual(a.roof.data,again.roof.data);
  assert.ok(a.body.data.length&&a.roof.data.length,kind+'/'+highRole+' needs an independently toggleable roof');
  assert.equal(a.structures,1);assert.equal(a.depth,0);assert.ok(a.height>1&&a.height<16);
  for(const mesh of [a.body,a.roof])for(let i=0;i<mesh.data.length;i+=9){const v=mesh.data;
   for(let j=0;j<9;j++)assert.ok(Number.isFinite(v[i+j]),'finite position, normal and material');
   assert.ok(Math.abs(v[i]-b.x)<=b.w/2+1e-8,kind+'/'+highRole+' exceeds parcel x');
   assert.ok(Math.abs(v[i+2]-b.z)<=b.d/2+1e-8,kind+'/'+highRole+' exceeds parcel z');
   assert.ok(v[i+1]>=b.y-1e-8,kind+'/'+highRole+' excavates its base');
  }
  count++;
 }
 assert.equal(count,140);t.diagnostic('140 role × LOD × rotation combinations fit their surveyed parcel.');
});

test('regional models retain the authored silhouettes while nearby detail stays within a small-town budget',()=>{
 const signatures=new Set();
 for(const [kind,roles]of Object.entries(kinds))for(const role of roles){
  const low=Kit.build(kind,role,'budget',{lod:0}),high=Kit.build(kind,role,'budget',{lod:2});
  assert.ok(low.stats.triangles>350&&low.stats.triangles<5000,kind+'/'+role+' regional geometry budget');
  assert.ok(high.stats.triangles>low.stats.triangles&&high.stats.triangles<12500,kind+'/'+role+' detail geometry budget');
  assert.ok(high.parts.some(p=>p.role==='roof'));
  assert.equal(high.groundY,0);assert.match(high.signature,new RegExp('/highland-'+kind+'-'+role+'-1$'));
  signatures.add(high.signature);
 }
 assert.equal(signatures.size,14,'unrelated roles must not alias the same model identity');
});

function rayHit(model,origin,dir){
 const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 for(const part of model.parts){const data=part.geometry.data;for(let i=0;i<data.length;i+=27){
  const a=data.slice(i,i+3),b=data.slice(i+9,i+12),c=data.slice(i+18,i+21),e1=sub(b,a),e2=sub(c,a),p=cross(dir,e2),det=dot(e1,p);if(Math.abs(det)<1e-8)continue;
  const tv=sub(origin,a),u=dot(tv,p)/det;if(u<0||u>1)continue;const q=cross(tv,e1),v=dot(dir,q)/det;if(v<0||u+v>1)continue;if(dot(e2,q)/det>1e-6)return true;
 }}return false;
}

test('the summit gates and bell chamber have real open passages, and crowns belong to the removable roof',()=>{
 for(const kind of ['dragon','holy'])for(const lod of [0,2]){
  const gate=Kit.build(kind,'gate','open-passages',{lod});assert.equal(rayHit(gate,[0,1.4,5],[0,0,-1]),false,kind+' gate should admit a person along its central passage');
 }
 // The centre line carries the real bell suspension: pass just beside it.
 for(const lod of [0,2]){const bell=Kit.build('holy','bell','open-bell',{lod});assert.equal(rayHit(bell,[.28,7.15,3],[0,0,-1]),false,'the upper bell chamber should be open beside its hanging bell');}
 const keep=Kit.build('dragon','keep','crown',{lod:2});assert.ok(keep.stats.modules['deep-crown-porch']);
 assert.ok(keep.parts.filter(p=>p.role==='roof').some(p=>p.modules.includes('segmented-dragon-crown')));
 assert.ok(!keep.parts.filter(p=>p.role!=='roof').some(p=>p.modules.includes('segmented-dragon-crown')));
 assert.ok(Kit.build('dragon','roost','landing',{lod:0}).stats.modules['supported-roost']);
 assert.ok(Kit.build('holy','sanctuary','pilgrimage',{lod:0}).stats.modules['high-pilgrimage-sanctuary']);
 assert.ok(Kit.build('holy','scriptorium','reading',{lod:2}).stats.modules['scriptorium-bay']);
});

test('steep summit foundations retain open gaps with stout stone piers inside the same ground-contact footprint',()=>{
 const b={id:'stone-footing',highRole:'lodge',angle:0,lod:2,x:0,z:0,y:3,w:3.1,d:3.2,foundationBed:0,terrainFall:3};
 const model=Kit.compound(b,{highCitadel:{kind:'dragon'},townRecipe:{seed:'footing'}}),stone=new Geometry(),ordinary=new Geometry();
 const high=cityFootingMesh(stone,b,model,[.6,.6,.6]),low=cityFootingMesh(ordinary,{...b,highRole:undefined},model,[.6,.6,.6]);
 assert.equal(high.mode,'piers');assert.equal(low.mode,'piers');assert.equal(high.depth,low.depth);assert.deepEqual(high.contact,low.contact);
 assert.ok(high.pierWidth>low.pierWidth*2,'stone supports must be visibly broader than a light stilt');
 assert.ok(high.pierWidth<Math.min(b.w,b.d)*.2,'support must still leave open gaps');
 for(let i=0;i<stone.data.length;i+=9){assert.ok(Math.abs(stone.data[i])<=b.w/2);assert.ok(Math.abs(stone.data[i+2])<=b.d/2);assert.ok(stone.data[i+1]<=b.y);}
});

test('summit paint is repeatable, keeps the two identities distinct, and accepts inherited roof snow',()=>{
 const b={id:'climate-proof',highRole:'lodge',x:0,z:0},dragon={highCitadel:{kind:'dragon'},townRecipe:{seed:'palette'}},holy={...dragon,highCitadel:{kind:'holy'}};
 assert.deepEqual(Kit.paint(dragon,b),Kit.paint(dragon,b));assert.notEqual(Kit.paint(dragon,b).wall,Kit.paint(holy,b).wall);assert.notEqual(Kit.paint(dragon,b).roof,Kit.paint(holy,b).roof);
 const dry=Kit.build('dragon','keep','snow',{lod:2,climate:{cold:.8,load:.5,cover:0}}),snowy=Kit.build('dragon','keep','snow',{lod:2,climate:{cold:.8,load:.5,cover:.75}});
 const triangles=m=>m.parts.filter(p=>p.role==='roof').reduce((s,p)=>s+p.geometry.data.length/27,0);
 assert.ok(triangles(snowy)>triangles(dry),'inherited snow should add a removable roof shell');
});
