import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root} from './engine-loader.mjs';

const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const {SacredCityKit,LandmarkKit}=Function(code+'\nreturn {SacredCityKit,LandmarkKit};')();
const recipe=JSON.parse(readFileSync(resolve(root,'assets/sanctuaries/solar-sanctuary.recipe.json'),'utf8'));
const model=SacredCityKit.build(recipe,{lod:1});
const triangles=data=>Array.from({length:data.length/27},(_,i)=>({
 points:[0,9,18].map(j=>data.slice(i*27+j,i*27+j+3)),normal:data.slice(i*27+3,i*27+6)
}));
const near=(a,b)=>Math.abs(a-b)<1e-7;
const primitive=build=>{
 const k=new LandmarkKit(recipe,{lod:1});k.palette=SacredCityKit.palette(recipe);
 k.part('probe','Probe','architecture',()=>build(k));return triangles(k.finish().parts[0].geometry.data);
};
// Project a +Z ray into the XY triangle. This catches a solid facade or roof cap
// accidentally placed in front of a modeled opening, including otherwise invisible faces.
function frontDepth(part,x,y){
 let depth=-Infinity;
 for(const t of triangles(part.geometry.data)){
  const [a,b,c]=t.points,d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(d)<1e-10)continue;
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
  const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d,w=1-u-v;
  if(Math.min(u,v,w)>=-1e-8)depth=Math.max(depth,u*a[2]+v*b[2]+w*c[2]);
 }
 return depth;
}

test('both halves of pointed archivolts face outward, including their rear faces',()=>{
 const mesh=primitive(k=>SacredCityKit.pointed(k,0,0,0,2,4,.4));
 for(const [z,sign]of[[.2,1],[-.2,-1]]){
  const heads=mesh.filter(t=>t.points.every(p=>near(p[2],z)&&p[1]>=2.2));
  assert(heads.length>=40);
  assert(heads.every(t=>t.normal[2]*sign>.99),'one arch half has reversed stone normals');
 }
});

test('rose stonework has outward front faces and an inward-facing hollow reveal',()=>{
 const mesh=primitive(k=>SacredCityKit.rose(k,0,0,0,2));
 const front=mesh.filter(t=>t.points.every(p=>near(p[2],.31)&&Math.hypot(p[0],p[1])>=2-1e-7));
 assert(front.length>=60);assert(front.every(t=>t.normal[2]>.99));
 const reveal=mesh.filter(t=>t.points.every(p=>near(Math.hypot(p[0],p[1]),2))&&Math.abs(t.normal[2])<.01);
 assert(reveal.length>=60);
 assert(reveal.every(t=>t.normal[0]*t.points[0][0]+t.normal[1]*t.points[0][1]<-1.9));
});

test('portal leaves and rose glazing remain recessed behind their projecting stone frames',()=>{
 const front=model.parts.find(p=>p.id==='west-front');
 const door=frontDepth(front,.35,7.8),jamb=frontDepth(front,1.35,7.8);
 assert(Number.isFinite(door)&&Number.isFinite(jamb));assert(jamb-door>.5,{door,jamb});
 const glass=frontDepth(front,0,19.25),frame=frontDepth(front,0,21.7);
 assert(frame-glass>.35,{glass,frame});
 // The former nave roof overran the facade and hid its carved gable with a blue cap.
 const roof=model.parts.find(p=>p.id==='great-nave-roof');
 assert(frontDepth(roof,0,25)<6.5,'nave roof must end behind the west-front masonry');
 const lantern=model.parts.find(p=>p.id==='crown-of-light');
 assert(frontDepth(lantern,.343,25.065)>-1.88,'lantern glazing must project beyond the 3.9-radius drum');
});

test('primary sanctuary construction remains present at town LOD and removable roofs stay grouped',()=>{
 for(const module of['deep-processional-portal','pierced-rose-wall','recessed-rose-tracery','processional-gallery','buttressed-bell-chamber','hanging-bronze-bell','stepped-buttress-pier','chancel-clerestory'])assert(model.stats.modules[module]>0,module);
 assert.equal(model.stats.modules['deep-processional-portal'],3);
 for(const module of['gabled-portal-canopy','apsidal-roof-shell','coped-sanctuary-ridge']){
  const parts=model.parts.filter(p=>p.modules.includes(module));
  assert(parts.length>0,module);assert(parts.every(p=>p.role==='roof'),module+' must follow the roof visibility switch');
 }
 assert(model.stats.triangles<210000,'town detail must stay below the former 221k triangle model');
 assert.deepEqual(model.bounds.min,[-18.62,0,-20.62]);
 assert(model.bounds.max[0]<=18.62&&model.bounds.max[2]<=20.685);
 const digest=m=>{const hash=createHash('sha256');for(const p of m.parts)hash.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));return hash.digest('hex');};
 assert.equal(digest(model),digest(SacredCityKit.build(recipe,{lod:1})));
 assert(model.signature.endsWith('/great-sanctuary-2'));
});
