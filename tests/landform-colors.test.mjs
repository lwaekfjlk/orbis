import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const files=['src/world/geography.js','src/city/environment.js','src/render/world-renderer.js','src/continuous/landscape-patterns.js','src/continuous/landscape-color.js'];
const E=Function(files.map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n')+'\nreturn{CityEnvironment,LandscapeColor,GN,GW};')();
const i=90*E.GW+150;
function fixture({kind=0,version=1,biome=12,height=3200,temp=9,arid=.9,lake=-1,ice=0}={}){
 const field=n=>new Float32Array(E.GN).fill(n);
 return{seed:471,params:{landformVersion:version},height:field(height),lake:field(lake),ice:field(ice),temp:field(temp),arid:field(arid),
  biome:new Uint8Array(E.GN).fill(biome),landform:new Uint8Array(E.GN).fill(kind),landformStrength:field(1)};
}
const far=w=>E.CityEnvironment.cellColor(w,i);
const near=(w,slope=.04,x=150.2,y=90.3)=>E.LandscapeColor.sample(w,x,y,far(w),{slope});
const distance=(a,b)=>Math.max(...a.map((v,k)=>Math.abs(v-b[k])));

test('missing and disabled landform versions preserve the original far and close colors exactly',()=>{
 const expected={far:[0.5954117647058823,0.6036323529411765,0.5297401960784314],
  near:[0.532381397934723,0.5362662161603992,0.4988301796074069],steep:[0.4942687647282361,0.5023114756427771,0.5041188674410153]};
 for(const version of [undefined,0])for(const kind of [0,1,2,3,4]){
  const w=fixture({kind,version:0});w.params.landformVersion=version;
  assert.deepEqual(far(w),expected.far);assert.deepEqual(near(w),expected.near);assert.deepEqual(near(w,1.1),expected.steep);
 }
});

test('sandstone and basalt remain distinct at world scale and on detailed steep faces',()=>{
 const red=fixture({kind:1}),basalt=fixture({kind:2});
 for(const color of [far(red),near(red),near(red,1.1)]){
  assert(color[0]-color[1]>.14,'red strata were repainted neutral grey');
  assert(color[0]-color[2]>.28,'sandstone lost its warm mineral identity');
 }
 const dark=near(basalt,1.1);assert(dark.every(v=>v<.30),'basalt outcrop is still pale grey');
 assert(dark[2]>dark[0]+.035,'basalt needs a cool mineral tone');
 assert(far(basalt)[1]>far(basalt)[0]+.02,'vegetation between basalt outcrops remains visible');
 assert(distance(far(red),far(basalt))>.25);
 const folded=near(fixture({kind:3}),1.1),limestone=near(fixture({kind:4}),1.1);
 assert(limestone.every((v,k)=>v>folded[k]+.15),'limestone pinnacles lost their pale rock');
 const sand=fixture({kind:2,biome:4,height:1100,temp:27,arid:.1}),sandFloor=near(sand),sandRim=near(sand,1.1);
 assert(sandRim[2]>sandRim[0]+.025,'a basalt rim inside a desert is painted with its sandy floor hue');
 assert(sandRim[0]<sandFloor[0]-.06,'steep desert faces never expose their underlying volcanic rock');
});

test('high flat meadow keeps cover while actual slopes expose rock, including after a cached neighbor edit',()=>{
 const w=fixture(),flat=far(w),flatNear=near(w),steepNear=near(w,1.1);
 assert(flatNear[1]-flatNear[2]>.07,'height alone painted a flat meadow grey');
 assert(flatNear[1]-flatNear[2]>steepNear[1]-steepNear[2]+.05);
 w.height[i+1]+=700;
 const steep=far(w);assert(distance(flat,steep)>.006,'adjacent relief did not invalidate the color cache');
 assert.deepEqual(steep,E.CityEnvironment.cellColor(structuredClone(w),i));
});

test('cached colors observe changed rock families, their strength and the version gate',()=>{
 const w=fixture({kind:1}),red=far(w);
 w.landform[i]=2;const basalt=far(w);assert(distance(red,basalt)>.25);
 assert.deepEqual(basalt,E.CityEnvironment.cellColor(structuredClone(w),i));
 w.landformStrength[i]=.25;const edge=far(w);assert(distance(edge,basalt)>.1);
 assert.deepEqual(edge,E.CityEnvironment.cellColor(structuredClone(w),i));
 w.params.landformVersion=0;assert.deepEqual(far(w),far(fixture({version:0})));
});

test('water, permanent snow and glacier palettes take precedence over lithology',()=>{
 for(const config of [{height:-10,biome:0},{lake:3400,biome:15},{biome:17,temp:-18,ice:90},{biome:1,temp:-12},{biome:16,temp:-18,ice:300}]){
  const plain=fixture(config);
  for(const kind of [1,2,3,4]){
   const marked=fixture({...config,kind});
   assert.deepEqual(far(marked),far(plain),'landform pigment changed water, snow or ice');
   for(const slope of [.04,1.1])assert.deepEqual(near(marked,slope),near(plain,slope));
  }
 }
});

test('red-to-basalt materials interpolate continuously across categorical parent-cell boundaries',()=>{
 const w=fixture({kind:1});for(let y=0;y<E.GN/E.GW;y++)for(let x=150;x<E.GW;x++)w.landform[y*E.GW+x]=2;
 const base=(x,y)=>{
  const ax=Math.floor(x),ay=Math.floor(y),u=x-ax,v=y-ay,ids=[ay*E.GW+ax,ay*E.GW+ax+1,(ay+1)*E.GW+ax,(ay+1)*E.GW+ax+1],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v],out=[0,0,0];
  for(let j=0;j<4;j++){const c=E.CityEnvironment.cellColor(w,ids[j]);for(let k=0;k<3;k++)out[k]+=c[k]*weights[j];}return out;
 };
 for(const x of [148.8,149,149.5,150,150.3,151])for(const y of [89,89.7,90,90.3]){
  const a=E.LandscapeColor.sample(w,x-1e-6,y,base(x-1e-6,y),{slope:.7}),b=E.LandscapeColor.sample(w,x+1e-6,y,base(x+1e-6,y),{slope:.7});
  assert(distance(a,b)<1e-4,'a categorical material seam appeared');
  assert(a.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 }
});

test('sandstone rock bands follow actual changing heights and remain deterministic',()=>{
 const w=fixture({kind:1});for(let j=0;j<E.GN;j++)w.height[j]+=(j%E.GW-150)*240;
 const samples=Array.from({length:30},(_,k)=>near(w,1.1,150+k/30,90.3));
 assert(Math.max(...samples.map(c=>c[0]))-Math.min(...samples.map(c=>c[0]))>.1,'physical rock layers have no visible tone change');
 for(let k=0;k<samples.length;k++)assert.deepEqual(samples[k],near(w,1.1,150+k/30,90.3));
});

test('the emitted loose-rock branch changes material only, preserving legacy, snow and geometry arguments',()=>{
 const source=readFileSync(new URL('../src/continuous/city-layer.js',import.meta.url),'utf8');
 const branch=source.slice(source.indexOf('if(steep>.62&&roll<.34){'),source.indexOf('const can=CityEnvironment.canopy(e.biome'));
 const emit=Function('w','CityEnvironment','snow',`const e={parentIndex:${i},snow},steep=1,roll=.2,AtlasSpace={TOWN_UNIT:.04},rock={},jx=150.2,jy=90.3,gx=150,gy=90,rnd=()=>.37;let stones=0,result;
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),clamp=v=>Math.max(0,Math.min(1,v)),colorMix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t),colorScale=(c,s)=>c.map(v=>v*s);
  const layer={surfaceFragment(...args){result=args;}};for(let once=0;once<1;once++){${branch.replace('this.surfaceFragment','layer.surfaceFragment')}}return result.slice(1);`);
 const legacy=emit(fixture({version:0}),E.CityEnvironment,0),red=emit(fixture({kind:1}),E.CityEnvironment,0),basalt=emit(fixture({kind:2}),E.CityEnvironment,0);
 assert.deepEqual(red.slice(0,5),legacy.slice(0,5));assert.deepEqual(basalt.slice(0,5),legacy.slice(0,5));
 assert(red[5][0]-red[5][1]>.25);assert(basalt[5].every(v=>v<.25));
 assert.deepEqual(emit(fixture({kind:1,version:0}),E.CityEnvironment,0),legacy);
 assert.deepEqual(emit(fixture({kind:1}),E.CityEnvironment,1),legacy);
});
