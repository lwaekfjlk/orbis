import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
const E=Function(scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n')+'\nreturn {SacredCityKit,LandmarkCatalog,ArtisanCityKit};')();
const ids=['sky-crystal','suspended-tower','sunless-well','sky-court'];
const make=(id,lod=1)=>E.SacredCityKit.build(E.LandmarkCatalog.recipe('arcane','arcane-craft-qa',{wonder:id,faith:'sun'}),{lod});
const models=Object.fromEntries(ids.map(id=>[id,make(id)]));
function triangles(parts){return parts.flatMap(p=>{const out=[],d=p.geometry.data;for(let i=0;i<d.length;i+=27)out.push({p:[0,9,18].map(j=>d.slice(i+j,i+j+3)),n:d.slice(i+3,i+6),role:p.role});return out})}
function floorAt(ts,x,z,maxY=100,minY=-100){let best=-Infinity;for(const {p:[a,b,c],n}of ts){if(n[1]<.99)continue;const det=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);if(Math.abs(det)<1e-8)continue;const px=x-a[0],pz=z-a[2],u=(px*(c[2]-a[2])-pz*(c[0]-a[0]))/det,v=((b[0]-a[0])*pz-(b[2]-a[2])*px)/det;if(u<-.00001||v<-.00001||u+v>1.00001)continue;const y=a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);if(y<=maxY&&y>=minY)best=Math.max(best,y)}return best}
const hash=m=>{const h=createHash('sha256');for(const p of m.parts)h.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));return h.digest('hex')};

test('all four arcane wonders replay deterministically and fit the original placement contract',()=>{
 for(const id of ids){const m=models[id];assert.equal(hash(m),hash(make(id)),id);assert.ok(m.stats.triangles<50000,id+' street mesh budget');
  for(let axis=0;axis<3;axis++){const extent=m.bounds.max[axis]-m.bounds.min[axis];assert.ok(extent>=12&&extent<=(axis===1?70:52),id+' bounds')}
  assert.ok(m.parts.some(p=>p.role==='roof'),id+' removable roofs');for(const p of m.parts)assert.ok(p.geometry.data.every(Number.isFinite),id+' finite vertices');
  const placed=E.ArtisanCityKit.meshAt(m,{x:20,y:3,z:-12,w:31,d:29,angle:0});
  for(const g of[placed.body,placed.roof])for(let i=0;i<g.data.length;i+=9){assert.ok(g.data[i]>=4.5-.001&&g.data[i]<=35.5+.001,id+' parcel x');assert.ok(g.data[i+2]>=-26.5-.001&&g.data[i+2]<=2.5+.001,id+' parcel z')}
 }
 assert.equal(new Set(Object.values(models).map(hash)).size,4);
});

test('the well mouth is truly open to its negative-depth floor',()=>{
 const m=models['sunless-well'],ts=triangles(m.parts);assert.equal(m.bounds.min[1],-25.6);
 for(const [x,z]of[[0,0],[1,0],[-1,1],[0,-2],[2,1]])assert.ok(floorAt(ts,x,z)<-25.5,'the rim must never cap the shaft');
 const rim=triangles(m.parts.filter(p=>p.id==='rim-court'));for(const [x,z]of[[12,0],[-12,0],[0,-12]])assert.equal(floorAt(rim,x,z,1.21),1.2,'the surrounding court retains its bearing floor');
});

test('both helical stairs have a bearing tread throughout the actual descent or ascent',()=>{
 for(const [id,part,turn,startY,rise,radius]of[
  ['suspended-tower','light-bridge',Math.PI*2*1.12,9.7,6.65,t=>6.35-.62*t],
  ['sunless-well','descending-shaft',Math.PI*2*2.5,1.2,-26.43,t=>10.4-Math.max(0,Math.min(25.6,26.43*t-1.2))*.55/3.2-1.01]
 ]){
  const ts=triangles(models[id].parts.filter(p=>p.id===part));let checked=0;
  for(let j=0;j<240;j++){const t=(j+.5)/240,a=Math.PI/2+turn*t,r=radius(t),expected=startY+rise*t,floor=floorAt(ts,Math.cos(a)*r,Math.sin(a)*r,expected+.3,expected-.4);assert.ok(Number.isFinite(floor),id+' leaves an unwalkable gap at '+t);checked++}
  assert.equal(checked,240);
 }
});

test('the floating crystal and severed tower preserve their unobstructed magical gaps',()=>{
 const crystal=models['sky-crystal'],stone=crystal.parts.find(p=>p.id==='suspended-stone'),support=crystal.parts.find(p=>p.id==='suspension-ring');assert.ok(stone.bounds.min[1]-support.bounds.max[1]>.70);
 const tower=models['suspended-tower'],upper=tower.parts.find(p=>p.id==='floating-shaft'),lower=tower.parts.find(p=>p.id==='lower-stump');assert.ok(upper.bounds.min[1]-lower.bounds.max[1]>3.5);
 const inGap=triangles(tower.parts).filter(t=>t.p.every(p=>p[1]>10.2&&p[1]<14.0));assert.ok(inGap.every(t=>t.p.every(p=>Math.hypot(p[0],p[2])>4)),'the lifting stair must stay outside the severed core');
});

test('resonator feet and observer galleries stand on their own connected foundations',()=>{
 const m=models['sky-crystal'],court=triangles(m.parts.filter(p=>p.id==='resonator-drum')),gallery=triangles(m.parts.filter(p=>p.id==='observers'));
 for(let j=0;j<8;j++){const a=j*Math.PI/4+.2;assert.equal(floorAt(court,Math.cos(a)*10.5,Math.sin(a)*10.5,6.01),6.0,'a buttress foot floats above the terrace')}
 for(const x of[-19.5,19.5])for(const z of[-4.9,4.9])assert.equal(floorAt(gallery,x,z,1.51),1.5,'an instrument gallery needs a bearing plinth');
});

test('the gathered felt canopy has thickness, mast connections, and one removable roof group',()=>{
 const m=models['sky-court'],canopy=m.parts.find(p=>p.id==='great-felt-canopy');assert.equal(canopy.role,'roof');assert.ok(canopy.bounds.min[1]<14&&canopy.bounds.max[1]>23);
 const ts=triangles([canopy]),vs=ts.flatMap(t=>t.p);
 for(let j=0;j<12;j++){const a=j*Math.PI/6;assert.ok(vs.some(p=>Math.abs(p[0]-Math.cos(a)*12.5)<.001&&Math.abs(p[2]-Math.sin(a)*12.5)<.001&&Math.abs(p[1]-14.2)<.001),'felt corner misses its mast')}
 assert.ok(ts.some(t=>t.n[1]<-.5),'a cloth roof needs a shaded underside');assert.ok(ts.some(t=>t.n[1]>.5),'top cloth faces must point outward');
 assert.equal(m.parts.filter(p=>p.role!=='roof'&&p.id==='standing-ring').length,1,'hiding cloth keeps the bearing masts');
 const hall=m.parts.find(p=>p.id==='felt-halls');assert.ok(hall.modules.includes('round-felt-hall'));assert.ok(m.parts.some(p=>p.id==='felt-halls-roof'));
});
