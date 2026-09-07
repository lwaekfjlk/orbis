import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// The authored template must remain usable without city/atlas clipping helpers.
const files=['src/world/geography.js','src/render/world-renderer.js','src/render/export-glb.js','src/landmarks/catalog.js','src/landmarks/kit.js','src/landmarks/templates.js'];
const E=Function(files.map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n')+'\nreturn {LandmarkCatalog,LandmarkTemplates,exportGeometryGLB};')();
const recipe=E.LandmarkCatalog.recipe('labyrinth','the-ninth-stair-datum',{roofPitch:1});
const build=(lod=1,base=false)=>E.LandmarkTemplates.build(recipe,{lod,base});
const digest=m=>{const h=createHash('sha256');for(const p of m.parts)h.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));return h.digest('hex');};
function hits(model,axis,u,v,include=()=>true){const dims=[0,1,2].filter(n=>n!==axis),[x,y]=dims,result=[];for(const part of model.parts.filter(include)){const d=part.geometry.data;for(let i=0;i<d.length;i+=27){const a=d.slice(i,i+3),b=d.slice(i+9,i+12),c=d.slice(i+18,i+21),bx=b[x]-a[x],by=b[y]-a[y],cx=c[x]-a[x],cy=c[y]-a[y],det=bx*cy-by*cx;if(Math.abs(det)<1e-8)continue;
 const s=((u-a[x])*cy-(v-a[y])*cx)/det,t=(bx*(v-a[y])-by*(u-a[x]))/det;if(s>=-1e-7&&t>=-1e-7&&s+t<=1+1e-7)result.push({at:a[axis]+s*(b[axis]-a[axis])+t*(c[axis]-a[axis]),part:part.id});
 }}return result;}
const top=(m,x,z)=>Math.max(...hits(m,1,x,z).map(h=>h.at));
test('The Ninth Stair retains a ground datum, convex opening and real negative-depth court at every LOD',()=>{
 for(const lod of[0,1,2]){const m=build(lod);assert.equal(m.groundY,0);assert.equal(m.excavation.floorY,-6.25);assert.equal(m.bounds.min[1],-6.25);assert.ok(m.bounds.max[1]>8,'ground pylons disappeared');assert.ok(m.bounds.max[0]-m.bounds.min[0]<35,'the excavation outgrew its existing footprint');
  const p=m.excavation.outline;let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],c=p[(i+2)%p.length];area+=a[0]*b[1]-b[0]*a[1];assert.ok((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>0,'outline must be CCW and convex');}assert.ok(area>0);
  assert.equal(top(m,0,-5),-6,'the courtyard floor is covered');assert.equal(top(m,5,0),-6,'side of excavation has a false ground floor');
  for(const part of m.parts)for(const v of part.geometry.data)assert.ok(Number.isFinite(v));assert.ok(m.stats.modules['continuous-underground-stair']);assert.ok(m.stats.modules['recessed-underground-threshold']);
 }
});
test('both the specimen ground tiles and thick site base are cut around the excavation',()=>{
 for(const lod of[0,1,2]){const m=build(lod,true);for(const [x,z]of[[0,-5],[5,0],[-5,5]]){assert.equal(hits(m,1,x,z,p=>p.role==='site').length,0,'illustrative ground still fills the hole');assert.equal(top(m,x,z),-6);}
  assert.ok(hits(m,1,20,0,p=>p.role==='site').some(h=>h.at>.08),'the surrounding terrain was removed with the excavation');
 }
});
test('each stair tread descends from the entrance and joins the next without a gap or buried top',()=>{
 const m=build(1,true);assert.ok(Math.abs(top(m,0,12.5)-.09)<1e-6,'entry should remain at the surrounding ground');
 for(let j=0;j<24;j++){const z=12-(j+.5)*.58;assert.ok(Math.abs(top(m,0,z)+(j+1)*.25)<1e-6,'tread '+j+' is raised or buried');if(j<23){const seam=12-(j+1)*.58;assert.ok(hits(m,1,0,seam,p=>p.id==='descending-stair').some(h=>Math.abs(h.at+(j+1)*.25)<1e-6),'gap after tread '+j);}}
 assert.equal(top(m,0,-2.4),-6,'lower landing does not meet the court');
});
test('the underground doorway is open to a recessed tunnel while camps remain outside the hole',()=>{
 const m=build(1,true),portal=hits(m,2,0,-3,p=>p.id==='portal').map(h=>h.at);assert.ok(portal.length>0,'there is no rear wall');assert.ok(Math.max(...portal)<-13,'doorway is painted onto a solid front wall');
 for(const part of m.parts.filter(p=>p.id.startsWith('survey-camp')))for(let i=0;i<part.geometry.data.length;i+=9){const x=part.geometry.data[i],z=part.geometry.data[i+2];assert.ok(Math.abs(x)>=9||z>=12||z<=-14,'a ground building blocks the excavation');}
});
test('replay and pure GLB export retain the authored underground geometry',()=>{
 const m=build(1,true);assert.equal(digest(m),digest(build(1,true)));const bytes=E.exportGeometryGLB(E.LandmarkTemplates.meshes(m),{groundY:m.groundY,excavation:m.excavation}),view=new DataView(bytes),json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,view.getUint32(12,true))));
 assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(8,true),bytes.byteLength);assert.equal(json.asset.extras.groundY,0);assert.equal(json.asset.extras.excavation.floorY,-6.25);assert.ok(json.accessors.some(a=>a.min?.[1]===-6.25));assert.equal(json.images,undefined);assert.equal(json.textures,undefined);
 for(const id of['river','delve','mountain'])assert.equal(E.LandmarkTemplates.build(E.LandmarkCatalog.recipe(id,'datum-control'),{lod:0,base:false}).excavation,undefined,'unrelated structures were classified as excavations');
});
