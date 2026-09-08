import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function('window',source+'\nreturn {AtlasRenderer,AtlasSpace,ContinuousCityLayer,LandscapePatterns,LandscapeRelief,CityEnvironment,Geometry,GW,GH,GN};')({});
function fixture({biome=7,height=300,temp=16,ice=0,arid=1.4}={}){
 const field=n=>new Float32Array(E.GN).fill(n),w={seed:47,height:field(height),lake:field(-1),ice:field(ice),temp:field(temp),arid:field(arid),rain:field(100),biome:new Uint8Array(E.GN).fill(biome),flow:field(0),down:new Int32Array(E.GN).fill(-1),riverThreshold:5};
 const sim={provinces:[{id:0,x:10,y:10,settled:true,urbanPop:1000}],realms:[]},meshes={};
 const r=Object.assign(Object.create(E.AtlasRenderer.prototype),{world:w,sim,relief:1,zoom:240,width:1440,height:900,selected:-1,azimuth:-.4,elevation:.82,target:E.AtlasSpace.point(w,150,90),layer:'relief',options:{},meshes,
  palette(){return[.4,.55,.3];},upload(name,g){meshes[name]={data:g.data};},request(){}});
 const layer=new E.ContinuousCityLayer(r);Object.assign(layer,{world:w,sim,natural:true});r.continuousLayer=layer;r.ground=(x,y)=>layer.ground(x,y);
 layer.viewBox=()=>({x0:147,x1:153,y0:87,y1:93});layer.tessellation=()=>32;
 return{w,r,layer,meshes};
}
const families=[['glacier',{biome:16,height:1200,temp:-18,ice:300}],['snow',{biome:1,height:1800,temp:-12}],['alpine',{biome:13,height:2700,temp:9,arid:.4}],['sand',{biome:4,temp:29,arid:.1}],['tundra',{biome:2,temp:3,arid:.7}],['grass',{}]];
test('each actual terrain builder emits distinct material variation and geometry at close zoom',()=>{
 for(const[name,config]of families){const{w,r,layer,meshes}=fixture(config);layer.buildTerrain();const data=meshes.terrain.data;
  let count=0,lo=Infinity,hi=-Infinity,tilted=0;const colors=new Set();
  for(let i=0;i<data.length;i+=9){const [x,y]=E.AtlasSpace.grid(data[i],data[i+2]);if(x<=149.1||x>=150.9||y<=89.1||y>=90.9)continue;
   const offset=data[i+1]-E.CityEnvironment.atlasSurface(w,x,y);lo=Math.min(lo,offset);hi=Math.max(hi,offset);
   assert.ok(Math.abs(data[i+1]-r.ground(x,y))<1e-10,name+' uses a different surface for the uploaded mesh');
   colors.add(data.slice(i+6,i+9).map(n=>n.toFixed(4)).join(','));if(Math.hypot(data[i+3],data[i+5])>.02)tilted++;count++;
  }
  assert.ok(count>1000);assert.ok(hi-lo>.004,name+' remains geometrically flat');assert.ok(colors.size>100,name+' remains one unvaried colour');assert.ok(tilted>100,name+' normals ignore the new surface');assert.ok(layer.terrainTriangles<400000);
 }
});
test('fractured ice and scree pieces have grounded bases, upward caps and town-scale dimensions',()=>{
 const{w,layer}=fixture({biome:16,temp:-18,ice:200});layer.prepareLandscape();
 for(const ice of[true,false]){const g=new E.Geometry(),unit=E.AtlasSpace.TOWN_UNIT,width=1.1*unit,height=2*unit,n=ice?5:6;
  layer.surfaceFragment(g,150.17,90.31,width,height,.6,[.7,.8,.9],ice);
  assert.equal(g.data.length,n*3*27);let contacts=0,maximum=0;
  for(let j=0;j<n;j++){
   const cap=j*81+54;assert.ok(g.data[cap+4]>0,'a fractured cap points into the ground');
  }
  for(let i=0;i<g.data.length;i+=9){const[x,y]=E.AtlasSpace.grid(g.data[i],g.data[i+2]),above=g.data[i+1]-E.AtlasSpace.surface(w,x,y);
   assert.ok(above>=-1e-9&&above<=height+1e-9);if(Math.abs(above)<1e-9)contacts++;
   maximum=Math.max(maximum,Math.hypot((x-150.17)*E.AtlasSpace.X,(y-90.31)*E.AtlasSpace.Z));
  }
  assert.ok(contacts>=n*3);assert.ok(maximum<width*1.6,'debris is still a large map-sized cone');
 }
});
test('nearby glacier pieces follow the ice option and the shared glacier surface',()=>{
 const{w,r,layer,meshes}=fixture({biome:16,temp:-18,ice:250});layer.prepareLandscape();layer.buildEnvironment();const data=meshes['cm:env:ice'].data;
 assert.ok(data.length>0,'near glaciers lost every fractured ice piece');
 for(let i=0;i<data.length;i+=9){const[x,y]=E.AtlasSpace.grid(data[i],data[i+2]),above=data[i+1]-E.AtlasSpace.surface(w,x,y);assert.ok(above>=-1e-9&&above<2.71*E.AtlasSpace.TOWN_UNIT);}
 assert.equal(layer.visible('cm:env:ice'),true);r.options.ice=false;assert.equal(layer.visible('cm:env:ice'),false);
 layer.natural=false;layer.buildEnvironment();assert.equal(meshes['cm:env:ice'],undefined);
});
