import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {LandmarkCatalog,SacredCityKit,ArtisanCityKit,TownCityBinding,createCityRenderer};')();
const recipe=id=>E.LandmarkCatalog.recipe('arcane','excavation-placement',{sacred:true,wonder:id,faith:'hearth',complexity:1});
const models=Object.fromEntries(['sunless-well','forge-hollow','sky-crystal'].map(id=>[id,E.SacredCityKit.build(recipe(id),{lod:1})]));
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,message+`: ${a} vs ${b}`);
const vertices=g=>{const out=[];for(let j=0;j<g.data.length;j+=9)out.push(g.data.slice(j,j+3));return out};
const area=outline=>outline.reduce((sum,p,j)=>{const q=outline[(j+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1]},0)/2;
const inside=(outline,[x,z])=>outline.every((a,j)=>{const b=outline[(j+1)%outline.length];return(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-7});

test('well and forge entrances stay on the parcel while their authored floors remain underground',()=>{
 for(const id of ['sunless-well','forge-hollow'])for(const angle of [0,.37,Math.PI/2]){
  const model=models[id],b={x:12,y:0,z:-7,w:29,d:23,angle},placed=E.ArtisanCityKit.meshAt(model,b);
  const actual=[...vertices(placed.body),...vertices(placed.roof)],ys=actual.map(p=>p[1]);
  assert.equal(model.groundY,0,id);assert.ok(Math.min(...ys)<b.y,id+' must descend from the entrance');
  near(Math.min(...ys),b.y-placed.depth,id+' depth');near(Math.max(...ys),b.y+placed.height,id+' above-ground height');
  near(placed.excavation.floorY,Math.min(...ys),id+' original bottom reaches the excavation floor');
  const authored=model.parts.filter(p=>p.role!=='roof').flatMap(p=>vertices(p.geometry)),body=vertices(placed.body);
  let seats=0;for(let j=0;j<authored.length;j++)if(Math.abs(authored[j][1])<1e-9){near(body[j][1],b.y,id+' entrance vertex');seats++;}
  assert.ok(seats>30,id+' has an authored entrance surface');
  for(const [x,,z]of actual){assert.ok(x>=b.x-b.w/2-1e-8&&x<=b.x+b.w/2+1e-8,id+' rotated parcel width');assert.ok(z>=b.z-b.d/2-1e-8&&z<=b.z+b.d/2+1e-8,id+' rotated parcel depth');}
  assert.ok(area(placed.excavation.outline)>0,id+' outline winding survives rotation');
  for(const [x,z]of placed.excavation.outline){assert.ok(x>=b.x-b.w/2&&x<=b.x+b.w/2);assert.ok(z>=b.z-b.d/2&&z<=b.z+b.d/2);}
 }
});

test('excavation edges join authored retaining geometry and leave descending access clear',()=>{
 const well=models['sunless-well'],ring=well.excavation.outline,court=vertices(well.parts.find(p=>p.id==='rim-court').geometry);
 assert.equal(ring.length,48);assert.equal(well.excavation.floorY,-25.6);
 for(const [x,z]of ring)assert.ok(court.some(p=>Math.abs(p[0]-x)<1e-8&&Math.abs(p[1])<1e-8&&Math.abs(p[2]-z)<1e-8),'well cut meets the actual court inner edge');
 for(let j=0;j<192;j++){
  const a=j*Math.PI/96;
  assert.ok(inside(ring,[Math.cos(a)*10.4,Math.sin(a)*10.4]),'no ground remains inside the shaft lining');
  assert.ok(!inside(ring,[Math.cos(a)*11,Math.sin(a)*11]),'the cut does not pass outside the retaining wall');
 }
 const forge=models['forge-hollow'],outline=forge.excavation.outline,bowl=vertices(forge.parts.find(p=>p.id==='quarried-bowl').geometry);
 assert.equal(forge.excavation.floorY,-9.8);assert.ok(area(outline)>0);
 for(const [x,z]of outline)assert.ok(bowl.some(p=>Math.abs(p[0]-x)<1e-8&&Math.abs(p[1])<1e-8&&Math.abs(p[2]-z)<1e-8),'forge cut follows actual outer wall vertices');
 for(let j=1;j<50;j++)for(const x of[-1.8,0,1.8])for(const z of[17-(j+.5)*.26-.1375,17-(j+.5)*.26+.1375])assert.ok(inside(outline,[x,z]),'descending forge tread '+j+' would be blocked by ground');
 const b={x:3,y:4,z:7,w:25,d:31,angle:.71},placed=E.ArtisanCityKit.meshAt(well,b),body=vertices(placed.body);
 for(const [x,z]of placed.excavation.outline)assert.ok(body.some(p=>Math.abs(p[0]-x)<1e-8&&Math.abs(p[1]-b.y)<1e-8&&Math.abs(p[2]-z)<1e-8),'town-space outline and entrance are transformed together');
 assert.ok(placed.excavation.floorY<b.y,'elevated parcels still have underground depth');
});

test('ordinary models retain their minimum-bound placement and have no excavation',()=>{
 const model=models['sky-crystal'],b={x:-8,y:3.5,z:6,w:23,d:26,angle:.42};
 assert.equal(model.groundY,undefined);assert.equal(model.excavation,undefined);
 const placed=E.ArtisanCityKit.meshAt(model,b),ys=[...vertices(placed.body),...vertices(placed.roof)].map(p=>p[1]);
 near(Math.min(...ys),b.y,'ordinary ground contact');near(Math.max(...ys)-Math.min(...ys),placed.height,'ordinary full height');
 assert.equal(placed.depth,0);assert.equal(placed.excavation,undefined);
});

test('city collection carries excavation ownership and omits the slab that would cap a shaft',()=>{
 const resolve=E.TownCityBinding.resolve,priorWindow=globalThis.window;
 const grid={n:2,width:60,depth:60,height:new Float32Array(4),water:new Uint8Array(4),waterKind:new Uint8Array(4),color:new Float32Array(12).fill(.5),signature:'flat',xy:i=>({x:i%2*60-30,z:(i/2|0)*60-30})};
 const b={id:'buried-wonder',x:0,y:0,z:0,w:29,d:23,h:10,angle:.37,type:'temple',landmark:true,sacred:true,district:0,foundationBed:-1};
 const city={...grid,fingerprint:'pit',environment:grid,context:{...grid,innerStart:0,innerEnd:1},siteEnvironment:{aridity:1,temperature:12},townProfile:{id:'river',palace:'river'},townRecipe:{seed:'placement'},buildings:[b],districts:[{type:'temple'}],roads:[],farms:[],trees:[],piers:[],market:{x:24,z:24},index:()=>0,seed:1};
 try{
  globalThis.window={world:{},sim:{landmarkRecipes:{}}};
  const r=E.createCityRenderer(null,()=>{},{collectOnly:true});
  for(const id of ['sunless-well','forge-hollow']){
   E.TownCityBinding.resolve=()=>recipe(id);city.fingerprint=id;r.setCity(city,{fresh:0},null);
   assert.equal(r.excavations.length,1);assert.equal(r.excavations[0].buildingId,b.id);
   assert.ok(r.excavations[0].floorY<0);assert.ok(r.landmarkHeights[b.id]>0);
   assert.equal(r.meshes.buildings.count,0,'no generic foundation covers the underground entrance');
   r.setCity(city,{fresh:0},null);assert.equal(r.excavations.length,1,'cached city retains one excavation');
  }
  E.TownCityBinding.resolve=()=>recipe('sky-crystal');city.fingerprint='ordinary';r.setCity(city,{fresh:0},null);
  assert.deepEqual(r.excavations,[],'a rebuilt ordinary city clears the previous holes');
  assert.ok(r.meshes.buildings.count>0,'ordinary monument keeps its foundation');
 }finally{E.TownCityBinding.resolve=resolve;if(priorWindow===undefined)delete globalThis.window;else globalThis.window=priorWindow;}
});
