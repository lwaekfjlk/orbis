import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const E=Function(source+'\nreturn {generateWorld,createCivilization,generateCity,AtlasSpace,CityEnvironment,ContinuousCityLayer,createCityRenderer};')();
let w,s;
test('The road toggle controls the street network at town zoom',()=>{
 const renderer={zoom:E.AtlasSpace.DETAIL_ZOOM*2,options:{roads:false}},layer=new E.ContinuousCityLayer(renderer);
 assert.equal(layer.visible('cm:507:streets'),false);
 assert.equal(layer.visible('cm:507:buildings'),true);
 renderer.options.roads=true;assert.equal(layer.visible('cm:507:streets'),true);
});
test.before(async()=>{w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});});

test('The terrain surveyed for every city parcel is the terrain underneath its rendered position',()=>{
 for(const id of [507,...s.provinces.filter(p=>p.city).sort((a,b)=>b.urbanPop-a.urbanPop).slice(0,4).map(p=>p.id)]){
  const p=s.provinces[id],c=E.generateCity(w,s,id),f=E.AtlasSpace.cityFrame(w,p,c);
  assert.equal(c.terrainSpan,f.cells);
  for(let k=0;k<c.n*c.n;k+=41){
   const q=c.xy(k),[x,y]=f.at(q.x,q.z),sample=E.CityEnvironment.sample(w,x,y);
   assert.equal(c.environment.parentIndex[k],sample.parentIndex,p.name+' reads the wrong parent cell');
   assert(Math.abs(c.environment.bed[k]-sample.bed)<.002,p.name+' surveys a different hillside');
  }
 }
});

test('Overhangs and neighbouring buildings keep their own rigid transform, including detailed roofs',()=>{
 globalThis.window={world:w,sim:s};
 try {
  const p=s.provinces[507],meshes={},layer=new E.ContinuousCityLayer({relief:1,upload(name,g){meshes[name]=g.data;}});
  layer.world=w;layer.sim=s;const model=layer.build(p),c=model.city;
  const collector=E.createCityRenderer(null,()=>{},{collectOnly:true});collector.setCity(c,p,s.realms[p.owner],{});
  let checked=0,overhangs=0;
  for(const name of ['buildings','roofs','details']){
   const local=collector.meshes[name].vertices,actual=meshes[`cm:${p.id}:${name}`],ranges=collector.buildingRanges[name];
   let cursor=0,rangeIndex=0;
   for(let k=0;k<local.length;k+=27){
    while(rangeIndex<ranges.length&&ranges[rangeIndex].end<=k)rangeIndex++;
    const range=ranges[rangeIndex],a=range&&range.start<=k?model.frame.anchors.get(range.id):null;
    const points=[];
    for(let j=0;j<3;j++){
     const t=k+j*9,v=model.frame.vertex(local[t],local[t+1],local[t+2],a,range?.footing);
     if(a&&!range.footing&&local[t+1]<a.b.y-.015)v[1]=Math.min(v[1],model.frame.ground(local[t],local[t+2])-.006);
     points.push(v);
    }
    const [A,B,C]=points,u=B.map((v,i)=>v-A[i]),v=C.map((v,i)=>v-A[i]);
    if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10)continue;
    if(a&&!range.footing)for(let j=0;j<3;j++){
     const t=k+j*9;
     if(local[t+1]<a.b.y-.015)continue;
     assert(Math.abs(actual[cursor+j*9+1]-(a.y+(local[t+1]-a.b.y)*a.scale))<1e-8,`${name}/${a.b.id} tears away from its building`);
     if(Math.abs(local[t]-a.b.x)>a.b.w*.48||Math.abs(local[t+2]-a.b.z)>a.b.d*.48)overhangs++;
     checked++;
    }
    cursor+=27;
   }
   assert.equal(cursor,actual.length,'all nondegenerate triangles survive mounting');
  }
  assert(checked>10000);assert(overhangs>100,'exercise parcel edges and overhangs');
 } finally {delete globalThis.window;}
});
