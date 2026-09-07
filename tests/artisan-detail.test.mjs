import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {root} from './engine-loader.mjs';
import {resolve} from 'node:path';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(s=>readFileSync(resolve(root,s),'utf8')).join('\n');
const E=Function(source+'\nreturn {ArtisanCityKit,LandmarkCatalog,LandmarkKit,rgb};')();
function house(style='mountain',lod=2,{variant=0,w=4,d=5,h=4.5,roof='gable',material='masonry',climate={}}={}){
 const recipe=E.LandmarkCatalog.recipe(style,'artisan-detail-probe',{artisan:true,urbanStyle:style});
 const k=new E.LandmarkKit(recipe,{base:false,lod});
 k.palette=E.ArtisanCityKit.palettes[style];k.climate={...E.ArtisanCityKit.neutralClimate,...climate};
 if(roof)k.vocab={material,roof,pitch:1,eave:.1};
 k.part('house','Residential structure','architecture',()=>E.ArtisanCityKit.house(k,0,0,0,w,d,h,style,variant));
 return k.finish();
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
function triangles(model){
 return model.parts.flatMap(p=>{
  const ts=[];for(let i=0;i<p.geometry.data.length;i+=27){const d=p.geometry.data;ts.push({v:[d.slice(i,i+3),d.slice(i+9,i+12),d.slice(i+18,i+21)],color:d.slice(i+6,i+9)});}return ts;
 });
}
function hit(origin,dir,{v:[a,b,c]}){
 const ab=sub(b,a),ac=sub(c,a),p=cross(dir,ac),det=dot(ab,p);
 if(Math.abs(det)<1e-8)return false;
 const t=sub(origin,a),u=dot(t,p)/det;if(u<0||u>1)return false;
 const q=cross(t,ab),v=dot(dir,q)/det;
 return v>=0&&u+v<=1&&dot(ac,q)/det>1e-4;
}
const center=t=>[0,1,2].map(i=>t.v.reduce((n,v)=>n+v[i],0)/3);
const isGlass=(t,style)=>t.color.every((v,i)=>Math.abs(v-E.rgb(E.ArtisanCityKit.palettes[style].water)[i])<1e-6);

test('side windows face outward and upper-storey glazing follows the actual wall height',()=>{
 const ts=triangles(house('mountain',2,{h:7.8})),glass=ts.filter(t=>isGlass(t,'mountain'));
 for(const side of[-1,1]){
  const panes=glass.filter(t=>center(t)[0]*side>2&&center(t)[1]<8);
  assert(panes.length>=12,'a long side needs paired windows on each storey');
  assert(panes.some(t=>center(t)[1]>6.1),'upper floor cannot be an empty wall');
  for(const pane of panes){
   const normal=cross(sub(pane.v[1],pane.v[0]),sub(pane.v[2],pane.v[0]));
   assert(normal[0]*side>0,'pane faces into the wall');
   assert(!ts.some(t=>hit(center(pane),[side,0,0],t)),'side glazing is hidden by its own wall or joinery');
  }
 }
});

test('dormer windows emerge above the pitched roof and are visible looking uphill',()=>{
 for(const roof of['gable','hip','northern'])for(const variant of[0,1]){
  const model=house('mountain',2,{roof,variant}),ts=triangles(model),side=variant%2?-1:1;
  const panes=ts.filter(t=>isGlass(t,'mountain')&&t.v.every(v=>v[1]>4.8));
  assert.equal(model.stats.modules['slope-dormer'],1,roof);
  assert(panes.length>=2,roof+' needs an exposed attic light');
  for(const pane of panes)assert(!ts.some(t=>hit(center(pane),[side,0,0],t)),roof+' buries its dormer glazing');
 }
 for(const roof of['vault','conic','upturned','leaf','parapet','rockcut']){
  assert.equal(house('mountain',2,{roof}).stats.modules['slope-dormer']||0,0,'a dormer does not belong on '+roof);
 }
});

test('domestic detail keeps replay deterministic and a bounded high-frequency mesh budget',()=>{
 for(const style of Object.keys(E.ArtisanCityKit.palettes)){
  const costs=[];
  for(const lod of[0,1,2]){
   const a=house(style,lod,{roof:null}),b=house(style,lod,{roof:null});
   assert.deepEqual(a.bounds,b.bounds,style);
   assert.equal(a.stats.triangles,b.stats.triangles,style);
   assert.deepEqual(a.parts.map(p=>p.geometry.data),b.parts.map(p=>p.geometry.data),style+' seed replay');
   assert(a.parts.every(p=>p.geometry.data.every(Number.isFinite)),style+' finite mesh');
   costs.push(a.stats.triangles);
  }
  assert(costs[0]<180,style+' silhouette budget: '+costs[0]);
  assert(costs[1]<1250,style+' street budget: '+costs[1]);
  assert(costs[2]<3100,style+' close-up budget: '+costs[2]);
  assert(costs[0]<costs[1]&&costs[1]<costs[2],style+' detail must follow LOD');
 }
});


test('roof removal also removes the gable frame and complete dormer cabin',()=>{
 for(const roof of['gable','hip','northern']){
  const model=house('mountain',2,{roof}),body={parts:model.parts.filter(p=>p.role!=='roof')};
  const attic=triangles(body).filter(t=>isGlass(t,'mountain')&&t.v.every(v=>v[1]>4.8));
  assert.equal(attic.length,0,roof+' leaves a floating dormer window after roof removal');
  for(const module of['gable-frame','slope-dormer'])for(const part of model.parts.filter(p=>p.modules.includes(module))){
   assert.equal(part.role,'roof',module+' belongs to the removable roof assembly');
  }
  assert(model.parts.some(p=>p.role==='roof'&&p.modules.includes('slope-dormer')),roof+' roof includes its attic joinery');
  assert(triangles(body).some(t=>isGlass(t,'mountain')),'normal storey windows remain visible when the roof is hidden');
 }
});


test('adobe windows stand outside the battered wall on every storey and facade',()=>{
 for(const [w,d,h]of[[4,5,4.5],[7,8,8]])for(const lod of[1,2]){
  const model=house('desert',lod,{variant:1,w,d,h,roof:null,climate:{warm:.8,dry:.8}}),ts=triangles(model),
   panes=ts.filter(t=>isGlass(t,'desert')),faces=new Set();
  assert(model.stats.modules['adobe-construction'],'probe uses the climate-selected earth wall');
  assert(panes.some(t=>center(t)[1]<h*.45),'probe includes lower-storey glazing');
  assert(panes.some(t=>center(t)[1]>h*.60),'probe includes upper-storey glazing');
  for(const pane of panes){
   const at=center(pane),normal=cross(sub(pane.v[1],pane.v[0]),sub(pane.v[2],pane.v[0])),axis=Math.abs(normal[0])>Math.abs(normal[2])?0:2,side=Math.sign(normal[axis]),dir=[0,0,0];
   dir[axis]=side;faces.add(axis+':'+side);
   assert(at[axis]*side>(axis===0?w:d)/2,'window normal must point out of its facade');
   assert(!ts.some(t=>hit(at,dir,t)),`${w}x${d}x${h} LOD${lod} window at ${at} is buried by its wall`);
  }
  assert.equal(faces.size,4,'regression covers front, rear and both side walls');
 }
});
