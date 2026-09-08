import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scripts } from '../scripts/manifest.mjs';
import { root } from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(s=>readFileSync(`${root}/${s}`,'utf8')).join('\n');
const E=Function(source+';return{ArtisanCityKit,LandmarkCatalog,LandmarkKit,TownVocabulary,rgb};')();
function house({lod=1,variant=1,domestic=true,dense=false,w=4,d=5,h=4.5,x=0,z=0,y=0,angle=0,roof='gable',material='masonry',style='mountain',climate={}}={}){
 const recipe=E.LandmarkCatalog.recipe(style,'domestic-forms-probe',{artisan:true,urbanStyle:style}),k=new E.LandmarkKit(recipe,{base:false,lod});
 k.palette=E.ArtisanCityKit.palettes[style];k.climate={...E.ArtisanCityKit.neutralClimate,...climate};k.vocab={material,roof,pitch:1,eave:.1};
 let plan;k.part('house','One household','architecture',()=>{plan=E.ArtisanCityKit.house(k,x,y,z,w,d,h,style,variant,angle,{domestic,dense});});
 return{model:k.finish(),plan};
}
const hash=model=>createHash('sha256').update(Buffer.from(Float32Array.from(model.parts.flatMap(p=>p.geometry.data)).buffer)).digest('hex');
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function triangles(model,role=null){return model.parts.filter(p=>!role||p.role===role).flatMap(p=>{const out=[],d=p.geometry.data;for(let j=0;j<d.length;j+=27)out.push({p:[d.slice(j,j+3),d.slice(j+9,j+12),d.slice(j+18,j+21)],normal:d.slice(j+3,j+6),color:d.slice(j+6,j+9),role:p.role});return out;});}
function hit(origin,dir,t){const[a,b,c]=t.p,ab=sub(b,a),ac=sub(c,a),p=cross(dir,ac),det=dot(ab,p);if(Math.abs(det)<1e-9)return Infinity;const q=sub(origin,a),u=dot(q,p)/det;if(u<0||u>1)return Infinity;const v=cross(q,ab),n=dot(dir,v)/det;if(n<0||u+n>1)return Infinity;const distance=dot(ac,v)/det;return distance>1e-5?distance:Infinity;}
const center=t=>[0,1,2].map(k=>t.p.reduce((n,p)=>n+p[k],0)/3);

test('three domestic forms change the occupied silhouette while remaining one joined household',()=>{
 const names=['corner-wing','staggered-ranges','rear-outbuilding'],notches=[[1.3,-2.0],[1.5,1.8],[1.5,-2.1]];
 for(const variant of[1,2,3])for(const lod of[0,1,2]){
  const {model,plan}=house({variant,lod});assert.equal(plan.form,names[variant-1]);assert.equal(plan.volumes.length,2);
  const [a,b]=plan.volumes;
  assert(Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.z-b.z)<(a.d+b.d)/2,'joined rooms must actually overlap');
  assert(b.h<a.h*.7,'the attached range has a visibly subordinate height');
  for(const q of plan.volumes){assert(q.x-q.w/2>=-2-1e-9&&q.x+q.w/2<=2+1e-9);assert(q.z-q.d/2>=-2.5-1e-9&&q.z+q.d/2<=2.5+1e-9);}
  const[x,z]=notches[variant-1],body=triangles(model,'architecture');
  assert(!body.some(t=>hit([x,1.3,z],[0,-1,0],t)<1.2),'the plan notch must remain empty above its foundation');
  for(const q of plan.volumes)assert(body.some(t=>hit([q.x,q.h+.15,q.z],[0,-1,0],t)<q.h+1),'each range has actual structural geometry');
  assert.equal(model.stats.modules['domestic-lean-roof'],1);
  assert.equal(model.stats.modules['framed-entrance'],1,'an extension must not create a second household doorway');
 }
});

test('all climate roof families preserve parcel envelopes, deterministic replay and a bounded mesh cost',()=>{
 for(const roof of Object.keys(E.TownVocabulary.ROOFS))for(const dense of[false,true])for(const lod of[0,1,2])for(const variant of[1,2,3]){
  const args={roof,dense,lod,variant,w:dense?7.5:4,d:dense?7.8:5,h:dense?7.8:4.5};
  const current=house(args).model,original=house({...args,domestic:false}).model;
  assert.equal(hash(current),hash(house(args).model),`${roof}: deterministic form`);
  assert(current.stats.triangles<=original.stats.triangles*(dense?1.15:1.18),`${roof}/${lod}/${variant}/${dense}: ${current.stats.triangles}/${original.stats.triangles} triangles`);
  for(const axis of[0,1,2]){
   assert(current.bounds.min[axis]>=original.bounds.min[axis]-.16,`${roof}: expanded lower envelope ${axis}`);
   assert(current.bounds.max[axis]<=original.bounds.max[axis]+.16,`${roof}: expanded upper envelope ${axis}`);
  }
  for(const t of triangles(current)){
   assert(t.p.flat().every(Number.isFinite));
   const length=Math.hypot(...cross(sub(t.p[1],t.p[0]),sub(t.p[2],t.p[0])));
   assert(length>1e-10,'a composed range must not create a collapsed face');
  }
 }
});

test('the street interface describes the real primary door after every quarter turn',()=>{
 for(const material of['masonry','adobe','log'])for(const variant of[0,1,2,3])for(const angle of[0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const {model,plan}=house({material,variant,angle,x:6,z:-7,y:2,lod:2});
  const {entrance:e}=plan,dir=[-Math.sin(angle),0,Math.cos(angle)],body=triangles(model,'architecture');
  assert(e.width>0&&e.width<=.76&&e.baseY>2);
  const origin=[e.x+dir[0]*2,e.baseY+.65,e.z+dir[2]*2],distances=body.map(t=>hit(origin,dir.map(v=>-v),t));
  const nearest=Math.min(...distances);assert(nearest>1.55&&nearest<2.05,'entry should meet the main door, not an annex or empty yard');
  assert.equal(e.angle,angle);
  const main=plan.volumes[0],stand=material==='log'?.20:material==='adobe'?.08:0;
  assert(Math.abs(e.x-(main.x+dir[0]*(main.d/2+stand)))<1e-9);
  assert(Math.abs(e.z-(main.z+dir[2]*(main.d/2+stand)))<1e-9);
 }
});

test('joined masonry windows remain visible instead of looking into the attached range',()=>{
 for(const variant of[1,2,3])for(const dense of[false,true]){
  const {model}=house({variant,dense,lod:1,h:7.8,w:7.5,d:7.8}),ts=triangles(model),glass=E.rgb(E.ArtisanCityKit.palettes.mountain.water);
  const panes=ts.filter(t=>t.color.every((v,k)=>Math.abs(v-glass[k])<1e-6));assert(panes.length>6);
  for(const pane of panes){const origin=center(pane),dir=pane.normal;assert(!ts.some(t=>hit(origin,dir,t)<20),`variant ${variant}: glazing is hidden behind a joined wall or roof at ${origin}`);}
 }
});

test('the annex roof and its snow remain removable and keep the same planes across LODs',()=>{
 for(const variant of[1,2,3]){
  const builds=[0,1,2].map(lod=>house({lod,variant,climate:{cover:.65,cold:.8,load:.8},material:'log',roof:'northern'}));
  for(const {model,plan} of builds){
   const parts=model.parts.filter(p=>p.role==='roof');assert(parts.length>0);
   assert.equal(model.stats.modules['lying-snow'],2+(model.stats.modules['slope-dormer']||0),'both primary and lean-to have real snow');
   const q=plan.volumes[1],ts=triangles(model,'roof'),snow=E.rgb(E.ArtisanCityKit.palettes.mountain.snow);
   const tops=ts.filter(t=>t.color.every((v,k)=>Math.abs(v-snow[k])<1e-6)&&t.normal[1]>.3&&Math.hypot(center(t)[0]-q.x,center(t)[2]-q.z)<Math.min(q.w,q.d)*.5);
   assert(tops.length>=2,'snow lies over the actual annex');
   assert(model.parts.filter(p=>p.role!=='roof').every(p=>!p.modules.includes('domestic-lean-roof')));
  }
  // Select the top-facing roof triangles of the lean-to by their distinct lower
  // height and plan centre. The simple roof does not change when detail streams.
  const annex=builds.map(({model,plan})=>{const q=plan.volumes[1];return triangles(model,'roof').filter(t=>t.normal[1]>.2&&center(t)[1]<q.baseY+q.h+1.1&&Math.hypot(center(t)[0]-q.x,center(t)[2]-q.z)<Math.min(q.w,q.d)*.5).map(t=>t.p);});
  assert.deepEqual(annex[1],annex[0]);assert.deepEqual(annex[2],annex[0]);
 }
});


test('sloping annexes have real wall heads beneath their roof, with no daylight slit',()=>{
 for(const variant of[1,2,3])for(const lod of[0,1,2]){
  const {model,plan}=house({variant,lod}),[a,b]=plan.volumes;
  const alongX=Math.abs(a.x-b.x)>Math.abs(a.z-b.z),normal=alongX?[0,0,-1]:[1,0,0];
  const origin=[b.x+normal[0]*(b.w/2+.15),b.baseY+b.h+.22,b.z+normal[2]*(b.d/2+.15)];
  const nearest=Math.min(...triangles(model).map(t=>hit(origin,normal.map(v=>-v),t)));
  assert(Math.abs(nearest-.15)<1e-7,`variant ${variant} LOD ${lod}: open wedge under the roof`);
 }
});
