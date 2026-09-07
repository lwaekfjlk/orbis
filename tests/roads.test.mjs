import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine, root, defaults} from './engine-loader.mjs';
const E=loadEngine();
let w,s,net,before;const report={version:1,checks:{}};
test.before(async()=>{
 w=await E.generateWorld(defaults);s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 before={physical:E.physicalFingerprint(w),settlement:E.settlementFingerprint(s),politics:E.politicalFingerprint(s),sim:JSON.stringify(s)};
 net=E.RoadNetwork.ensure(w,s);
 report.stats=net.stats;
});
const land=i=>w.height[i]>0&&w.lake[i]<0;
const river=i=>w.lake[i]<0&&w.flow[i]>(w.channelThreshold?.[i]||w.riverThreshold);

test('roads run over land only, from one settlement cell to the other, without gaps',()=>{
 assert(net.roads.length>40,'a populated world has a road network');
 for(const r of net.roads){
  assert.notEqual(r.from,r.to,'no settlement is joined to itself');
  for(const i of r.path)assert(land(i),`${s.provinces[r.from].name}–${s.provinces[r.to].name} leaves dry land at cell ${i}`);
  assert.equal(r.path[0],s.provinces[r.from].i);
  assert.equal(r.path.at(-1),s.provinces[r.to].i);
  // A parent walk that skips a cell would draw a road jumping across terrain it never
  // costed, which is exactly how an "impassable" mountain or estuary gets crossed.
  for(let k=1;k<r.path.length;k++){
   const a=r.path[k-1],b=r.path[k];
   assert(Math.abs(a%E.GW-b%E.GW)<=1&&Math.abs((a/E.GW|0)-(b/E.GW|0))<=1,'consecutive road cells are adjacent');
  }
 }
 const pairs=net.roads.map(r=>r.from<r.to?r.from+':'+r.to:r.to+':'+r.from);
 assert.equal(new Set(pairs).size,pairs.length,'a town pair gets one road, not several');
 report.checks.paths={roads:net.roads.length,overWater:0,contiguous:true,uniquePairs:true};
});

test('a crossing is flagged only where the parent world actually has a river',()=>{
 let bridges=0;
 for(const r of net.roads)for(const i of r.bridges){assert(river(i),'bridge cell '+i+' carries no channel');bridges++;}
 assert(bridges>0,'a world with rivers has bridged crossings');
 // The converse: every river cell a road passes through is flagged, so no road quietly
 // fords a channel that the map then draws water straight through.
 for(const r of net.roads)for(const i of r.path)if(river(i))assert(r.bridges.includes(i));
 report.checks.bridges={count:bridges,allOnChannels:true,noUnflaggedFords:true};
});

test('settlements sharing a landmass share a road network',()=>{
 const index=new Map(net.nodes.map((p,k)=>[p.id,k])),adjacency=net.nodes.map(()=>[]);
 for(const r of net.roads){adjacency[index.get(r.from)].push(index.get(r.to));adjacency[index.get(r.to)].push(index.get(r.from));}
 const seen=new Array(net.nodes.length).fill(false),components=new Map();
 for(let k=0;k<net.nodes.length;k++){
  if(seen[k])continue;
  const queue=[k];seen[k]=true;
  while(queue.length){const v=queue.pop();for(const u of adjacency[v])if(!seen[u]){seen[u]=true;queue.push(u);}}
  components.set(net.nodes[k].landmass,(components.get(net.nodes[k].landmass)||0)+1);
 }
 for(const [landmass,count] of components)
  assert.equal(count,1,`landmass ${landmass} splits into ${count} road networks; a reachable town was left off the map`);
 report.checks.connectivity={landmasses:components.size,componentsPerLandmass:1};
});

test('trunk roads are the ones the network actually uses, not simply the biggest towns',()=>{
 const rank={trail:0,road:1,highway:2};
 for(const a of net.roads)for(const b of net.roads)
  if(rank[a.cls]>rank[b.cls])assert(a.traffic>=b.traffic,'road class must be monotone in modelled traffic');
 const highways=net.roads.filter(r=>r.cls==='highway');
 assert(highways.length>0&&highways.length<net.roads.length*.4,'trunk roads are a minority of the network');
 // A highway is not merely the road out of the largest town: the busiest segment has to
 // beat the road joining the two largest settlements unless it IS that road.
 assert(net.roads[0].traffic>=highways.at(-1).traffic);
 report.checks.classes=Object.fromEntries(E.RoadNetwork.classes.map(c=>[c,net.roads.filter(r=>r.cls===c).length]));
});

test('a quay stands on real shore beside real water, and inland towns get none',()=>{
 for(const port of net.ports){
  assert(land(port.shore),port.name+' quay is not on land');
  assert(w.height[port.water]<=0||w.lake[port.water]>0,port.name+' berths in dry ground');
  assert(Math.abs(port.x-port.wx)<=1&&Math.abs(port.y-port.wy)<=1,'the berth touches its own quay');
  assert.equal(port.kind,w.height[port.water]<=0?'sea':'lake');
  assert(port.weight>0&&port.weight<=1);
 }
 const withPort=new Set(net.ports.map(p=>p.province));
 for(const p of net.nodes){
  if(withPort.has(p.id))continue;
  // No adjacent water anywhere near the town is the ONLY reason to have no quay.
  const touching=p.cells.some(i=>{
   const x=i%E.GW,y=i/E.GW|0;
   if(Math.hypot(x-p.x,y-p.y)>3||!land(i))return false;
   return [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]].some(([dx,dy])=>{
    const j=(y+dy)*E.GW+(x+dx);
    return j>=0&&j<E.GN&&(w.lake[j]>0||(w.height[j]<=0&&w.seaIce[j]<=.80));
   });
  });
  assert(!touching,p.name+' has usable water on its doorstep but no quay');
 }
 report.checks.ports={count:net.ports.length,sea:net.ports.filter(p=>p.kind==='sea').length,lake:net.ports.filter(p=>p.kind==='lake').length,landlockedSkipped:net.nodes.length-net.ports.length};
});

test('the town waterfront is fitted to existing water, ground and blocks',()=>{
 const harbour=s.provinces.filter(p=>p.settled&&p.harbor>.4).sort((a,b)=>b.urbanPop-a.urbanPop)[0];
 assert(harbour,'this world has a sheltered harbour town');
 const snapshot=JSON.stringify(s),city=E.generateCity(w,s,harbour.id);
 assert(city.port,harbour.name+' has a working waterfront');
 const open=k=>city.water[k]&&city.waterKind[k]!==3;
 for(const q of city.port.quays)for(const e of [q.a,q.b])assert(!city.water[city.index(e.x,e.z)],'a quay stands on the bank');
 for(const j of city.port.jetties){
  assert(open(city.index(j.b.x,j.b.z)),'a jetty ends over open water');
  assert(!city.water[city.index(j.a.x,j.a.z)],'a jetty starts on the bank');
 }
 for(const m of city.port.moorings)assert(open(city.index(m.x,m.z)),'a hull is moored in water');
 for(const shed of city.port.sheds){
  const k=city.index(shed.x,shed.z);
  assert(!city.water[k]&&!city.road[k],'a shed stands on dry road-free ground');
  for(const b of city.buildings)
   assert(!(Math.abs(b.x-shed.x)<(b.w+shed.w)/2&&Math.abs(b.z-shed.z)<(b.d+shed.d)/2),'a shed does not overlap a compound');
 }
 assert.equal(E.auditCity(city).wetBuildings,0);
 assert.equal(JSON.stringify(s),snapshot,'building a waterfront does not touch the civilization state');
 // Port fittings are not city.buildings, so the block plan and its replay key are intact.
 assert.equal(city.fingerprint,E.generateCity(w,s,harbour.id).fingerprint);
 // A waterfront follows the town's OWN terrain sample, not a province-level statistic:
 // no harbour district means no harbour, and nothing is dug to create one.
 assert.equal(city.districts.some(d=>d.type==='harbor'),true);
 const dry=s.provinces.find(p=>p.settled&&noWaterNear(p,7));
 assert(dry,'this world has a settlement with no water anywhere near it');
 const inland=E.generateCity(w,s,dry.id);
 assert.equal(inland.districts.some(d=>d.type==='harbor'),false,dry.name+' has no shore to build on');
 assert.equal(inland.port,null,dry.name+' must not dig a harbour');
 report.checks.townPort={town:harbour.name,...city.stats.port,inlandTown:dry.name};
});
function noWaterNear(p,radius){
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
  const x=p.x+dx,y=p.y+dy;
  if(x<0||x>=E.GW||y<0||y>=E.GH)continue;
  const i=y*E.GW+x;
  if(w.height[i]<=0||w.lake[i]>0)return false;
 }
 return true;
}

test('the network is derived, cached and completely read-only',()=>{
 assert.equal(E.RoadNetwork.ensure(w,s),net,'a second call reuses the cached network');
 const digest=n=>JSON.stringify({roads:n.roads.map(r=>[r.from,r.to,r.cls,r.path.length]),ports:n.ports.map(p=>[p.province,p.shore,p.water])});
 const rebuilt=E.RoadNetwork.ensure(w,{...s,gridSignature:s.gridSignature});
 assert.equal(digest(rebuilt),digest(net),'the same world and settlements give the same roads');
 assert.equal(E.physicalFingerprint(w),before.physical);
 assert.equal(E.settlementFingerprint(s),before.settlement);
 assert.equal(E.politicalFingerprint(s),before.politics);
 assert.equal(JSON.stringify(s),before.sim,'roads add nothing to the civilization state or the save');
 assert.equal(s.roads,undefined,'the network is not a simulation field');
 report.checks.readOnly={cached:true,deterministic:true,physicalHash:before.physical,settlementHash:before.settlement};
});

test('every ribbon and quay is seated on the surface it was sampled against',()=>{
 const meshes={},r=Object.create(E.AtlasRenderer.prototype);
 Object.assign(r,{world:w,sim:s,layer:'relief',options:{},zoom:1,relief:1,meshes,target:[0,0,0],
  azimuth:.018,elevation:1.19,width:1400,height:900,dirtyShadow:false,software:false,
  upload(name,g){meshes[name]={data:Array.from(g.data)};},request(){}});
 r.ground=function(x,y){return E.AtlasSpace.surface(this.world,x,y,this.relief);};
 r.coord=function(x,y,h=null){const p=E.AtlasSpace.point(this.world,x,y,this.relief);return h==null?p:[p[0],h,p[2]];};
 r.buildRoads();
 // Sinking below the hillside is the one failure a static screenshot would miss and a
 // reader would see instantly: the road disappears into the slope halfway up a pass.
 // Every ribbon vertex sits exactly its own lift above the ground beneath it. A trunk
 // road lays a darker shoulder a hair under its surface, so each mesh has two levels.
 const seated=(name,low,high,slack)=>{
  const data=meshes[name].data;
  let under=Infinity,over=-Infinity;
  for(let i=0;i<data.length;i+=9){
   const g=E.AtlasSpace.grid(data[i],data[i+2]),ground=E.AtlasSpace.surface(w,g[0],g[1],1),d=data[i+1]-ground;
   under=Math.min(under,d);over=Math.max(over,d);
  }
  assert(under>=low-slack,`${name} sinks ${(low-under).toFixed(4)} into the ground it follows`);
  assert(over<=high+slack,`${name} floats ${(over-high).toFixed(4)} above the ground it follows`);
  return {under:+under.toFixed(5),over:+over.toFixed(5),triangles:data.length/27};
 };
 const far=seated('roads',.079,.085,.0005);
 assert(far.triangles>1000);
 // A bridge is deliberately flat and elevated over its own crossing, and its piers are
 // deliberately founded IN the bank. Both halves have to be true at once: a deck that
 // dips into the ground is a ford, and a pier that stops above it is floating masonry.
 const decks=meshes.bridges.data;
 let deckLow=Infinity,deckHigh=-Infinity,footLow=Infinity,footHigh=-Infinity,deckCount=0;
 for(let i=0;i<decks.length;i+=9){
  const g=E.AtlasSpace.grid(decks[i],decks[i+2]),d=decks[i+1]-E.AtlasSpace.surface(w,g[0],g[1],1);
  if(d>=.12){deckLow=Math.min(deckLow,d);deckHigh=Math.max(deckHigh,d);deckCount++;}
  else{footLow=Math.min(footLow,d);footHigh=Math.max(footHigh,d);}
 }
 assert(deckCount>0);
 assert(deckLow>0,`a bridge deck sinks ${(-deckLow).toFixed(4)} into the bank`);
 // The deck is flat, so it rides high over the middle of a gorge — that is the point of
 // a bridge. What must hold is that at its own highest support it is only a deck's
 // clearance up, rather than the whole network hovering.
 assert(deckLow<=.31,`every bridge deck floats; the lowest clearance is ${deckLow.toFixed(4)}`);
 assert(deckHigh<=3,`a bridge deck floats ${deckHigh.toFixed(4)} over its crossing`);
 assert(footHigh<=.001,`a pier base hangs ${footHigh.toFixed(4)} above the bank`);
 assert(footLow>=-.45,`a pier is buried ${(-footLow).toFixed(4)} deep`);
 // Inside a town the same road has to lie ON the street, not a storey above it.
 r.continuousModels=new Map(net.nodes.slice(0,2).map(p=>[p.id,{p}]));
 r.buildNearRoads(true);
 const near=seated('roadsNear',.004,.006,.0005);
 assert(near.triangles>0,'a loaded town gets a ground-seated road band');
 assert(near.over<far.under,'the near band is seated below the cartographic ribbon');
 // A quay deck belongs above its own water, not under it.
 for(const port of net.ports){
  const water=E.AtlasSpace.surface(w,port.wx,port.wy,1),bank=E.AtlasSpace.surface(w,port.x,port.y,1);
  assert(bank>=water-1e-9,port.name+' quay stands below its own waterline');
 }
 report.checks.seating={roads:far,near,bridgeDeck:[+deckLow.toFixed(4),+deckHigh.toFixed(4)],bridgeFooting:[+footLow.toFixed(4),+footHigh.toFixed(4)]};
});

test('A road has a ruling gradient',()=>{
 // The grade term was linear and gentle — metres of rise over 620 — so a road would
 // climb anything at all if the detour was long enough. Measured on the drawn grade,
 // which is what the relief curve turns an elevation difference into: p99 106%, worst
 // segment 211%, a cart track up a face steeper than 60 degrees.
 const XSTEP=168/(E.GW-1),ZSTEP=98/(E.GH-1),up=h=>h>0?.14+Math.pow(h/1000,.98):0;
 const grades=[];
 for(const r of net.roads)
  for(let k=1;k<r.path.length;k++){
   const a=r.path[k-1],b=r.path[k];
   const dx=Math.abs(a%E.GW-b%E.GW)*XSTEP,dz=Math.abs((a/E.GW|0)-(b/E.GW|0))*ZSTEP;
   const run=Math.hypot(dx,dz);
   if(run>1e-9)grades.push(Math.abs(up(w.height[a])-up(w.height[b]))/run);
  }
 assert(grades.length>1500,'expected a network to measure');
 grades.sort((a,b)=>a-b);
 const q=f=>grades[Math.min(grades.length-1,Math.floor(grades.length*f))];
 assert(q(.99)<.55,`the 99th percentile road climbs at ${(q(.99)*100).toFixed(0)}%`);
 assert(grades.filter(g=>g>.55).length/grades.length<.01,'too much of the network is on a cliff');
 // Not zero above 100%, and the reason is worth recording. The penalty was pushed as
 // hard as it can go before the connectivity check above starts failing: past this
 // point the catchments reshape, two towns stop sharing a boundary, and a landmass
 // splits into two road networks. What survives is the last mile into a cliff-bound
 // town that would otherwise have no road at all — which is a real thing, and better
 // modelled as an expensive track than as a town with no way in.
 const brutal=grades.filter(g=>g>1).length;
 assert(brutal<=2,`${brutal} road segments still climb past 100%`);
 assert(grades[grades.length-1]<1.2,`the worst road climbs at ${(grades[grades.length-1]*100).toFixed(0)}%`);
 report.checks.gradient={pastVertical:brutal,median:+q(.5).toFixed(3),p90:+q(.9).toFixed(3),p99:+q(.99).toFixed(3),
  worst:+grades[grades.length-1].toFixed(3),segments:grades.length};
});
test('A harbour symbol and a ship stay symbols, and give way to the real thing',()=>{
 // Everything on the atlas shares one unit, so the only honest yardstick is a town.
 // The port symbol used to run 41% of a whole town's width with a moored sail 64%
 // the height of the largest building anyone had raised, and it was drawn at every
 // zoom — so at town range you got a second, larger harbour on top of the real one.
 const p=s.provinces.filter(q=>q.settled&&q.urbanPop>=650).sort((a,b)=>b.urbanPop-a.urbanPop)[0];
 const c=E.generateCity(w,s,p.id);
 // Everything is measured against the town's own footprint. The first version of this
 // used the tallest building, which is a lottery: across ten towns that is 0.37 atlas
 // units in nine of them and 1.25 in the one that happens to own a cathedral. When a
 // landform prior moved which town is largest, the yardstick fell by 3.4x and the port
 // "grew" without a constant changing. Footprint runs 3.7-5.9 across the same ten.
 const town=c.span*168/(E.GW-1);
 const meshes={};
 const r=Object.create(E.AtlasRenderer.prototype);
 Object.assign(r,{world:w,sim:s,relief:1,zoom:6,width:1440,height:900,azimuth:.018,elevation:1.19,
  target:[0,0,0],meshes,options:{},layer:'relief',software:false,upload(n,g){meshes[n]=g;},request(){}});
 r.buildRoads();
 const extent=(data,cx,cz,reach)=>{const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];let n=0;
  for(let k=0;k<data.length;k+=9){if(Math.hypot(data[k]-cx,data[k+2]-cz)>reach)continue;n++;
   for(const j of[0,1,2]){lo[j]=Math.min(lo[j],data[k+j]);hi[j]=Math.max(hi[j],data[k+j]);}}
  return n?{w:Math.max(hi[0]-lo[0],hi[2]-lo[2]),h:hi[1]-lo[1],n}:null;};
 const big=r.roadNetwork.ports.slice().sort((a,b)=>b.weight-a.weight)[0];
 const seat=r.coord(big.x,big.y,0),quay=extent(meshes.ports.data,seat[0],seat[2],3);
 assert(quay,'the largest port should build something');
 assert(quay.w/town<.30,`the port symbol spans ${(quay.w/town*100).toFixed(0)}% of a town`);
 assert(quay.h/town<.12,`its mast stands ${(quay.h/town*100).toFixed(0)}% of a town's width`);
 // It hands over to the town's own quays and jetties, at the same TOWN_ZOOM the city
 // layer uses, so a renderer with no city layer tells the same story.
 r.zoom=2;assert(r.visible('ports'),'the symbol belongs on the regional map');
 r.zoom=E.AtlasSpace.TOWN_ZOOM;assert(!r.visible('ports'),'and must be gone once the real harbour is drawn');
 r.zoom=6;
 // A hull and a cart reach vehicle() with the same size; their factors have to agree.
 r.buildFolk(0);
 const boats=E.Folk.travellers(r.roadNetwork,s,{density:1}).filter(a=>a.kind==='boat');
 assert(boats.length>4,'this world sails');
 let seen=null;
 for(const a of boats){const q=E.Folk.travellerAt(a,0),at=r.coord(q.x,q.y,r.ground(q.x,q.y));
  const m=extent(meshes.caravans.data,at[0],at[2],.9);if(m&&(!seen||m.n>seen.n))seen=m;}
 assert(seen,'a boat should be on screen at regional zoom');
 assert(seen.w/town<.16,`one ship spans ${(seen.w/town*100).toFixed(0)}% of a town`);
 assert(seen.h/town<.10,`one ship stands ${(seen.h/town*100).toFixed(0)}% of a town's width`);
 report.checks.symbolScale={townWidth:+town.toFixed(2),
  portWidth:+quay.w.toFixed(2),portHeight:+quay.h.toFixed(2),shipWidth:+seen.w.toFixed(2),shipHeight:+seen.h.toFixed(2)};
});
test.after(()=>writeFileSync(resolve(root,'docs/ROAD_NETWORK_RESULTS.json'),JSON.stringify(report,null,2)));