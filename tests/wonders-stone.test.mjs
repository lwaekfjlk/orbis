import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {LandmarkCatalog,SacredCityKit};')();
const ids=['dread-keep','deep-city','dragon-court','forge-hollow','gilded-palace'];
const recipe=id=>({...E.LandmarkCatalog.recipe('river','stone-wonders-qa'),sacred:true,wonder:id,faith:'sun',complexity:1,roofPitch:1});
const models=new Map(ids.map(id=>[id,E.SacredCityKit.build(recipe(id),{lod:1})]));
const hash=m=>{const h=createHash('sha256');for(const p of m.parts)h.update(Buffer.from(Float32Array.from(p.geometry.data).buffer));return h.digest('hex')};
const parts=(id,part)=>models.get(id).parts.filter(p=>!part||p.id===part);
function faces(pp){return pp.flatMap(p=>{const faces=[];for(let i=0;i<p.geometry.data.length;i+=27)faces.push([0,9,18].map(j=>p.geometry.data.slice(i+j,i+j+3)));return faces})}
// Intersections of a line parallel to axis at fixed coordinates on the other axes.
function ray(pp,axis,u,v){const axes=[0,1,2].filter(a=>a!==axis),hits=[];for(const [a,b,c]of faces(pp)){
 const A=axes[0],B=axes[1],ab=[b[A]-a[A],b[B]-a[B]],ac=[c[A]-a[A],c[B]-a[B]],det=ab[0]*ac[1]-ab[1]*ac[0];if(Math.abs(det)<1e-9)continue;
 const x=u-a[A],y=v-a[B],s=(x*ac[1]-y*ac[0])/det,t=(ab[0]*y-ab[1]*x)/det;
 if(s>=-1e-8&&t>=-1e-8&&s+t<=1+1e-8)hits.push(a[axis]+s*(b[axis]-a[axis])+t*(c[axis]-a[axis]));
 }return hits}
function assertClosed(pp){const edges=new Map();let volume=0;for(const [a,b,c]of faces(pp)){
 const keys=[a,b,c].map(p=>p.map(n=>Math.round(n*1e6)).join(','));for(let j=0;j<3;j++){const key=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(key,(edges.get(key)||0)+1)}
 volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 }assert.equal([...edges.values()].filter(n=>n%2).length,0,'every exposed boundary has a matching face');assert.ok(volume>0,'closed solids must face outward')}

test('all five stone wonders retain distinct deterministic city-scale geometry within the parcel budget',()=>{
 const shapes=new Set();for(const id of ids){const model=models.get(id);assert.ok(model.stats.triangles>5000&&model.stats.triangles<100000,id);assert.ok(model.parts.length>=4,id);assert.ok(model.parts.some(p=>p.role==='roof'),id+' removable roofs');
  for(const p of model.parts)for(const v of p.geometry.data)assert.ok(Number.isFinite(v),id);
  const {min,max}=model.bounds;assert.ok(max[0]-min[0]>12&&max[0]-min[0]<52,id);assert.ok(max[1]-min[1]>18&&max[1]-min[1]<70,id);
  const shape=hash(model);assert.equal(shape,hash(E.SacredCityKit.build(recipe(id),{lod:1})),id+' deterministic replay');shapes.add(shape);
 }assert.equal(shapes.size,ids.length);
});
test('deep-city portal has a real nine-unit recess and galleries leave its mouth clear',()=>{
 const middle=ray(parts('deep-city'),2,0,7);assert.ok(middle.length>0);assert.ok(Math.max(...middle)<-17,'no cliff slab or gallery crosses the open mouth');
 assert.ok(ray(parts('deep-city','cut-face'),2,8,7).some(z=>Math.abs(z+8)<.001),'solid mountain shoulder remains');
 assert.ok(!ray(parts('deep-city','gallery-terraces'),2,0,7).length,'gallery slabs do not cross the portal');
 const floor=ray(parts('deep-city','cut-face'),1,0,-12);assert.ok(floor.some(y=>Math.abs(y-1.5)<.001),'tunnel floor connects to the portal threshold');
});
test('deep-city rock crown and bevelled shoulders break the rectangular cliff silhouette',()=>{
 const cliff=parts('deep-city','cut-face'),heights=[-16,-10,0,10,16].map(x=>Math.max(...ray(cliff,1,x,-12)));
 assert.ok(Math.max(...heights)-Math.min(...heights)>2,'mountain crown has substantial relief');
 assert.ok(Math.max(...ray(cliff,2,17.9,12))<-10,'outer shoulder is bevelled behind the worked face');
 assert.ok(models.get('deep-city').bounds.max[1]<=30,'rock articulation retains the canonical height');
});
test('forge excavation has closed retaining rings and fifty continuous descending treads',()=>{
 assertClosed(parts('forge-hollow','quarried-bowl'));
 assert.ok(models.get('forge-hollow').bounds.min[1]<-9,'excavation stays genuinely below ground');
 const rim=ray(parts('forge-hollow','quarried-bowl'),1,15.5,0);assert.ok(rim.some(y=>Math.abs(y)<.001));
 const lower=ray(parts('forge-hollow','quarried-bowl'),1,5,0);assert.ok(lower.some(y=>Math.abs(y+7.6)<.001));
 for(let j=0;j<50;j++){const z=17-(j+.5)*.26,hits=ray(parts('forge-hollow','gallery-rings'),1,0,z);assert.ok(hits.length,'missing tread '+j);assert.ok(Math.abs(Math.max(...hits)+j*.19)<.001,'incorrect rise at tread '+j);}
 const opening=ray(parts('forge-hollow','great-forge'),2,0,-7);assert.ok(opening.every(z=>z<1.2),'furnace mouth remains open in front of its inner chamber');
});
test('forge stair shoulders and its full bottom shell block views through the excavated earth',()=>{
 const model=models.get('forge-hollow');assert.equal(model.bounds.min[1],-9.8,'closing the shell must not deepen the authored floor');
 for(const x of[-2.1,2.1])for(const z of[16,13,10,7,4.7]){const hits=ray(parts('forge-hollow','gallery-rings'),1,x,z);assert.ok(hits.length,'unfilled stair shoulder at '+x+','+z);assert.ok(Math.max(...hits)>-9.6,'shoulder reaches its tread level');}
 for(const [x,z]of[[2.1,16],[-2.1,13],[4.2,4.2],[-8,2],[10,-7]]){const hits=ray(parts('forge-hollow','quarried-bowl'),1,x,z);assert.ok(hits.some(y=>Math.abs(y+9.6)<.001),'full excavation has no bottom at '+x+','+z);}
});
test('dragon court is a joined curved hall with a closed roof and outward-facing court windows',()=>{
 const pp=parts('dragon-court','long-hall-roof');assert.ok(pp.length);assertClosed(pp);
 const hall=parts('dragon-court','long-hall');const front=ray(hall,2,0,11.9);assert.ok(front.some(z=>z<-6),'continuous inner gallery wall');
 // A single curved range spans the back and both flanks while leaving a court.
 assert.ok(hall[0].bounds.min[0]<-14&&hall[0].bounds.max[0]>14);assert.ok(!ray(hall,1,0,4).length,'central courtyard remains open');
});
test('both dragon hall end bays have projecting window reveals on their outward faces',()=>{
 const hall=parts('dragon-court','long-hall');for(const side of[-1,1]){const t=side*1.13,cx=-Math.sin(t)*13,cz=3.5-Math.cos(t)*13,nx=-side*Math.cos(t),nz=side*Math.sin(t);
  const exterior=faces(hall).flat().filter(p=>p[1]>8.7&&p[1]<11.2&&(p[0]-cx)*nx+(p[2]-cz)*nz>.10);
  assert.ok(exterior.length>30,'end bay '+side+' has no outward upper-window detail');
 }
});
test('dragon court basin is visible above the upper terrace and its stair reaches that terrace',()=>{
 const basin=ray(parts('dragon-court','hoard-court'),1,.8,2.2),under=ray(parts('dragon-court','scaled-terraces'),1,.8,2.2);
 assert.ok(Math.max(...basin)>Math.max(...under)+.25,'terrace no longer buries the basin surface');
 assert.ok(Math.max(...ray(parts('dragon-court'),1,.8,2.2))===Math.max(...basin),'no other structure covers the water');
 for(const x of[-6,6])assert.ok(Math.min(...ray(parts('dragon-court','hoard-court'),1,x,2))>=3.5,'fountain plinth remains above the terrace');
 assert.ok(ray(parts('dragon-court','scaled-terraces'),1,0,4.88).some(y=>Math.abs(y-3.5)<.001),'upper stair joins the capped terrace');
});
test('gilded palace roof is seated on its cornice and the balcony is supported by two column lines',()=>{
 const roof=parts('gilded-palace','gilded-ranges-roof');const heightAtEave=ray(roof,1,8,-11).filter(y=>y>13);
 assert.ok(heightAtEave.length);assert.ok(Math.min(...heightAtEave)<14,'main roof eave rests at the hall cornice, not at an unsupported second roof');
 const front=parts('gilded-palace','gold-front');for(const z of[-3.55,-6.15])for(const x of[-6,-3,3,6])assert.ok(ray(front,1,x,z).some(y=>y<=2.91),'loggia column reaches its plinth');
 assert.ok(ray(front,1,0,-4.85).some(y=>Math.abs(y-8.68)<.001),'balcony slab spans the column capitals');
});
test('dread keep gate is a deep chamber with an inset grille and tapered horns',()=>{
 const gate=parts('dread-keep','gate-of-horns');assert.ok(gate[0].bounds.max[2]-gate[0].bounds.min[2]>4);
 const grille=ray(gate,2,0,3.35);assert.ok(grille.some(z=>Math.abs(z-15.27)<.001),'grille is set behind the 17-unit front face');assert.ok(grille.every(z=>z<16),'opening is not blocked at the front');
 assert.ok(models.get('dread-keep').stats.modules['tapered-horn']>=8,'horns are tapered solids rather than uniform rods');
});
