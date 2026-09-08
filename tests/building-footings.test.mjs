import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const browser={},E=Function('window',source+'\nreturn {generateWorld,createCivilization,generateCity,AtlasSpace,ArtisanCityKit,ContinuousCityLayer,createCityRenderer,GW,GH};')(browser);
let worldPromise;
const world=()=>worldPromise??=(async()=>{const w=await E.generateWorld(defaults),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});browser.world=w;browser.sim=s;return{w,s};})();
// These names identify historical geometry regressions; locate the same cells
// even when a country's naming tradition changes the displayed town name.
const sites={Glassbeck:[507,38505],Scorchspire:[349,29953],Longshaw:[127,15155],Birchgrove:[316,26352]};
function site(s,name){const[id,cell]=sites[name],p=s.provinces[id];assert.equal(p.i,cell,name+' fixture moved');return p;}

test('level ground never becomes a tall podium when a town footprint gets smaller',()=>{
 const w={height:new Float64Array(E.GW*E.GH).fill(100),lake:new Float64Array(E.GW*E.GH),ice:new Float64Array(E.GW*E.GH)},p={x:100,y:50};
 const b={id:'house',x:0,z:0,y:0,w:2,d:3,h:2};
 for(const terrainSpan of[.15,1,3]){
  const c={width:120,depth:120,n:2,terrainSpan,height:new Float64Array(4),buildings:[b]},f=E.AtlasSpace.cityFrame(w,p,c),a=f.anchors.get(b.id);
  const visibleFooting=(a.y-a.low)/f.scale;
  assert(visibleFooting>=0&&visibleFooting<.03,'a flat lot only needs a small construction seam');
  for(const dx of[-1,0,1])for(const dz of[-1,0,1]){
   const q=f.vertex(dx,0,dz,a);assert(q[1]>=f.ground(dx,dz),'the house stays above its actual terrain');
  }
  const street=f.vertex(0,.14,0),wallFoot=f.vertex(0,-.3,0),wallTop=f.vertex(0,3,0);
  assert((street[1]-a.y)/f.scale<.2,'the adjacent street remains a small doorstep above a level lot');
  assert(wallFoot[1]<f.ground(0,0)&&wallTop[1]>f.ground(0,0),'lowering the construction seam keeps curtain feet buried and its wall exposed');
 }
});

test('Glassbeck and Scorchspire houses read taller than their ordinary slope footings',async()=>{
 const {w,s}=await world();
 for(const name of['Glassbeck','Scorchspire']){
  const p=site(s,name),c=E.generateCity(w,s,p.id),f=E.AtlasSpace.cityFrame(w,p,c),ratios=[];
  for(const b of c.buildings.filter(b=>b.type==='home'&&!b.landmark)){
   const a=f.anchors.get(b.id),m=E.ArtisanCityKit.compound(b,c,p,s.realms[p.owner]);
   ratios.push((a.y-a.low)/(f.scale*m.height));
   assert(a.y>=a.top,'correcting the podium cannot bury uphill walls');
  }
  assert(ratios.length>100,'exercise a full neighborhood');
  assert(ratios.reduce((s,v)=>s+v,0)/ratios.length<.3,name+' houses sit on disproportionately tall plinths');
  assert(ratios.filter(r=>r>.5).length<ratios.length*.1,name+' too many bases resemble the building itself');
 }
});

const towns=new Map();
async function town(name){if(towns.has(name))return towns.get(name);
 const {w,s}=await world(),p=site(s,name),meshes={};
 const layer=new E.ContinuousCityLayer({relief:1,upload(name,g){meshes[name]=g.data;}});layer.world=w;layer.sim=s;
 const model=layer.build(p),c=model.city,collector=E.createCityRenderer(null,()=>{},{collectOnly:true});collector.setCity(c,p,s.realms[p.owner],{});
 const result={p,model,c,collector,meshes};towns.set(name,result);return result;
}
function support(row,b){
 const {p,model,c,collector,meshes}=row;
 const a=model.frame.anchors.get(b.id),height=model.heights[b.id],ranges=collector.buildingRanges.buildings,range=ranges.find(r=>r.id===b.id&&r.footing);
 assert(range,'the supporting structure has explicit ownership');
 const data=collector.meshes.buildings.vertices,levels=new Set(),bottom=[],faces=[];let largestFace=0;
 const actual=new Set(),key=p=>p.map(v=>Math.round(v*1e8)).join(',');
 for(let i=0;i<meshes[`cm:${p.id}:buildings`].length;i+=9)actual.add(key(meshes[`cm:${p.id}:buildings`].slice(i,i+3)));
 for(let i=range.start;i<range.end;i+=27){
  const ys=[],face=[];
  for(let j=0;j<3;j++){
   const k=i+j*9,x=data[k],y=data[k+1],z=data[k+2],q=model.frame.vertex(x,y,z,a,range.footing);
   assert(x>=b.x-b.w/2-1e-6&&x<=b.x+b.w/2+1e-6&&z>=b.z-b.d/2-1e-6&&z<=b.z+b.d/2+1e-6,'support cannot expand onto a street');
   assert(actual.has(key(q)),'mounted geometry lost a supporting vertex');face.push(q);
   levels.add(Math.round(q[1]*1e7));ys.push(q[1]);if(y<=b.y-range.footing.depth+1e-5)bottom.push([x,z,q[1]]);
  }
  faces.push(face);
  largestFace=Math.max(largestFace,(Math.max(...ys)-Math.min(...ys))/a.scale);
 }
 assert(bottom.length>0);for(const[x,z,y]of bottom)assert(y<model.frame.ground(x,z),'the last support ring reaches the actual slope');
 const q=range.footing.contact;assert((q[2]-q[0])*(q[3]-q[1])<b.w*b.d*.97,'the top support follows the building contact rather than filling the parcel');
 assert.equal(model.excavations.length,collector.excavations.length,'supports add no new terrain opening');
 return{a,height,range,levels,largestFace,faces,model};
}
function openPierFrame(s){
 const {a,height,range,faces,model}=s,footing=range.footing;
 assert.equal(footing.mode,'piers','a deep bank needs an open supporting frame');
 assert(footing.piers>=4&&footing.piers<=25);assert(faces.length<=450,'support stays a small fraction of the building mesh budget');
 assert(footing.deckDepth<height*.1,'only a thin load-bearing cap remains above the piers');
 // Probe the actual triangles from the side, halfway down the exposed support.
 // A terraced or solid slab blocks every ray; separated columns leave the slope
 // visible through most of the facade, independently of the metadata label.
 const y=(a.y+a.low)/2,z0=model.frame.vertex(0,0,footing.contact[1])[2],z1=model.frame.vertex(0,0,footing.contact[3])[2];
 let open=0;
 for(let j=0;j<31;j++){
  const z=z0+(z1-z0)*(j+.37)/31;
  const hit=faces.some(([A,B,C])=>{const by=B[1]-A[1],bz=B[2]-A[2],cy=C[1]-A[1],cz=C[2]-A[2],det=by*cz-bz*cy;if(Math.abs(det)<1e-14)return false;
   const u=((y-A[1])*cz-(z-A[2])*cy)/det,v=(by*(z-A[2])-bz*(y-A[1]))/det;return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7;
  });
  if(!hit)open++;
 }
 assert(open>=21,'most of the hillside must be visible between the actual piers');
}
test('Longshaw sanctuary and its small hillside houses stand on open piers instead of giant stair blocks',async()=>{
 const row=await town('Longshaw'),primary=row.c.buildings.find(b=>b.precinct);assert(primary,'the sanctuary remains in town');
 openPierFrame(support(row,primary));
 const home=row.c.buildings.find(b=>b.type==='home'&&!b.landmark&&b.terrainFall>row.model.heights[b.id]*.8);assert(home,'exercise an actual small house on the steep bank');
 openPierFrame(support(row,home));
});
test('Birchgrove keeps its difficult small temple with clear ground between the supports',async()=>{
 const row=await town('Birchgrove'),b=row.c.buildings.find(b=>b.type==='temple'&&!b.precinct);assert(b,'the difficult temple must remain in town');
 openPierFrame(support(row,b));
});
test('modest banks retain their stepped foundations without an unnecessary open undercroft',async()=>{
 const row=await town('Glassbeck'),r=row.collector.buildingRanges.buildings.find(r=>r.footing?.mode==='terraced'&&r.footing.tiers>=2);assert(r,'exercise a real modest sloping lot');
 const b=row.c.buildings.find(b=>b.id===r.id),s=support(row,b);
 assert(s.levels.size>=3,'the renderer preserves intermediate retaining levels');
 assert(s.largestFace<s.height*.4,'no unbroken wall should rival its building');
});
