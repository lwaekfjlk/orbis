import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const files=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js'));
if(!files.includes('src/towns/street-frontage.js'))files.push('src/towns/street-frontage.js');
const E=Function(files.map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n')+'\nreturn {StreetFrontage,LandmarkCatalog,LandmarkKit,ArtisanCityKit,TownCatalog};')();
const F=E.StreetFrontage;
const rotate=(x,z,a)=>({x:x*Math.cos(a)-z*Math.sin(a),z:x*Math.sin(a)+z*Math.cos(a)});
function fixture({angle=0,w=4,d=4,side=[0,1],offset=0,lod=2,shop=true,dense=false}={}){
 const b={id:'street-proof',type:shop?'workshop':'home',angle,x:11,z:-7,w,d,lod,streetSocket:17,infill:dense,denseInfill:dense};
 const edge={x:b.x+side[0]*(w/2+.08)+(side[0]?0:offset),z:b.z+side[1]*(d/2+.08)+(side[1]?0:offset)},socket={x:edge.x+side[0]*2,z:edge.z+side[1]*2,i:17};
 const c={townRecipe:{seed:'entry-proof'},connectors:[{blockId:b.id,a:edge,b:socket}],xy:()=>({...socket})};
 const turned=Math.abs(Math.sin(angle))>.5,pw=turned?d:w,pd=turned?w:d,ratio=Math.max(.2,Math.min(5,pw/pd)),CW=9.8*Math.sqrt(ratio),CD=9.8/Math.sqrt(ratio);
 const p=F.plan(b,c,CW,CD,{cols:1,ranks:1});
 for(const h of p.houses){const turn=Math.abs(Math.sin(h.angle))>.5;Object.assign(h,{w:(turn?CD:CW)*.68,d:(turn?CW:CD)*.68,h:4.6,baseY:.18});}
 return{b,c,p};
}
function mesh(p,{material='masonry',climate={},houseRngMustStayIdle=false}={}){
 const recipe=E.LandmarkCatalog.recipe('basilica','street-mesh',{urbanStyle:'river'}),k=new E.LandmarkKit(recipe,{base:false,lod:p.lod});
 k.palette=E.ArtisanCityKit.palettes.river;k.climate=climate;k.vocab={material};
 if(houseRngMustStayIdle)k.random=()=>{throw Error('frontage consumed the house RNG');};
 k.part('frontage','Street and rear yard','architecture',()=>F.build(k,p));return k.finish();
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function ray(model,origin,dir,limit=Infinity){
 for(const part of model.parts){const d=part.geometry.data;for(let i=0;i<d.length;i+=27){
  const a=d.slice(i,i+3),ab=sub(d.slice(i+9,i+12),a),ac=sub(d.slice(i+18,i+21),a),p=cross(dir,ac),det=dot(ab,p);if(Math.abs(det)<1e-9)continue;
  const tv=sub(origin,a),u=dot(tv,p)/det;if(u<0||u>1)continue;const q=cross(tv,ab),v=dot(dir,q)/det,t=dot(ac,q)/det;
  if(v>=0&&u+v<=1&&t>1e-5&&t<limit)return true;
 }}return false;
}
function within(model,p){for(const part of model.parts)for(let i=0;i<part.geometry.data.length;i+=9){const d=part.geometry.data;assert.ok(Math.abs(d[i])<=p.CW/2+1e-7,'parcel x');assert.ok(Math.abs(d[i+2])<=p.CD/2+1e-7,'parcel z');for(let j=0;j<9;j++)assert.ok(Number.isFinite(d[i+j]));}}

test('the real surveyed street controls all four facades independently of the block rotation',()=>{
 for(const angle of[0,Math.PI/2,Math.PI,-Math.PI/2])for(const side of[[0,1],[1,0],[0,-1],[-1,0]]){
  const {b,c,p}=fixture({angle,side,w:3,d:7,offset:.37});
  const n=rotate(p.front.n[0],p.front.n[1],angle);assert.ok(n.x*side[0]+n.z*side[1]>.999999);
  assert.equal(p.front.source,'connector');assert.equal(p.houses.length,1);
  const before=JSON.stringify({b,c});F.plan(b,c,p.CW,p.CD);assert.equal(JSON.stringify({b,c}),before,'the city survey must remain read-only');
  const e=p.front.entry;assert.ok(Math.abs(e.x)<=p.CW/2+1e-8&&Math.abs(e.z)<=p.CD/2+1e-8);
  const world=rotate(e.x/(p.CW/(Math.abs(Math.sin(angle))>.5?b.d:b.w)),e.z/(p.CD/(Math.abs(Math.sin(angle))>.5?b.w:b.d)),angle);
  assert.ok(Math.abs(side[0]?world.z-.37:world.x-.37)<1e-8,'retain the off-centre gate position');
 }
});

test('old city data has a socket fallback and a harmless already-rotated front fallback',()=>{
 const {b,c,p}=fixture({angle:Math.PI/2,side:[1,0]});delete c.connectors;
 const socket=F.plan(b,c,p.CW,p.CD);assert.equal(socket.front.source,'socket');assert.equal(socket.front.side,p.front.side);
 delete c.xy;const old=F.plan(b,c,p.CW,p.CD);assert.equal(old.front.side,'south');assert.equal(old.front.source,'fallback');
 assert.equal(F.plan({...b,landmark:true},c,p.CW,p.CD).enabled,false);
 assert.equal(F.plan({...b,highRole:'lodge'},c,p.CW,p.CD).enabled,false);
 assert.equal(F.plan(b,{...c,highCitadel:{kind:'holy'}},p.CW,p.CD).enabled,false);
});

test('fittings are bounded and deterministic across parcel shapes, materials and LODs without advancing house randomness',()=>{
 for(const [w,d]of[[1.1,1.1],[2,9],[7,2]])for(const angle of[0,Math.PI/2,Math.PI,-Math.PI/2])for(const lod of[0,1,2])for(const material of['masonry','log','adobe','thatch']){
  const {p}=fixture({w,d,angle,lod}),options={material,climate:{humid:.8,load:.6,cover:.5},houseRngMustStayIdle:true},a=mesh(p,options),b=mesh(p,options);
  within(a,p);assert.deepEqual(a.parts.map(q=>q.geometry.data),b.parts.map(q=>q.geometry.data));
  assert.ok(a.stats.triangles<440,material+'/'+lod+' exceeds the small frontage budget: '+a.stats.triangles);
 }
});

test('off-centre and corner street sockets retain a walking-height passage through the parcel edge',()=>{
 for(const angle of[0,Math.PI/2,Math.PI,-Math.PI/2])for(const offset of[0,1.75,2])for(const side of[[0,1],[1,0],[0,-1],[-1,0]]){
  const {p}=fixture({angle,side,offset}),m=mesh(p),n=p.front.n,t=[Math.cos(p.front.angle),Math.sin(p.front.angle)],e=p.front.entry;
  for(const u of[-p.front.gap*.35,0,p.front.gap*.35])for(const y of[.68,1.05,1.60]){
   const origin=[e.x+n[0]*.1+t[0]*u,y,e.z+n[1]*.1+t[1]*u];
   assert.equal(ray(m,origin,[-n[0],0,-n[1]],Math.min(1.1,p.front.depth*.2)+.1),false,'socket blocked at '+JSON.stringify({angle,offset,side,u,y}));
  }
 }
});

test('finished compound entrance metadata places steps at the actual shifted main range and keeps its doorway open',()=>{
 const {p}=fixture(),h=p.houses[0];h.entrance={x:.75,z:3.1,width:.7,baseY:.59,angle:0};h.volumes=[{x:.75,z:-.1,w:4.2,d:6.4,h:4.6,angle:0,baseY:.18}];
 const m=mesh(p);assert.ok(m.stats.modules['street-doorstep']);assert.ok(m.stats.modules['open-shop-counter']);
 for(const x of[.5,.75,1])assert.equal(ray(m,[x,.95,4.9],[0,0,-1],1.79),false,'counter intrudes into the shifted real doorway');
 const topSteps=m.parts.flatMap(q=>{const result=[];for(let i=0;i<q.geometry.data.length;i+=9){const d=q.geometry.data;if(Math.abs(d[i+1]-.59)<1e-7&&d[i+2]>3.1&&d[i+2]<3.63)result.push(d[i]);}return result;});
 assert.ok(topSteps.length>0);assert.ok(topSteps.every(x=>Math.abs(x-.75)<.6),'doorstep was centred on the old compound origin');
});

test('shop canopies are removable closed roofs and respond to snow load, while the counters remain open',()=>{
 const {p}=fixture(),m=mesh(p,{climate:{humid:.8,load:.7}}),roof=m.parts.filter(q=>q.role==='roof'),body=m.parts.filter(q=>q.role!=='roof');
 assert.ok(roof.length);assert.ok(roof.some(q=>q.modules.includes('snow-pitched-shop-canopy')));
 assert.ok(!body.some(q=>q.modules.some(s=>s.includes('canopy')&&s!=='shop-canopy-post')));
 const h=p.houses[0],z=h.d/2+.2;
 assert.equal(ray({parts:roof},[0,4,z],[0,-1,0],3),true,'the canopy needs a real roof surface');
 assert.equal(ray({parts:body},[0,4,z],[0,-1,0],2.3),false,'roof toggle must remove the entire canopy');
 assert.equal(ray(m,[0,1.1,4.8],[0,0,-1],4.8-h.d/2),false,'shop doorway should remain between its counter bays');
});

test('dense 1.1-unit infill adds no distant geometry and only a single shallow trade bay up close',()=>{
 for(const lod of[0,1,2])for(const angle of[0,Math.PI/2,Math.PI,-Math.PI/2]){
  const {p}=fixture({dense:true,w:1.1,d:1.1,lod,angle}),m=mesh(p);within(m,p);
  assert.equal(p.houses.length,1);assert.ok(m.stats.triangles<=60,'dense frontage must stay cheaper than one small box house');
  assert.ok(!Object.keys(m.stats.modules).some(k=>k.includes('boundary')||k.includes('canopy')));
  assert.ok((m.stats.modules['open-shop-counter']||0)<=1);if(lod===0)assert.equal(m.stats.triangles,0);
 }
});

test('rear yard walls yield to completed annex volumes and never fence the street face',()=>{
 const {p}=fixture({shop:false}),h=p.houses[0];h.volumes=[{x:0,z:-4.5,w:p.CW,d:1,h:2,angle:0,baseY:.18}];
 const m=mesh(p);assert.equal(ray(m,[0,.8,-5],[0,0,1],1),false,'an annex must displace the rear fence');
 const clean=mesh(fixture({shop:false}).p);assert.ok(clean.stats.modules['backyard-masonry-boundary']);
 for(const x of[-4,-2,0,2,4])assert.equal(ray(clean,[x,.8,5],[0,0,-1],.4),false,'street frontage must stay unenclosed');
});


test('thousands of household plans reuse one connector index and observe changed coordinates',()=>{
 const {b,c,p}=fixture();let reads=0;
 c.connectors=Array.from({length:1000},(_,i)=>({get blockId(){reads++;return 'b'+i;},a:{x:b.x,z:b.z+b.d/2+.08},b:{x:b.x,z:b.z+8}}));
 for(let i=0;i<1000;i++)F.plan({...b,id:'b'+i},c,p.CW,p.CD,{cols:1,ranks:1});
 assert.equal(reads,1000,'connector lookup must not scan the city for each household');
 c.connectors[10].b.x=b.x+20;c.connectors[10].b.z=b.z;
 assert.equal(F.plan({...b,id:'b10'},c,p.CW,p.CD).front.side,'east','coordinate updates must be read live');
 c.connectors=[{blockId:'b10',a:{x:b.x-2,z:b.z},b:{x:b.x-8,z:b.z}}];
 assert.equal(F.plan({...b,id:'b10'},c,p.CW,p.CD).front.side,'west','a rebuilt city must receive a new index');
});

test('the production compound passes its shifted house entrance through to the frontage builder',()=>{
 for(const angle of[0,Math.PI/2,Math.PI,-Math.PI/2]){
  const {b,c}=fixture({w:3.2,d:3.2,angle,side:[1,0]});Object.assign(b,{y:1.2,moduleVariant:2});
  Object.assign(c,{townProfile:E.TownCatalog.styles.find(s=>s.id==='river'),siteEnvironment:{temperature:14,aridity:1,bed:400,forestFraction:.4,ore:.2},
   environment:{temperature:[14],aridity:[1],bed:[400],ice:[0],snow:[0],winter:[6]},index:()=>0});
  const original=F.build,steps=[];let captured;
  F.build=(k,p)=>{
   captured=structuredClone(p);const oldBox=k.box,oldMark=k.mark;let last;
   k.box=function(...args){last=args;return oldBox.apply(this,args);};
   k.mark=function(name){if(name==='street-doorstep')steps.push(last);return oldMark.call(this,name);};
   try{return original(k,p);}finally{k.box=oldBox;k.mark=oldMark;}
  };
  let result;try{result=E.ArtisanCityKit.compound(b,c,{faith:[1,0,0,0,0,0],people:[1],fresh:.4,ore:.2},{color:'#998866'});}finally{F.build=original;}
  assert.equal(result.structures,1);assert.equal(captured.houses[0].form,'staggered-ranges');
  const h=captured.houses[0],e=h.entrance,n=[-Math.sin(e.angle),Math.cos(e.angle)],t=[Math.cos(e.angle),Math.sin(e.angle)];
  assert.ok(Math.abs((e.x-h.x)*t[0]+(e.z-h.z)*t[1])>.3,'fixture must actually shift its main doorway');
  assert.ok(steps.length>0,'the finished compound must draw its entrance approach');
  for(const [x,y,z,w,height]of steps){
   assert.ok(Math.abs((x-e.x)*t[0]+(z-e.z)*t[1])<1e-7,'step does not follow the finished doorway');
   assert.ok((x-e.x)*n[0]+(z-e.z)*n[1]>0,'step belongs outside the front wall');
   assert.ok(y+height<=e.baseY+1e-7,'steps must meet the actual door sill');
  }
  assert.ok(result.model.stats.modules['open-shop-counter'],'the real workshop must retain a street counter');
 }
});
