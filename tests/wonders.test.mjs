import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
const root=new URL('../',import.meta.url);
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL(f,root),'utf8')).join('\n');
const E=Function(code+'\nreturn {SacredCityKit,LandmarkCatalog,LandmarkTemplates,TOWN_WONDERS,exportGeometryGLB};')();
const ids=E.SacredCityKit.wonderIds;
const recipe=id=>E.LandmarkCatalog.recipe('basilica','all-wonders-contract',{sacred:true,wonder:id,faith:'sun',crown:'native',geography:{freshwater:.7}});
const digest=model=>{const hash=createHash('sha256');for(const part of model.parts)hash.update(Buffer.from(Float32Array.from(part.geometry.data).buffer));return hash.digest('hex');};

test('the inspectable wonder registry covers every declared native wonder exactly once',()=>{
 const declared=[...new Set(Object.values(E.TOWN_WONDERS).flat().map(w=>w.id))].sort();
 assert.equal(ids.length,15);assert.deepEqual([...ids].sort(),declared);
 assert.equal(new Set(ids).size,ids.length);
 const preview=readFileSync(new URL('scripts/preview-architecture.mjs',root),'utf8');
 for(const id of ids)assert(preview.includes('value="'+id+'"'),id+' is missing from the reviewable comparison');
});

test('all fifteen authored wonders remain finite, distinct, bounded and reproducible at town detail',()=>{
 const hashes=new Set();
 for(const id of ids){
  const r=recipe(id),saved=JSON.stringify(r),a=E.SacredCityKit.build(r,{lod:1}),b=E.SacredCityKit.build(r,{lod:1});
  assert.equal(JSON.stringify(r),saved,id+' mutated its saved recipe');
  assert.equal(digest(a),digest(b),id+' is not reproducible');hashes.add(digest(a));
  assert(a.stats.triangles>3000&&a.stats.triangles<(id==='cathedral'?230000:120000),id+' town mesh budget');
  assert(a.parts.length>=4&&a.parts.some(p=>p.role==='roof'),id+' loses its roof partition');
  const height=a.bounds.max[1]-a.bounds.min[1],width=a.bounds.max[0]-a.bounds.min[0];
  assert(height>12&&height<70&&width>12&&width<52,id+' leaves the wonder scale contract');
  for(const p of a.parts){const d=p.geometry.data;for(let i=0;i<d.length;i+=9){
   for(let j=0;j<9;j++)assert(Number.isFinite(d[i+j]),id+' nonfinite vertex');
   assert(Math.abs(Math.hypot(d[i+3],d[i+4],d[i+5])-1)<1e-5,id+' invalid normal');
  }}
  if(id!=='cathedral')assert(a.signature.endsWith('/wonder-detail-1/'+id),id+' missing model revision');
 }
 assert.equal(hashes.size,ids.length,'two wonder identities collapsed to one assembly');
});

test('every wonder remains grounded inside a rotated native parcel with separate removable roofs',()=>{
 for(const id of ids)for(const angle of[.37,1.13]){
  const r=recipe(id),lot={x:18,y:7,z:-11,w:27,d:23,angle},m=E.SacredCityKit.miniature(r,lot);
  assert(m.body.data.length>0&&m.roof.data.length>0,id+' empty town body or roof');
  let bottom=Infinity;
  for(const g of[m.body,m.roof])for(let i=0;i<g.data.length;i+=9){const [x,y,z]=g.data.slice(i,i+3);bottom=Math.min(bottom,y);
   assert(x>=lot.x-lot.w/2-1e-5&&x<=lot.x+lot.w/2+1e-5,id+' exceeds x parcel');
   assert(z>=lot.z-lot.d/2-1e-5&&z<=lot.z+lot.d/2+1e-5,id+' exceeds z parcel');
   assert(y>=lot.y-(m.depth||0)-1e-5,id+' exceeds its declared underground depth');
  }
  if(m.excavation){assert(['forge-hollow','sunless-well'].includes(id));assert(m.depth>0);assert(Math.abs(bottom-m.excavation.floorY)<1e-5,id+' floor does not match its excavation');}
  else assert(Math.abs(bottom-lot.y)<1e-5,id+' floats above its foundation');
 }
});

test('every full-detail wonder exports named geometry with normals and colors, without images',()=>{
 for(const id of ids){
  const r=recipe(id),m=E.SacredCityKit.build(r,{lod:2}),buffer=E.exportGeometryGLB(E.LandmarkTemplates.meshes(m),{recipe:r,signature:m.signature}),dv=new DataView(buffer);
  assert.equal(dv.getUint32(0,true),0x46546c67);assert.equal(dv.getUint32(8,true),buffer.byteLength);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,dv.getUint32(12,true))));
  assert.equal(doc.meshes.length,m.parts.length,id);assert(!doc.images?.length&&!doc.textures?.length,id+' uses an image substitute');
  for(const mesh of doc.meshes){assert(mesh.name);for(const p of mesh.primitives)for(const key of['POSITION','NORMAL','COLOR_0'])assert(key in p.attributes,id+' missing '+key);}
 }
});
