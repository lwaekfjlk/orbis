import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const root=new URL('../',import.meta.url),assetRoot=new URL('assets/wonders/',root);
const E=Function(scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL(f,root),'utf8')).join('\n')+'\nreturn {SacredCityKit,LandmarkTemplates};')();
const manifest=JSON.parse(readFileSync(new URL('manifest.json',assetRoot),'utf8'));
function readGLB(file){
 const bytes=readFileSync(new URL(file,assetRoot));assert.equal(bytes.readUInt32LE(0),0x46546c67,file+' magic');assert.equal(bytes.readUInt32LE(4),2,file+' version');assert.equal(bytes.readUInt32LE(8),bytes.length,file+' length');
 let json,bin;for(let offset=12;offset<bytes.length;){const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+size);assert.equal(chunk.length,size,file+' truncated chunk');if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));if(type===0x004e4942)bin=chunk;offset+=8+size;}
 assert(json&&bin,file+' requires JSON and binary geometry');return{json,bin,bytes};
}
function attribute(doc,bin,index){
 const a=doc.accessors[index],view=doc.bufferViews[a.bufferView];assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');assert.equal(view.buffer,0);
 const output=new Float32Array(a.count*3),stride=view.byteStride||12,start=(view.byteOffset||0)+(a.byteOffset||0);
 for(let vertex=0;vertex<a.count;vertex++)for(let axis=0;axis<3;axis++)output[vertex*3+axis]=bin.readFloatLE(start+vertex*stride+axis*4);
 return output;
}
function expectedAttribute(data,offset){
 const out=new Float32Array(data.length/3);for(let vertex=0;vertex<data.length/9;vertex++)for(let axis=0;axis<3;axis++){
  const value=Math.fround(data[vertex*9+offset+axis]);out[vertex*3+axis]=offset===6?Math.pow(Math.max(0,Math.min(1,value)),2.2):value;
 }return out;
}

test('the published asset directory pairs one recipe and GLB with every registered wonder',()=>{
 const ids=[...E.SacredCityKit.wonderIds].sort();assert.equal(manifest.length,ids.length);assert.deepEqual(manifest.map(row=>row.wonder).sort(),ids);
 const names=readdirSync(assetRoot);assert.deepEqual(names.filter(n=>n.endsWith('.glb')).sort(),ids.map(id=>id+'.glb').sort());assert.deepEqual(names.filter(n=>n.endsWith('.recipe.json')).sort(),ids.map(id=>id+'.recipe.json').sort());
});

test('saved wonder recipes reproduce the paired full-detail GLB without an explicit LOD override',()=>{
 for(const row of manifest){
  const recipe=JSON.parse(readFileSync(new URL(row.recipe,assetRoot),'utf8'));
  assert.equal(recipe.wonder,row.wonder);assert.equal(recipe.complexity,2,row.wonder+' must save its exported detail');assert.equal(row.lod,recipe.complexity);
  // This is the ordinary recipe-import path. Passing {lod:2} here would hide a
  // mismatch between the persisted recipe and the shipped mesh again.
  const model=E.LandmarkTemplates.build(recipe),{json,bin,bytes}=readGLB(row.file);
  assert.equal(row.triangles,model.stats.triangles,row.wonder+' replay triangle count');assert.equal(row.parts,model.parts.length);assert.equal(row.signature,model.signature);assert.equal(row.bytes,bytes.length);assert.deepEqual(row.bounds,model.bounds);
  assert.deepEqual(json.asset.extras.recipe,recipe,row.wonder+' embedded recipe differs');assert.equal(json.asset.extras.signature,model.signature);assert.equal(json.meshes.length,model.parts.length);
  const parts=new Map(model.parts.map(p=>[p.id,p]));
  for(const mesh of json.meshes){const part=parts.get(mesh.name);assert(part,row.wonder+' unknown exported part '+mesh.name);parts.delete(mesh.name);assert.equal(mesh.primitives.length,1);const primitive=mesh.primitives[0];assert.equal(primitive.mode,4);
   for(const [name,offset]of[['POSITION',0],['NORMAL',3],['COLOR_0',6]]){
    const actual=attribute(json,bin,primitive.attributes[name]),expected=expectedAttribute(part.geometry.data,offset);
    assert.equal(actual.length,expected.length,row.wonder+'/'+mesh.name+' '+name+' vertex count');
    assert.ok(Buffer.from(actual.buffer).equals(Buffer.from(expected.buffer)),row.wonder+'/'+mesh.name+' '+name+' differs from the saved recipe');
   }
  }
  assert.equal(parts.size,0,row.wonder+' omitted a construction module');
 }
});
