import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadEngine,defaults} from './engine-loader.mjs';

const E=loadEngine(),seeds=['Aereth-47','Landforms-Mesa-2','Landforms-Folds-3'],worlds=[];
// Captured from published cca797e, not from the current implementation.
const publishedV1={
 "Aereth-47": "cc6eeb88561cf7a484e01cf5bbd76c0fd2ee9f342a8af816abfdb26fe69edddf",
 "Landforms-Mesa-2": "08d278751c78132522a448aab3486fa09fb375838411da952b27f7c8eaea7fcc",
 "Landforms-Folds-3": "73a7fc19c3b5441a0b0be2b5ce8b38dcd1daa36fd9f4218f1729ec3ff32837e0"
};
// Captured independently from published efdca8d before the v3 changes.
const publishedV2={
    "Aereth-47": "d641c2659031d41c52842bd7510d502123c32a31243839c5377546d923c6cfee",
    "Landforms-Mesa-2": "9229fe4f33f6f2bf73e698d21566dfe7e89592931768f518bf3dd89d243353a7",
    "Landforms-Folds-3": "9b80e13cf0e9d69eb5a16ac938b288df5cfcc44bd98cadbfceef9072c167f924"
  };
const digest=w=>{
 const hash=createHash('sha256');
 for(const key of Object.keys(w).sort()){
  const arrays=ArrayBuffer.isView(w[key])?[w[key]]:Array.isArray(w[key])&&w[key].every(ArrayBuffer.isView)?w[key]:[];
  for(let k=0;k<arrays.length;k++){const a=arrays[k];hash.update(`${key}/${k}/${a.constructor.name}`);hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
 }
 return hash.digest('hex');
};
test.before(async()=>{
 for(const seed of seeds)worlds.push({seed,old:await E.generateWorld({...defaults,seed,landformVersion:1}),next:await E.generateWorld({...defaults,seed,landformVersion:2})});
});

const sample=(w,r,u,v)=>{
 const x=r.center.x+u*Math.cos(r.axis)-v*Math.sin(r.axis),y=r.center.y+u*Math.sin(r.axis)+v*Math.cos(r.axis);
 const a=Math.floor(x),b=Math.floor(y),s=x-a,t=y-b,h=(dx,dy)=>w.height[(b+dy)*E.GW+a+dx];
 return(h(0,0)*(1-s)+h(1,0)*s)*(1-t)+(h(0,1)*(1-s)+h(1,1)*s)*t;
};
// Measure the final sampled surface, never the generator's graph or peak nodes.
// Parallel combs concentrate both transverse wavelengths and slope directions;
// changing their peak heights and longitudinal phases does not remove that signal.
function morphology(height,r){
 const counts=[],gaps=[],periods=[];let gx=0,gy=0,weight=0;
 for(const along of [-.55,-.4,-.25,-.1,.05,.2,.35,.5]){
  const hs=[];for(let v=-r.ry*.72;v<=r.ry*.72;v+=.25)hs.push(height(along*r.rx,v));
  const peaks=[];
  for(let k=6;k<hs.length-6;k++)if(hs[k]>hs[k-1]&&hs[k]>=hs[k+1]&&hs[k]-Math.min(...hs.slice(k-6,k+7))>250){
   if(!peaks.length||(k-peaks.at(-1))*.25>=2)peaks.push(k);
   else if(hs[k]>hs[peaks.at(-1)])peaks[peaks.length-1]=k;
  }
  counts.push(peaks.length);for(let k=1;k<peaks.length;k++)gaps.push((peaks[k]-peaks[k-1])*.25);
  const mean=hs.reduce((a,b)=>a+b,0)/hs.length,power=[];
  for(let f=1;f<=12;f++){
   let a=0,b=0;
   for(let k=0;k<hs.length;k++){
    const z=(hs[k]-mean)*(.5-.5*Math.cos(2*Math.PI*k/(hs.length-1))),angle=2*Math.PI*f*k/hs.length;
    a+=z*Math.cos(angle);b+=z*Math.sin(angle);
   }
   power.push(a*a+b*b);
  }
  const total=power.reduce((a,b)=>a+b,0);let periodic=0;
  for(let k=0;k<power.length;k++){const wavelength=hs.length*.25/(k+1);if(wavelength>=3&&wavelength<=7)periodic=Math.max(periodic,power[k]/Math.max(1,total));}
  periods.push(periodic);
 }
 for(let u=-r.rx*.6;u<=r.rx*.6;u+=.5)for(let v=-r.ry*.65;v<=r.ry*.65;v+=.5){
  const dx=(height(u+.3,v)-height(u-.3,v))/.6,dy=(height(u,v+.3)-height(u,v-.3))/.6,m=Math.hypot(dx,dy);
  if(m<100)continue;
  gx+=(dx*dx-dy*dy)/m;gy+=2*dx*dy/m;weight+=m;
 }
 return{counts,periodic:periods.reduce((a,b)=>a+b,0)/periods.length,directional:Math.hypot(gx,gy)/Math.max(1,weight)};
}

function elevatedNetwork(w,r){
 const points=new Map(),floor=r.level+250;let n=0;
 for(let a=0;a<=Math.floor(r.rx*1.1);a++)for(let b=0;b<=Math.floor(r.ry*1.3);b++){
  const u=a-r.rx*.55,v=b-r.ry*.65;if(sample(w,r,u,v)>floor)points.set(a+','+b,{a,b,u,v});n++;
 }
 const seen=new Set(),components=[];
 for(const [start,p] of points){
  if(seen.has(start))continue;const todo=[p],group=[];seen.add(start);
  while(todo.length){const q=todo.pop();group.push(q);for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const key=(q.a+dx)+','+(q.b+dy);if(points.has(key)&&!seen.has(key)){seen.add(key);todo.push(points.get(key));}}}
  components.push(group);
 }
 const largest=components.sort((a,b)=>b.length-a.length)[0]||[];
 const along=largest.length?Math.max(...largest.map(p=>p.u))-Math.min(...largest.map(p=>p.u)):0;
 return{share:largest.length/Math.max(1,points.size),along,coverage:points.size/n};
}

test('all three published v1 worlds retain every typed raster byte',()=>{
 for(const{seed,old}of worlds)assert.equal(digest(old),publishedV1[seed],seed+' changed an already published v1 save');
 assert.equal(E.physicalFingerprint(worlds[0].old),'cc113c81');
});

test('all three published v2 worlds retain every typed raster byte',()=>{
 for(const{seed,next}of worlds)assert.equal(digest(next),publishedV2[seed],seed+' changed a published v2 save');
});

test('v2 bedrock changes stay within mountain regions and their blended edges before climate is recomputed',()=>{
 for(const{seed,old,next:w}of worlds){
  const mountains=w.landformRegions.filter(r=>r.type===3);
  assert.deepEqual(w.landform,old.landform);assert.deepEqual(w.landformRegion,old.landformRegion);
  let changed=0,climate=0;
  for(let i=0;i<E.GN;i++){
   assert.equal(w.height[i]>0,old.height[i]>0,seed+' changed the coastline');
   // A later volcanic region can blend over a mountain's edge. Its final material
   // ID does not erase the underlying mountain's contribution to that transition.
   if(w.landform[i]!==3&&w.landformStrength[i]===1)assert.equal(w.height[i],old.height[i],seed+' altered another landform core');
   if(w.height[i]!==old.height[i]){
    changed++;
    assert(mountains.some(r=>{
     const dx=i%E.GW-r.center.x,dy=Math.floor(i/E.GW)-r.center.y;
     return Math.hypot((dx*Math.cos(r.axis)+dy*Math.sin(r.axis))/r.rx,(-dx*Math.sin(r.axis)+dy*Math.cos(r.axis))/r.ry)<1.12;
    }),seed+' altered ground outside the mountain regions');
   }
   if(Math.abs(w.temp[i]-old.temp[i])>.3||Math.abs(w.rain[i]-old.rain[i])>.05)climate++;
   if(old.basinPrior[i]||old.fjord[i]||old.height[i]<=0)assert.equal(w.height[i],old.height[i]);
  }
  assert(changed>700&&climate>300);assert(w.audit.finite&&w.audit.topology);
  assert.equal(w.audit.downhillErrors,0);assert.equal(w.riverCycleCells,0);assert(w.waterBudgetError<1e-8);
 }
});

test('new high mountain blocks are coherent, varied and free of parallel comb structure',()=>{
 for(const{seed,next:w}of worlds)for(const r of w.landformRegions.filter(r=>r.type===3)){
  const shape=morphology((u,v)=>sample(w,r,u,v),r),network=elevatedNetwork(w,r);
  assert(shape.periodic<.32,seed+'/'+r.id+' still repeats a fixed transverse wavelength');
  assert(shape.directional<.72,seed+'/'+r.id+' remains a set of similarly oriented narrow walls');
  assert(new Set(shape.counts).size>1,seed+'/'+r.id+' repeats the same cross-section along its length');
  assert(network.share>.5&&network.along>r.rx*.65,seed+'/'+r.id+' is disconnected hills rather than a mountain belt');
  assert(r.statistics.maxHeight>3500&&r.statistics.relief>1800,seed+'/'+r.id+' lost high mountains and deep valleys');
  assert.equal(w.landformRegion[r.i],r.id);assert(w.lake[r.i]<0&&w.ice[r.i]<80,'the viewpoint must show its terrain');
 }
});

test('the shape detector rejects equal-spacing ridges even with random-looking peak heights and phases',()=>{
 for(const r of worlds[0].old.landformRegions.filter(r=>r.type===3)){
  const actual=morphology((u,v)=>sample(worlds[0].old,r,u,v),r);
  assert(actual.periodic>=.32&&actual.directional>=.72,'the published staggered comb must fail the new morphology requirements');
 }
 const r={rx:26,ry:11},impostor=(u,v)=>{
  let height=0;
  for(let k=-3;k<=3;k++){
   const center=k*4.7+Math.sin(u*.07+k*1.31)*.45,profile=Math.max(0,1-Math.abs(v-center)/1.6);
   height=Math.max(height,profile**1.5*(1650+Math.sin(k*2.3)*420)*(.8+.2*Math.cos(u/(3.1+k*.12)+k*2.2)));
  }
  return 1500+height;
 };
 const fake=morphology(impostor,r);assert(fake.periodic>=.32&&fake.directional>=.72,'cosmetic randomness must not hide regular comb topology');
});

test('v2 morphology replays deterministically without changing the published v1 output',async()=>{
 const again=await E.generateWorld({...defaults,landformVersion:2});
 assert.equal(digest(again),digest(worlds[0].next));assert.deepEqual(again.landformRegions,worlds[0].next.landformRegions);
});
