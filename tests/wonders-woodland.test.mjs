import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
const engine=Function(scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n')+'\nreturn {LandmarkCatalog,SacredCityKit};')();
const ids=['grove-sanctuary','reed-throne','whale-moot','water-pagoda','tide-palace'];
const build=(id,lod=1,roofPitch=1)=>engine.SacredCityKit.build({...engine.LandmarkCatalog.recipe('basilica','woodland-structure-qa',{complexity:lod,roofPitch,geography:{freshwater:.8}}),sacred:true,wonder:id},{lod});
const models=Object.fromEntries(ids.map(id=>[id,build(id)]));
const hash=m=>{const h=createHash('sha256');for(const p of m.parts)h.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));return h.digest('hex');};
function faces(model,partId){const result=[];for(const part of model.parts){if(partId&&part.id!==partId)continue;const d=part.geometry.data;for(let j=0;j<d.length;j+=27)result.push({points:[0,9,18].map(i=>d.slice(j+i,j+i+3)),normal:d.slice(j+3,j+6),color:d.slice(j+6,j+9),part});}return result;}
// Intersect a ray parallel to one axis with each triangle, in model coordinates.
function hits(model,part,axis,u,v){const dims=[0,1,2].filter(i=>i!==axis),[x,y]=dims,result=[];for(const {points:[a,b,c],normal,color}of faces(model,part)){
 const bx=b[x]-a[x],by=b[y]-a[y],cx=c[x]-a[x],cy=c[y]-a[y],det=bx*cy-by*cx;if(Math.abs(det)<1e-8)continue;
 const s=((u-a[x])*cy-(v-a[y])*cx)/det,t=(bx*(v-a[y])-by*(u-a[x]))/det;if(s>=-1e-6&&t>=-1e-6&&s+t<=1+1e-6)result.push({at:a[axis]+s*(b[axis]-a[axis])+t*(c[axis]-a[axis]),normal,color});
 }return result;}
const has=(values,wanted,epsilon=.03)=>values.some(v=>Math.abs(v.at-wanted)<epsilon);

test('all five woodland and water wonders have distinct, deterministic structural detail at city LOD',()=>{
 const expected={
  'grove-sanctuary':['branch-supported-canopy-hall','floor-level-canopy-walk','trunk-carried-spiral-stair','layered-leaf-canopy'],
  'reed-throne':['cross-braced-tidal-pilings','reed-hall-knee-braced-bays','seated-reed-roof-lantern','covered-reed-landing','timber-reed-screen-hall'],
  'whale-moot':['curved-whalebone-rib-vault','weatherproof-hull-shell','tiered-moot-assembly','carved-whale-prow-portal'],
  'water-pagoda':['founded-water-pagoda-plinth','bracket-carried-pagoda-eaves','continuous-dry-water-stair','carved-sluice-outlets'],
  'tide-palace':['continuous-palace-quays','inhabited-canal-front-loggia','pier-borne-sea-gate','tide-gate-lifting-gear']};
 const shapes=new Set();
 for(const id of ids){const m=models[id];for(const name of expected[id])assert.ok(m.stats.modules[name],id+': '+name);for(const p of m.parts)for(const v of p.geometry.data)assert.ok(Number.isFinite(v),id);
  assert.ok(m.stats.triangles<60000,id+' exceeds the authored city geometry budget');assert.ok(m.bounds.max[0]-m.bounds.min[0]<52,id+' exceeds parcel width');assert.ok(m.bounds.max[1]-m.bounds.min[1]>18,id+' loses its landmark silhouette');
  assert.equal(hash(m),hash(build(id)),id+' is not deterministic');shapes.add(hash(m));assert.ok(m.parts.some(p=>p.role==='roof'),id+' has no removable roof group');
 }assert.equal(shapes.size,ids.length);
});
test('grove halls rest on broad collars and circulation reaches their actual floor levels',()=>{
 const m=models['grove-sanctuary'];
 for(const [x,z,floor,r]of[[0,-8,19.5,2.5],[-10.5,1,15.5,2],[10.5,1,15.5,2],[-6,10,12.5,1.7],[6,10,12.5,1.7]]){
  const collar=hits(m,'bearing-trees',1,x+r*2.58,z);assert.ok(has(collar,floor),`hall at ${x},${z} lacks a bearing collar`);assert.ok(has(collar,floor-.5),'the collar is a solid slab');
 }
 const walk=faces(m,'canopy-circulation');assert.ok(walk.some(f=>f.normal[1]>.5&&f.points.some(p=>Math.abs(p[1]-19.5)<.01)),'canopy walk misses the high hall floor');assert.ok(walk.some(f=>f.normal[1]>.5&&f.points.some(p=>Math.abs(p[1]-12.5)<.01)),'canopy walk misses the lower hall floor');
 for(let j=0;j<41;j++){const a=-Math.PI/2+(j+.5)*Math.PI*3/41,treads=hits(m,'canopy-circulation',1,Math.cos(a)*4.2,-8+Math.sin(a)*4.2),top=2+(j+1)*17.5/42;assert.ok(has(treads,top)||has(treads,top+17.5/42),'spiral stair has a walking-line gap after tread '+j);}
 const frontWindow=hits(m,'bearing-trees',2,.06,21.0).filter(v=>v.normal[2]>.9).sort((a,b)=>b.at-a.at)[0],glass=[0x2c,0x37,0x45].map(v=>v/255);
 assert.ok(frontWindow&&frontWindow.color.every((v,i)=>Math.abs(v-glass[i])<1e-8),'a structural post still covers the grove window glazing');
 // The ornamental grove stays behind/outside the architecture instead of covering the central hall.
 const leaves=faces(m,'leaf-crown').flatMap(f=>f.points);assert.ok(leaves.filter(p=>p[1]>15).every(p=>Math.abs(p[0])>6),'a tree crown still swallows the central hall');
});
test('reed deck posts meet the deck and the roof lantern has a supported open chamber',()=>{
 const m=models['reed-throne'],pier=hits(m,'piling-field',1,15,12);assert.ok(has(pier,-2.5)&&has(pier,2.7)&&has(pier,3.2),'pile/deck elevations do not join');
 const lantern=hits(m,'reed-hall-roof',1,2.35,-3.1);assert.ok(has(lantern,18.5),'lantern has no floor seat');assert.ok(lantern.some(v=>v.at>20.65&&v.at<20.95),'lantern columns do not reach the eave');
 assert.ok(m.parts.filter(p=>p.role!=='roof').every(p=>p.bounds.max[1]<18.5),'lantern parts hover after hiding the roof');
 const porch=hits(m,'landing-wings',1,2.25,13.7);assert.ok(has(porch,3.2),'entry porch has no supporting pile');assert.ok(porch.some(v=>v.at>7.2),'entry porch lost its roof-bearing frame');
});
test('whale moot has a continuous outward-facing hull shell and a clear processional entrance',()=>{
 const m=models['whale-moot'],roof=faces(m,'rib-vault-roof');assert.ok(roof.filter(f=>f.normal[1]>.6).length>100,'hull has no substantial upward-facing roof');
 for(const z of[-10,-5,0,5,8]){const shell=hits(m,'rib-vault-roof',1,0,z);assert.ok(shell.some(v=>v.normal[1]>.7&&v.at>11),'hull roof has a longitudinal hole');assert.ok(shell.some(v=>v.normal[1]<-.7&&v.at>11),'hull is missing its inner soffit');}
 assert.equal(hits(m,'prow-portal',2,0,4).length,0,'front portal blocks entry');assert.ok(hits(m,'prow-portal',2,2.2,4).length>0,'front portal has no load-bearing jamb');
});
test('water pagoda is founded and all seven eaves have physical underside thickness',()=>{
 const m=models['water-pagoda'],foundation=hits(m,'flooded-terraces',1,0,0);assert.ok(has(foundation,0)&&has(foundation,7),'tower plinth does not reach the ground and first storey');
 for(let j=0;j<7;j++){const y=10.1+j*4.1,r=6.4-j*.62,edge=hits(m,'stacked-eaves-roof',1,r+1.45,0);assert.ok(edge.some(v=>v.at>y-.21&&v.at<y+.4&&v.normal[1]>0),'pagoda eave '+j+' has no top surface');assert.ok(edge.some(v=>v.at>y-.21&&v.at<y&&v.normal[1]<0),'pagoda eave '+j+' has no soffit');}
 for(let j=0;j<6;j++){const core=hits(m,'stacked-eaves',1,1,0),bottom=10.1+j*4.1;assert.ok(has(core,bottom)&&has(core,bottom+1),'roof cutaway opens a gap in storey '+j);}
 for(let j=0;j<20;j++){const tread=hits(m,'flooded-terraces',1,0,14.2-j*.28);assert.ok(Math.abs(Math.max(...tread.map(v=>v.at))-(j+1)*.28)<.03,'water terrace buries stair tread '+j);}
 // Successive upper steps meet the porch, rather than continuing into the tower's solid core.
 const entry=hits(m,'sluice-court',1,0,6.75);assert.ok(has(entry,7),'upper stair has no doorway landing');
});
test('tide gate stays open to boats and its galleries rest on piers beside the opening',()=>{
 const m=models['tide-palace'];assert.equal(hits(m,'sea-gate',2,0,4).length,0,'sea gate blocks the boat channel');
 assert.ok(hits(m,'sea-gate',2,5.05,4).length>0,'central gatehouse floats without piers');assert.ok(hits(m,'sea-gate',2,0,9).length>0,'gatehouse vanished above the opening');
 for(const x of[-10,10]){const deck=hits(m,'sea-gate',1,x,19.5);assert.ok(has(deck,7.4),'flanking gallery has no walkable deck');}
 for(const pitch of[.65,1,1.35]){const variant=build('tide-palace',1,pitch);for(const z of[-10.42,-17.58]){const seat=hits(variant,'chancery-loggia',1,0,z);assert.ok(has(seat,10.8)&&has(seat,10.9),'cupola drum loses its cornice support at pitch '+pitch+' and z '+z);}}
 const balcony=hits(m,'chancery-loggia',1,0,-4.4);assert.ok(has(balcony,4.93),'waterfront balcony has no solid floor');assert.ok(has(balcony,7.9),'upper loggia has no roof-bearing cornice');
});
