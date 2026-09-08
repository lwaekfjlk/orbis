import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const files=['src/world/geography.js','src/city/environment.js','src/render/world-renderer.js','src/continuous/landscape-patterns.js','src/continuous/landscape-color.js'];
const E=Function(files.map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n')+'\nreturn{generateWorld,CityEnvironment,LandscapeColor,GW,GH,GN};')();
const x=150,y=90,i=y*E.GW+x;
function fixture({version=3,kind=0,biome=12,height=3200,temp=7,arid=1.5,lake=-1,ice=0}={}){
 const field=n=>new Float32Array(E.GN).fill(n);
 return{seed:471,params:{landformVersion:version},height:field(height),lake:field(lake),ice:field(ice),temp:field(temp),arid:field(arid),
  biome:new Uint8Array(E.GN).fill(biome),landform:new Uint8Array(E.GN).fill(kind),landformStrength:field(1)};
}
const far=w=>E.CityEnvironment.cellColor(w,i);
const near=(w,options={})=>E.LandscapeColor.sample(w,x,y,far(w),options);
const gap=(a,b)=>Math.max(...a.map((v,k)=>Math.abs(v-b[k])));
const green=c=>c[1]-c[0]>.018&&c[1]-c[2]>.035;
const grey=c=>(Math.max(...c)-Math.min(...c))/Math.max(...c)<.15;

test('historical versions retain every far and close color across all biomes and rock families',()=>{
 // A heterogeneous fixture locks thousands of Float64 channels from the v2
 // resolver, including seasonal snow, glaciers, water, seams and steep faces.
 const w=fixture();w.seasonTemp=[w.temp.slice(),w.temp.slice()];
 for(let j=0;j<E.GN;j++){
  const x=j%E.GW,y=Math.floor(j/E.GW),b=(Math.floor(x/13)+Math.floor(y/9))%23,h=100+(x*149+y*431)%4100,t=-18+(x*3+y*7)%48;
  w.biome[j]=b;w.height[j]=h;w.temp[j]=t;w.arid[j]=.08+((x*7+y*13)%240)/100;
  w.lake[j]=b===15?h+30:-1;w.ice[j]=b===16?300:b===2?15:0;
  if(b===0||b===17)w.height[j]=-30;
  w.landform[j]=Math.floor(x/7)%5;w.landformStrength[j]=.2+((x+y)%8)/10;
  w.seasonTemp[0][j]=t-5;w.seasonTemp[1][j]=t+5;
 }
 const digests=[];
 for(const version of [0,1,2]){
  const world=structuredClone(w);world.params.landformVersion=version;const hash=createHash('sha256');
  for(let y=14;y<165;y+=11)for(let x=17;x<284;x+=7){
   const base=E.CityEnvironment.cellColor(world,y*E.GW+x),colors=[...base,...E.LandscapeColor.sample(world,x+.23,y+.37,base,{slope:.04}),...E.LandscapeColor.sample(world,x+.23,y+.37,base,{slope:1.1})];
   hash.update(Buffer.from(new Float64Array(colors).buffer));
  }
  digests.push(hash.digest('hex'));
 }
 assert.deepEqual(digests,LEGACY_COLOR_DIGESTS);
});

test('wet mountain forest and meadow retain their substrate when camera relief is exaggerated',()=>{
 for(const biome of [7,8,9,12,21]){
  const w=fixture({biome,temp:8,arid:1.6}),base=far(w),detail=near(w,{slope:.02,relief:.2});
  assert(green(base),`wet biome ${biome} lost its vegetation at world scale`);
  assert(green(detail),`wet biome ${biome} lost its vegetation at town scale`);
  assert(gap(base,detail)<.06,'close materials repainted the parent biome');
  assert.deepEqual(detail,near(w,{slope:20,relief:8}),'display exaggeration changed the land cover');
  const cover=E.CityEnvironment.landCover(w,i);assert(cover.vegetation>.75&&cover.rock<.05);
 }
});

test('physical relief exposes limited rock, while moisture and biome decide plant cover',()=>{
 const wet=fixture(),flat=E.CityEnvironment.landCover(wet,i),base=far(wet);
 wet.height[i+1]+=1600;
 const cliff=E.CityEnvironment.landCover(wet,i);
 assert.equal(cliff.relief,1600);assert(cliff.rock>flat.rock+.4&&cliff.rock<.7);
 assert(cliff.vegetation>.3,'even the rugged wet cell was classified as entirely bare rock');
 assert(gap(base,far(wet))>.05,'actual relief did not change the rock exposure');
 assert.deepEqual(far(wet),E.CityEnvironment.cellColor(structuredClone(wet),i),'neighbour edits left a stale far color');
 const dry=fixture({arid:.15}),dryCover=E.CityEnvironment.landCover(dry,i);
 assert(dryCover.vegetation<flat.vegetation*.4&&dryCover.soil>.7);
 for(const cover of [flat,cliff,dryCover]){
  assert(Math.abs(cover.rock+cover.soil+cover.vegetation-1)<1e-12);
  assert(Object.values(cover).every(Number.isFinite));
 }
 const low=fixture({height:300});assert.deepEqual(far(low),base,'elevation alone removed the same climate and vegetation');
});

test('dry sandstone and basalt remain earth and rock rather than acquiring generic green',()=>{
 const red=fixture({kind:1,biome:13,arid:.15,temp:18}),basalt=fixture({kind:2,biome:13,arid:.15,temp:18});
 for(const color of [far(red),near(red)])assert(color[0]>color[1]+.13&&color[0]>color[2]+.25);
 assert(gap(far(red),far(basalt))>.3);
 for(const w of [red,basalt]){
  assert(!green(far(w))&&!green(near(w)));
  assert(E.CityEnvironment.landCover(w,i).soil>.7);
  for(let j=0;j<E.GN;j++)w.height[j]+=(j%E.GW-x)*1800;
  const cover=E.CityEnvironment.landCover(w,i);assert(cover.rock>.75);
  const color=near(w);assert(color.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 }
 assert(near(basalt).every(c=>c<.3),'exposed basalt was bleached to ordinary grey stone');
});

test('water, permanent snow and ice keep priority over v3 mineral pigments',()=>{
 for(const config of [{height:-10,biome:0},{lake:3400,biome:15},{biome:17,temp:-18,ice:90},{biome:1,temp:-12},{biome:16,temp:-18,ice:300}]){
  const plain=fixture(config),legacy=fixture({...config,version:2});
  assert.deepEqual(far(plain),far(legacy));assert.deepEqual(near(plain,{slope:1}),near(legacy,{slope:1}));
  for(const kind of [1,2,3,4]){
   const marked=fixture({...config,kind});assert.deepEqual(far(marked),far(plain));assert.deepEqual(near(marked,{slope:1}),near(plain,{slope:1}));
   const cover=E.CityEnvironment.landCover(marked,i);assert.equal(cover.rock+cover.vegetation+cover.soil,0);
  }
 }
});

test('version changes invalidate both color caches and restore legacy colors exactly',()=>{
 const w=fixture({version:2,kind:3});w.height[i+1]+=700;
 const before=far(w),detail=near(w,{slope:1.1});w.params.landformVersion=3;
 assert(gap(before,far(w))>.06);assert(gap(detail,near(w,{slope:1.1}))>.08);
 w.params.landformVersion=2;assert.deepEqual(far(w),before);assert.deepEqual(near(w,{slope:1.1}),detail);
});

test('v3 detail interpolates material and cover transitions without parent-cell seams',()=>{
 const w=fixture({kind:1});
 for(let j=0;j<E.GN;j++){const x=j%E.GW;if(x>=150){w.landform[j]=2;w.arid[j]=.3;w.biome[j]=13;}w.height[j]+=Math.max(0,x-149)*450;}
 const base=(x,y)=>{
  const ax=Math.floor(x),ay=Math.floor(y),u=x-ax,v=y-ay,ids=[ay*E.GW+ax,ay*E.GW+ax+1,(ay+1)*E.GW+ax,(ay+1)*E.GW+ax+1],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v],out=[0,0,0];
  for(let j=0;j<4;j++){const c=E.CityEnvironment.cellColor(w,ids[j]);for(let k=0;k<3;k++)out[k]+=c[k]*weights[j];}return out;
 };
 for(const x of [148.8,149,149.5,150,150.3,151])for(const y of [89,89.7,90,90.3]){
  const a=E.LandscapeColor.sample(w,x-1e-6,y,base(x-1e-6,y),{slope:.7}),b=E.LandscapeColor.sample(w,x+1e-6,y,base(x+1e-6,y),{slope:.7});
  assert(gap(a,b)<1e-4);assert(a.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 }
});

test('v3 substrate joins protected ice and snow without switching palettes at a cell boundary',()=>{
 const w=fixture({biome:16,temp:-18,ice:300});
 for(let j=0;j<E.GN;j++)if(j%E.GW>=150){w.biome[j]=12;w.temp[j]=7;w.ice[j]=0;}
 const base=x=>{const a=Math.floor(x),u=x-a,A=E.CityEnvironment.cellColor(w,y*E.GW+a),B=E.CityEnvironment.cellColor(w,y*E.GW+a+1);return A.map((v,k)=>v+(B[k]-v)*u);};
 for(const x of [148,149,150,151])for(let j=0;j<30;j++){
  const y=89+j*.1,left=E.LandscapeColor.sample(w,x-1e-6,y,base(x-1e-6),{slope:1.1}),right=E.LandscapeColor.sample(w,x+1e-6,y,base(x+1e-6),{slope:1.1});
  assert(gap(left,right)<1e-4,`protected surface seam at ${x},${y}: ${gap(left,right)}`);
 }
});

test('changing only colors on the v2 default restores wet highlands without greening dry plateaus',async()=>{
 const params={seed:'Aereth-47',form:'global',plates:24,continents:6,islands:1.2,volcanism:.85,uplift:1.2,sea:0,aridity:.85,current:1,erosion:.7,temperature:0,glaciation:1.2,landformVersion:2};
 const w=await E.generateWorld(params),old=new Map();let dryGreen=0,newGrey=0,oldGrey=0,wetCount=0,dryCount=0;
 for(let j=0;j<E.GN;j++)if(w.height[j]>1200&&w.lake[j]<=0&&w.ice[j]<=25&&w.arid[j]>.7&&w.temp[j]>-1&&E.CityEnvironment.cellCover(w,j)<.2){
  const x=j%E.GW,y=Math.floor(j/E.GW),base=E.CityEnvironment.cellColor(w,j);
  const cover=E.CityEnvironment.cellCover(w,j),snow=[233/255,241/255,244/255],nearBase=cover>.05?base.map((v,k)=>v+(snow[k]-v)*Math.min(1,cover*.8)):base;
  old.set(j,E.LandscapeColor.sample(w,x,y,nearBase,{slope:E.CityEnvironment.atlasGrade(w,x,y)}));
 }
 w.params.landformVersion=3;
 for(const [j,color] of old){
  wetCount++;if(grey(color))oldGrey++;
  const base=E.CityEnvironment.cellColor(w,j),cover=E.CityEnvironment.cellCover(w,j),snow=[233/255,241/255,244/255],nearBase=cover>.05?base.map((v,k)=>v+(snow[k]-v)*Math.min(1,cover*.8)):base;
  const detail=E.LandscapeColor.sample(w,j%E.GW,Math.floor(j/E.GW),nearBase);
  if(grey(detail))newGrey++;
 }
 for(let j=0;j<E.GN;j++)if(w.height[j]>1200&&w.lake[j]<=0&&w.ice[j]<=25&&w.arid[j]<.35){dryCount++;if(green(E.CityEnvironment.cellColor(w,j)))dryGreen++;}
 assert(wetCount>500&&dryCount>1000,'fixture no longer exercises wet mountains and dry highlands');
 assert(oldGrey/wetCount>.25,'fixture no longer exercises the original grey-material regression');
 assert(newGrey<oldGrey*.15,`wet highlands still become grey at close zoom: ${newGrey}/${wetCount}`);
 assert(dryGreen/dryCount<.01,'the color fix turned dry highlands into green forest');
});

const LEGACY_COLOR_DIGESTS=[
 '5470be6d206d9493287cc796542c586c19d77c658a632ddd95f50a43507f5a4a',
 'b9f959910c962fc2095731735a03ad2f03d6ca4ebf096f3a9fd7ad032f32abd8',
 'b9f959910c962fc2095731735a03ad2f03d6ca4ebf096f3a9fd7ad032f32abd8'
];
