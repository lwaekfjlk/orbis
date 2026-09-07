import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine, root, defaults} from './engine-loader.mjs';
const E=loadEngine();
let w,s,net,town,city,roster,travellers;const report={version:1,checks:{}};
test.before(async()=>{
 w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 net=E.RoadNetwork.ensure(w,s);
 town=s.provinces.filter(p=>p.settled).sort((a,b)=>b.urbanPop-a.urbanPop)[0];
 city=E.generateCity(w,s,town.id);
 roster=E.Folk.roster(city,town,{max:96});
 travellers=E.Folk.travellers(net,s,{});
});
const TIMES=[0,.75,3.7,11.25,60.5,907.125];

test('every figure is one draw from the province mixture the simulation already holds',()=>{
 assert.equal(E.Folk.LOOKS.length,E.PEOPLES.length,'one appearance per modelled people, no invented races');
 for(const a of roster)assert(Number.isInteger(a.people)&&E.PEOPLES[a.people],'people index is valid');
 // A large draw has to reproduce the province's own mixture rather than a flat spread or
 // a single dominant people, because that mixture is what the figure is reporting.
 const counts=Array(E.PEOPLES.length).fill(0),trials=24000;
 for(let k=0;k<trials;k++)counts[E.Folk.pick(town.people,(k+.5)/trials)]++;
 for(let k=0;k<counts.length;k++)
  assert(Math.abs(counts[k]/trials-town.people[k])<.02,`people ${E.PEOPLES[k].name}: drew ${(counts[k]/trials).toFixed(3)}, province holds ${town.people[k].toFixed(3)}`);
 // A minority is present, not rounded away.
 const minority=town.people.indexOf(Math.min(...town.people));
 assert(counts[minority]>0,'the smallest minority can still appear on the street');
 report.checks.mixture={town:town.name,roster:roster.length,peoplesSeen:new Set(roster.map(a=>a.people)).size,maxDeviation:+Math.max(...counts.map((c,k)=>Math.abs(c/trials-town.people[k]))).toFixed(4)};
});

test('appearance differs between peoples and nothing else does',()=>{
 // The civilization model states that no species has hard-coded advantages. Reading
 // agent.people to set speed would quietly break that, so pin it: same agent, every
 // people, one speed.
 const speeds=new Set(E.PEOPLES.map((_,k)=>E.Folk.speedOf({...roster[0],people:k,look:E.Folk.look(k)})));
 assert.equal(speeds.size,1,'walking speed must not depend on ancestry');
 const speedSource=readFileSync(resolve(root,'src/civilization/folk.js'),'utf8').match(/function speedOf\(agent\)\s*\{[^}]*\}/)[0];
 assert(!/people/.test(speedSource),'speedOf must not read agent.people at all: '+speedSource);
 const gaits=new Set(roster.map(a=>+E.Folk.speedOf(a).toFixed(4)));
 assert(gaits.size>3,'individual gait still varies between people');
 // What DOES differ is the silhouette: one distinct treatment per people.
 assert.equal(new Set(E.Folk.LOOKS.map(l=>l.accent)).size,E.PEOPLES.length);
 assert(new Set(E.Folk.LOOKS.map(l=>l.height)).size>4);
 report.checks.parity={distinctSpeedsAcrossPeoples:1,distinctGaits:gaits.size,accents:E.PEOPLES.length};
});

test('townsfolk keep to their own town, on its streets and out of the water',()=>{
 assert(roster.length>=6&&roster.length<=96);
 const frame=E.AtlasSpace.cityFrame(w,town,city,1);
 let onPaving=0,samples=0;
 for(const a of roster)for(const t of TIMES){
  const q=E.Folk.positionAt(a,t);
  assert([q.x,q.z,q.y,q.heading].every(Number.isFinite),'a figure has a finite position');
  const k=city.index(q.x,q.z);
  assert.notEqual(city.waterKind[k],1,'nobody stands on the sea');
  assert.notEqual(city.waterKind[k],2,'nobody stands on the lake');
  assert(Math.abs(q.x)<=city.width/2&&Math.abs(q.z)<=city.depth/2,'a figure stays inside the town plan');
  const at=frame.at(q.x,q.z);
  assert(Math.hypot(at[0]-town.x,at[1]-town.y)<city.span,'a figure stays inside its own settlement');
  samples++;
  // Walkers follow the street network; idlers hold the market square.
  if(a.kind==='walker'&&city.road[k])onPaving++;
 }
 const walkers=roster.filter(a=>a.kind==='walker').length;
 assert(onPaving>walkers*TIMES.length*.5,'street walkers spend their time on the streets');
 report.checks.townsfolk={roster:roster.length,samples,walkers,idlers:roster.length-walkers};
});

test('a position is a pure function of the clock, so nothing drifts',()=>{
 assert.deepEqual(E.Folk.roster(city,town,{max:96}),roster,'the same town yields the same residents');
 for(const a of [roster[0],roster[roster.length-1]])
  for(const t of TIMES)assert.deepEqual(E.Folk.positionAt(a,t),E.Folk.positionAt(a,t));
 // Out and back: a walker returns to where it started rather than teleporting home.
 const walker=roster.find(a=>a.kind==='walker'&&a.route.len>1);
 const cycle=2*walker.route.len/walker.speed,start=E.Folk.positionAt(walker,0),loop=E.Folk.positionAt(walker,cycle);
 assert(Math.hypot(start.x-loop.x,start.z-loop.z)<1e-6,'the round trip closes');
 const half=E.Folk.positionAt(walker,cycle/2);
 assert(Math.hypot(start.x-half.x,start.z-half.z)>walker.route.len*.5,'the walker actually goes somewhere');
 report.checks.purity={deterministic:true,cycleCloses:true};
});

test('travellers stay on their road, and hulls stay on the water',()=>{
 assert(travellers.length>20);
 const onRoad=travellers.filter(a=>a.scope==='road'),afloat=travellers.filter(a=>a.scope==='sea');
 assert(onRoad.length&&afloat.length,'the world has both land traffic and shipping');
 for(const a of onRoad)for(const t of TIMES){
  const q=E.Folk.travellerAt(a,t),i=E.GW*Math.round(q.y)+Math.round(q.x);
  assert(w.height[i]>0&&w.lake[i]<0,'a traveller never walks onto water');
  assert(a.road.path.includes(q.cell),'a traveller stays on the cells of its own road');
 }
 for(const a of afloat)for(const t of TIMES){
  // The agent's own cell, the way the road branch above asks it. Rounding x and y
  // separately snaps a hull sitting at 41.33, 81.33 onto the 34 m headland at 41, 81
  // while its actual cell is 599 m under water — which is what this started
  // reporting the moment a coastline moved.
  const q=E.Folk.travellerAt(a,t);
  assert(w.height[q.cell]<=0,'a hull stays at sea');
 }
 // A convoy on a trunk road, a lone walker on a footpath.
 const highway=onRoad.find(a=>a.road.cls==='highway'),trail=onRoad.find(a=>a.road.cls==='trail');
 if(highway&&trail)assert(highway.escort>=trail.escort);
 report.checks.travellers={total:travellers.length,road:onRoad.length,sea:afloat.length,kinds:travellers.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{})};
});

test('nobody skates across the map: motion is slow against the scenery it passes',()=>{
 // A "building" in a town plan is a whole compound and a parent grid cell is a large
 // piece of a continent. Anything near a real walking pace reads as figures skating
 // across the map — the first cut had a resident crossing a courtyard in 0.9s and a
 // carter crossing a province in 2s. These bounds are what the eye actually judges.
 const frame=E.AtlasSpace.cityFrame(w,town,city,1),block=city.buildings.find(b=>!b.landmark);
 const walker=roster.find(a=>a.kind==='walker'&&a.route.len>8);
 assert(walker,'this town has a street walker');
 const crossing=block.w/walker.speed;
 assert(crossing>=4,`a resident crosses a whole compound in ${crossing.toFixed(1)}s`);
 const trip=2*walker.route.len/walker.speed;
 assert(trip>=40,`a resident completes a round trip in ${trip.toFixed(0)}s; the street should not read as pacing`);
 assert(walker.speed/1.5<=.35,'a figure covers at most a third of its own height each second');
 const idler=roster.find(a=>a.kind==='idler');
 if(idler){
  const circuit=6.2831853*Math.max(.5,idler.radius)/idler.speed;
  assert(circuit>=30,`a market loiterer laps the square every ${circuit.toFixed(0)}s`);
 }
 const carter=travellers.find(a=>a.scope==='road');
 assert(1/carter.speed>=8,`a traveller crosses a whole parent cell in ${(1/carter.speed).toFixed(1)}s`);
 const hull=travellers.find(a=>a.scope==='sea');
 assert(1/hull.speed>=6,'shipping crosses a parent cell no faster than a cart');
 report.checks.pace={compoundCrossingSeconds:+crossing.toFixed(1),roundTripSeconds:+trip.toFixed(0),
  cellCrossingSeconds:+(1/carter.speed).toFixed(1),bodyLengthsPerSecond:+(walker.speed/1.5).toFixed(3)};
});

test('a ship is a ship, not a district',()=>{
 // The sea-lane hull is measured against the hulls moored at the town's own quay, which
 // are 2-4 town-plan units long. It was ten times one of those, and at regional zoom a
 // single ship was fourteen buildings long against a town footprint of seventy.
 const S=E.AtlasRenderer.FOLK_SCALE;
 assert(S,'the folk renderer publishes its scale constants');
 const harbour=[town,...s.provinces.filter(p=>p.settled&&p.harbor>.4).sort((a,b)=>b.urbanPop-a.urbanPop)]
  .map(p=>({p,c:p.id===town.id?city:E.generateCity(w,s,p.id)})).find(x=>x.c.port?.moorings.length);
 assert(harbour,'this world has a town with moored hulls to compare against');
 const frame=E.AtlasSpace.cityFrame(w,harbour.p,harbour.c,1);
 // A typical house, not whichever one happens to be first in the array: across eight
 // harbour towns that first house ranges 0.026 to 0.148 atlas units, so the ratio
 // below swung between 0.7 and 3.9 on nothing but which town got picked. Against the
 // median it sits at 1.7-2.4 everywhere.
 const blocks=harbour.c.buildings.filter(b=>!b.landmark).map(b=>b.w*frame.sx).sort((a,b)=>a-b);
 const block=blocks[blocks.length>>1];
 const moored=Math.max(...harbour.c.port.moorings.map(m=>m.length))*frame.sx;
 const shipLength=S.near*S.ship*S.hullLength;
 const ratio=shipLength/moored;
 assert(ratio>=1.5&&ratio<=5,`a sea-going hull is ${ratio.toFixed(1)}x the boats at the town's own quay`);
 // At regional zoom a marker must not outweigh the place it is travelling between.
 const townFootprint=harbour.c.width*frame.sx;
 assert(S.symbol*1.15*S.hullLength<townFootprint/8,'a ship symbol dwarfs the town');
 assert(S.symbol<=block*2.5,`a figure marker is ${(S.symbol/block).toFixed(1)} buildings tall`);
 report.checks.scale={buildingFootprint:+block.toFixed(4),mooredHull:+moored.toFixed(4),
  seaHull:+shipLength.toFixed(4),hullRatio:+ratio.toFixed(1),symbolInBuildings:+(S.symbol/block).toFixed(1)};
});

test('a figure is a small bounded mesh, and every accent is real geometry',()=>{
 // Build away from the origin on all three axes. A helper that mixes offsets with
 // absolute heights looks correct at 0,0,0 and puts the horns in the sky everywhere else.
 const O=[-41.5,3.75,17.25];
 const sizes=E.Folk.LOOKS.map(l=>{
  const g=new E.Geometry();
  g.figure(O[0],O[1],O[2],1,.3,.6,[.55,.42,.3],[.9,.8,.7],l.accent,1.1);
  assert(g.data.every(Number.isFinite),l.accent+' produced a nonfinite vertex');
  for(let i=0;i<g.data.length;i+=9){
   assert(Math.abs(g.data[i]-O[0])<1.2&&Math.abs(g.data[i+2]-O[2])<1.2,l.accent+' leaves the figure footprint');
   const h=g.data[i+1]-O[1];
   assert(h>=-.3&&h<=1.35,`${l.accent} sits ${h.toFixed(2)} above the feet; a figure is one unit tall`);
  }
  return g.data.length/27;
 });
 // The same figure at the origin and away from it must be the same shape.
 for(const l of E.Folk.LOOKS){
  const a=new E.Geometry(),b=new E.Geometry();
  a.figure(0,0,0,1,.3,.6,[.55,.42,.3],[.9,.8,.7],l.accent,1.1);
  b.figure(O[0],O[1],O[2],1,.3,.6,[.55,.42,.3],[.9,.8,.7],l.accent,1.1);
  for(let i=0;i<a.data.length;i+=9)for(let k=0;k<3;k++)
   assert(Math.abs((b.data[i+k]-O[k])-a.data[i+k])<1e-9,l.accent+' is not translation invariant');
 }
 for(const n of sizes)assert(n>=18&&n<=40,'a figure costs '+n+' triangles; the crowd budget assumes about thirty');
 // The accent is the visible difference between peoples, so it must add geometry.
 const plain=new E.Geometry();plain.figure(0,0,0,1,.3,0,[.5,.5,.5],[.9,.8,.7],'none',0);
 for(let k=1;k<E.Folk.LOOKS.length;k++)assert(sizes[k]>=plain.data.length/27,'accent '+E.Folk.LOOKS[k].accent+' adds nothing');
 report.checks.figure={trianglesPerAccent:Object.fromEntries(E.Folk.LOOKS.map((l,k)=>[l.accent,sizes[k]]))};
});

test('a walking crowd never forces a shadow pass',()=>{
 const r=Object.create(E.AtlasRenderer.prototype);
 Object.assign(r,{world:w,sim:s,layer:'relief',options:{},zoom:30,relief:1,meshes:{},target:[0,0,0],
  azimuth:.018,elevation:1.19,width:1400,height:900,dirtyShadow:false,software:false,
  upload(name,g,shadow=true,unlit=0,alpha=1){this.meshes[name]={count:g.data.length/9,shadow,unlit,alpha};this.dirtyShadow=true;},
  request(){}});
 r.ground=function(x,y){return E.AtlasSpace.surface(this.world,x,y,this.relief);};
 r.coord=function(x,y,h=null){const p=E.AtlasSpace.point(this.world,x,y,this.relief);return h==null?p:[p[0],h,p[2]];};
 r.buildRoads();
 const origin=E.AtlasSpace.point(w,town.x,town.y,1);
 r.target=[origin[0],0,origin[2]];
 r.continuousModels=new Map([[town.id,{p:town,city,frame:E.AtlasSpace.cityFrame(w,town,city,1),key:'k',heights:{}}]]);
 r.dirtyShadow=false;
 r.buildFolk(3.5);
 assert.equal(r.dirtyShadow,false,'rebuilding the crowd must leave the shadow map alone');
 assert.equal(r.meshes.folk.shadow,false,'figures are excluded from the shadow pass');
 assert.equal(r.meshes.caravans.shadow,false);
 assert(r.folkStats.residents>0,'a loaded town is populated');
 assert(r.folkStats.triangles>0&&r.folkStats.triangles<r.folkStats.budget*44,'the crowd stays inside its triangle budget');
 // Every frame is a fresh mesh, and the clock is the only thing that changed.
 const first=r.meshes.folk.count;
 r.buildFolk(3.5);
 assert.equal(r.meshes.folk.count,first,'the same clock gives the same crowd');
 r.buildFolk(9.5);
 assert.equal(r.dirtyShadow,false);
 // The toggle empties the meshes rather than leaving a frozen crowd behind.
 r.options.folk=false;r.buildFolk(9.5);
 assert.equal(r.meshes.folk.count,0);
 assert.equal(r.meshes.caravans.count,0);
 report.checks.rendering={residents:r.folkStats.residents,travelling:r.folkStats.travelling,triangles:r.folkStats.triangles,shadowPreserved:true};
});

test('the ticker stands the crowd still where a frame is expensive',()=>{
 const src=readFileSync(resolve(root,'src/ui/continuous-map.js'),'utf8');
 const guard=src.match(/const animating=[^;]+;/)[0];
 assert(/renderer\.software/.test(guard),'the software rasterizer must not drive an animation loop');
 assert(/reducedMotion\(\)/.test(guard),'prefers-reduced-motion must stop the loop');
 assert(/visibilityState/.test(guard),'a hidden tab must not animate');
 assert(/options\.folk!==false/.test(guard),'the toggle must stop the loop');
 // Standing still is not the same as being absent: the crowd is still built, and it is
 // still re-culled when the camera settles — without a second redraw per pan step.
 assert(/function restFolk\(\)\{[^]*?setTimeout\([^]*?renderer\.buildFolk\(clock\)/.test(src),'a static crowd is rebuilt once the camera settles');
 assert(/if\(sig!==lastCamera\)\{[^}]*restFolk\(\)/.test(src),'a camera move schedules that rebuild');
 assert(/renderer\.buildFolk\?\.\(clock\)/.test(src),'a newly streamed town is populated immediately');
});

test.after(()=>writeFileSync(resolve(root,'docs/FOLK_RESULTS.json'),JSON.stringify(report,null,2)));
