import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './engine-loader.mjs';
const E = loadEngine();
function renderer() {
 const r = Object.create(E.AtlasRenderer.prototype);
 Object.assign(r, {world:{}, width:1280, height:800, zoom:1, elevation:1.19, azimuth:.018, relief:1, target:[0,0,0], selected:-1, meshes:{}, uploads:0, frames:0,
  ground:()=>0, request(){this.frames++;}, upload(name,g){this.meshes[name]={vertices:g.data};this.uploads++;this.dirtyShadow=true;}});
 return r;
}
function screenBounds(r) {
 const xs=[],ys=[],d=r.meshes.selection.vertices,m=r.mvp;
 for(let i=0;i<d.length;i+=9){const x=d[i],y=d[i+1],z=d[i+2];xs.push((m[0]*x+m[4]*y+m[8]*z+m[12])*r.width/2);ys.push((m[1]*x+m[5]*y+m[9]*z+m[13])*r.height/2);}
 return [Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
}
test('a previously selected ground ring stays compact through town and building zoom and resize',()=>{
 const r=renderer();r.select(90*E.GW+150);
 for(const [width,height] of [[1280,800],[390,844],[2560,1440]])for(const zoom of [.6,1,12,86.4,180,620]){
  Object.assign(r,{width,height,zoom});r.updateCamera();
  const bounds=screenBounds(r);
  assert(bounds.every(v=>Number.isFinite(v)&&v>0&&v<=13.4),`${width}×${height} at ${zoom}: ${bounds}`);
  if(zoom>=12)assert(bounds[0]>=13,'the small ring remains visible at close zoom');
  // Its raised centre must not become a floating annotation hundreds of pixels up.
  const lift=r.meshes.selection.vertices[1]*height/(2*r.halfH);
  assert(lift<=.91&&lift>0);
 }
});
test('camera refresh does not queue frames or re-upload an unchanged ring, and clearing persists',()=>{
 const r=renderer();r.select(90*E.GW+150);const uploads=r.uploads,frames=r.frames;
 for(let i=0;i<5;i++)r.updateCamera();
 assert.equal(r.uploads,uploads);assert.equal(r.frames,frames);
 r.dirtyShadow=false;r.zoom=180;r.updateCamera();assert.equal(r.uploads,uploads+1);assert.equal(r.frames,frames);assert.equal(r.dirtyShadow,false);
 r.dirtyShadow=true;r.zoom=200;r.updateCamera();assert.equal(r.dirtyShadow,true);
 r.select(-1);assert.equal(r.meshes.selection.vertices.length,0);const cleared=r.uploads;
 r.zoom=620;r.updateCamera();assert.equal(r.uploads,cleared);assert.equal(r.meshes.selection.vertices.length,0);
});
