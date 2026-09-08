import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {LandmarkKit,LandmarkCatalog}=Function(['src/world/geography.js','src/render/world-renderer.js','src/landmarks/catalog.js','src/landmarks/kit.js'].map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n')+'\nreturn {LandmarkKit,LandmarkCatalog};')();
const recipe=()=>LandmarkCatalog.recipe('river','construction-qa',{roofPitch:1});
function build(lod,fn){const k=new LandmarkKit(recipe(),{lod});k.part('specimen','Construction specimen','architecture',()=>fn(k));return k.finish()}
function faces(model){return model.parts.flatMap(p=>{const result=[],d=p.geometry.data;for(let i=0;i<d.length;i+=27)result.push({points:[0,9,18].map(j=>d.slice(i+j,i+j+3)),normal:d.slice(i+3,i+6),color:d.slice(i+6,i+9),part:p});return result})}
function closed(model,label){const edges=new Map();let volume=0;for(const {points:[a,b,c]}of faces(model)){
 const keys=[a,b,c].map(p=>p.map(v=>Math.round(v*1e7)).join(','));
 for(let j=0;j<3;j++){const edge=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1)}
 volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 }
 assert.ok(edges.size>0,label);assert.equal([...edges.values()].filter(n=>n%2).length,0,label+' has an uncapped edge');assert.ok(volume>0,label+' must have outward oriented volume');
 for(const part of model.parts)for(const value of part.geometry.data)assert.ok(Number.isFinite(value),label+' has nonfinite geometry');
}
function rayZ(model,x,y){return faces(model).some(({points:[a,b,c]})=>{
 const ab=[b[0]-a[0],b[1]-a[1]],ac=[c[0]-a[0],c[1]-a[1]],det=ab[0]*ac[1]-ab[1]*ac[0];if(Math.abs(det)<1e-9)return false;
 const px=x-a[0],py=y-a[1],u=(px*ac[1]-py*ac[0])/det,v=(ab[0]*py-ab[1]*px)/det;return u>=0&&v>=0&&u+v<=1;
 })}

test('all roof languages are closed volumes and every attached edge remains removable with the roof',()=>{
 for(const lod of[0,1,2])for(const kind of['hip','gable','leaf','northern','upturned','deepeave','vault','conic','parapet','rockcut']){
  const model=build(lod,k=>k.roof(0,0,0,8,10,3,'roof',kind));closed(model,kind+' LOD '+lod);assert.ok(model.parts.every(p=>p.role==='roof'));
 }
});
test('pitched surfaces face the light and the eave has physical depth at town LOD',()=>{
 const color=[.21,.32,.43];for(const kind of['hip','gable','northern','leaf','deepeave']){
  const model=build(0,k=>k.roof(0,0,0,4,6,2,color,kind));const slopes=faces(model).filter(f=>f.color.every((c,i)=>c===color[i])&&Math.abs(f.normal[1])>.05);
  assert.ok(slopes.length>=2);assert.ok(slopes.every(f=>f.normal[1]>0),kind+' slope normal points into the building');assert.ok(model.bounds.min[1]<-.05);
  // The whole small roof, including a closed ridge and thick fascia, stays small.
  assert.ok(model.stats.triangles<100,kind+' exhausts the ordinary town roof budget');
 }
});
test('deep eaves shade narrow wings without widening in proportion to the long facade',()=>{
 for(const lod of[0,1,2])for(const [w,d]of[[3,18],[18,3],[6,6]]){
  const m=build(lod,k=>k.roof(0,0,0,w,d,2,'roof','deepeave')),span=Math.min(w,d),axis=w<=d?0:2;
  const reach=m.bounds.max[axis]-span*.55;
  assert(reach>span*.19,'the deep canopy keeps substantial shelter beyond a pitched roof');
  assert(reach<span*.24,'the long wing cannot force excessive sideways overhang');
  closed(m,`deep-eave ${w}x${d} LOD ${lod}`);
 }
});
test('turned stone, a moulded column and all dome details have finite closed geometry',()=>{
 for(const lod of[0,1,2])for(const name of['cylinder','cone','column','dome']){const model=build(lod,k=>k[name](0,0,0,2,4));closed(model,name+' LOD '+lod);assert.ok(model.bounds.max[1]<=5);assert.ok(model.bounds.min[1]>=0);if(name==='dome')assert.ok(model.parts.every(p=>p.role==='roof'))}
 const distant=build(0,k=>k.dome(0,0,0,2,4)),near=build(1,k=>k.dome(0,0,0,2,4));assert.ok(distant.stats.triangles<near.stats.triangles*.4,'Far domes should omit the costly ribs');
});
test('an open arch remains passable, with solid springers and a closed crown',()=>{
 for(const lod of[0,1,2]){const model=build(lod,k=>k.arch(0,0,0,2,4,.5));closed(model,'arch');assert.equal(rayZ(model,0,1.4),false);assert.equal(rayZ(model,1.12,1.4),true);assert.equal(rayZ(model,0,4.10),true)}
});
test('deep windows have sealed reveals and a sill projecting beyond the glazing',()=>{
 for(const style of['arch','lattice'])for(const lod of[1,2]){const model=build(lod,k=>k.window(0,0,0,.7,1.2,0,style));closed(model,style+' window');
  const dark=LandmarkKit.prototype.color.call({palette:LandmarkCatalog.palettes.limestone},'dark');
  const glazing=faces(model).filter(f=>f.color.every((c,i)=>c===dark[i])).flatMap(f=>f.points);assert.ok(glazing.length>0);assert.ok(model.bounds.max[2]>Math.max(...glazing.map(p=>p[2]))+.10);
 }
});
test('hall openings face outward on both sides and stay below the roof on small halls',()=>{
 for(const [w,d,h]of[[2.6,3.3,1.8],[8,10,6.2]]){const model=build(1,k=>k.hall(0,0,0,w,d,h)),dark=LandmarkCatalog.palettes.limestone.dark;
  const darkColor=[1,3,5].map(i=>parseInt(dark.slice(i,i+2),16)/255),lights=faces(model).filter(f=>f.color.every((c,i)=>c===darkColor[i])).flatMap(f=>f.points);
  assert.ok(lights.some(p=>p[0]>w/2+.04),'east lights face outward');assert.ok(lights.some(p=>p[0]<-w/2-.04),'west lights face outward');
  assert.ok(model.parts.filter(p=>p.role!=='roof').every(p=>p.bounds.max[1]<=h+.001),'Openings must fit below the eave');
  assert.deepEqual(model.parts.map(p=>p.geometry.data),build(1,k=>k.hall(0,0,0,w,d,h)).parts.map(p=>p.geometry.data),'Geometry preserves seeded determinism');
 }
});
