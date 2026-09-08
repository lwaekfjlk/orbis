import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root,defaults} from './engine-loader.mjs';
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const {FortressPlan,ArtisanCityKit,generateWorld,createCivilization,generateCity,auditCity,citySegmentBox}=Function(code+'\nreturn {FortressPlan,ArtisanCityKit,generateWorld,createCivilization,generateCity,auditCity,citySegmentBox};')();
const key=q=>`${q.x.toFixed(7)},${q.z.toFixed(7)},${q.y.toFixed(7)}`;
function fixture({slope=0,water=false,roads=[]}={}){
 const n=101,c={n,width:100,depth:100,townProfile:{id:'river',palace:'gilded-palace',width:1},townRecipe:{seed:'wall-regression'},market:{x:0,z:0},buildings:[],roads,road:new Uint8Array(n*n),height:new Float64Array(n*n),water:new Uint8Array(n*n),atlasSlope:new Float32Array(n*n).fill(slope),environment:{ice:new Uint8Array(n*n)}};
 c.xy=k=>({x:k%n-50,z:Math.floor(k/n)-50});c.index=(x,z)=>Math.round(Math.max(0,Math.min(100,z+50)))*n+Math.round(Math.max(0,Math.min(100,x+50)));
 for(let i=0;i<n*n;i++){const q=c.xy(i);c.height[i]=3+slope*q.x*.7+slope*q.z*.3;if(water&&q.x>18)c.water[i]=1;}
 for(const x of[-15,-5,5,15])for(const z of[-10,0,10])c.buildings.push({x,z,w:4,d:4});
 return c;
}
function closed(d){
 const segments=[...d.walls,...d.quays,...d.gates],starts=new Map();
 assert(segments.length>20);assert.equal(d.enclosed,true);assert.equal(d.terrainGapSegments,0);assert.equal(d.scarpSegments,0);
 for(const s of segments){assert(!starts.has(key(s.a)),'two sections start at the same endpoint');starts.set(key(s.a),s);}
 const visited=new Set();let s=segments[0];
 while(s&&!visited.has(s)){visited.add(s);s=starts.get(key(s.b));}
 assert.equal(s,segments[0],'the ring has an unmatched endpoint');assert.equal(visited.size,segments.length,'defenses contain disconnected circuits');
}
const arterial=points=>({kind:'arterial',nodes:[],points:points.map(([x,z])=>({x,z,y:3}))});
test('citadel reserves reject unsupported parcels before roads commit to them',()=>{
 const c=fixture();c.slope=new Float32Array(c.n*c.n);c.environment.snow=new Float32Array(c.n*c.n);
 const candidates=[{k:c.index(20,0)}],p={detailSupport:2000};
 const site=FortressPlan.reserve(c,candidates,p,.85,{scale:1,bounds:(x,z,w)=>({low:0,top:w>18?30:0})});
 assert(site);assert.equal(site.w,18,'reserve must select a supported smaller parcel');
 const steep=fixture();steep.slope=c.slope;steep.environment.snow=c.environment.snow;
 assert.equal(FortressPlan.reserve(steep,candidates,p,.85,{scale:1,bounds:()=>({low:0,top:99})}),null);
 assert.equal(steep.citadelReserve,undefined,'an unbuildable citadel must not leave a protected hole in the town');
});
test('steep terrain and waterfronts retain one physically closed circuit',()=>{
 for(const slope of[0,.7,2])for(const water of[false,true]){
  const c=fixture({slope,water,roads:[arterial([[0,0],[0,30]])]}),d=FortressPlan.build(c);closed(d);
  assert.equal(d.gates.length,1);if(water)assert(d.quays.length>0);
  for(const s of [...d.walls,...d.quays,...d.gates])for(const q of[s.a,s.b])assert(Math.abs(q.y-(3+slope*q.x*.7+slope*q.z*.3))<1e-8,'wall endpoint is snapped above or below the interpolated ground');
 }
});
test('a street beside the wall does not cut a gate; a sparse crossing does',()=>{
 const c=fixture({roads:[arterial([[-12,13.5],[12,13.5]]),arterial([[0,0],[30,0]])]}),d=FortressPlan.build(c);closed(d);
 assert.equal(d.gates.length,1);const g=d.gates[0];assert(g.a.x>19&&g.b.x>19);assert(g.a.z*g.b.z<=0,'the gateway must span the road crossing');
});
test('a road with sparse outside endpoints receives both boundary portals',()=>{
 const c=fixture({roads:[arterial([[-30,0],[30,0]])]}),d=FortressPlan.build(c);closed(d);assert.equal(d.gates.length,2);
});
test('gates crossing the perimeter array seam remain a single joined opening',()=>{
 const c=fixture({roads:[arterial([[0,0],[-30,-22]])]}),d=FortressPlan.build(c);closed(d);assert.equal(d.gates.length,1);
});
test('curtain and quay mesh foundations follow their full terrain footprint',()=>{
 for(const kind of['stone','timber'])for(const water of[false,true]){
  const c=fixture({slope:1.2}),height=water?2.3:3.5,segment={a:{x:-5,z:0,y:-1.2},b:{x:5,z:0,y:7.2},height,width:water?1.15:.85};
  c.defenses={kind,walls:water?[]:[segment],quays:water?[segment]:[],gates:[],towers:[]};
  const m=ArtisanCityKit.fortificationMeshes(c,{fresh:.4}),offsets=[];
  for(let i=0;i<m.body.data.length;i+=9){const[x,y,z]=m.body.data.slice(i,i+3);assert(Number.isFinite(x+y+z));offsets.push(y-(3+1.2*x*.7+1.2*z*.3));}
  assert(offsets.length>30);assert(Math.min(...offsets)>=-(water?.55:.3)-1e-6,'masonry hangs below its terrain footing');assert(Math.max(...offsets)<height+1.1,'slope adds an artificial tower-height curtain');
 }
});
test('gateway feet reach the terrain on both sides of a steep road',()=>{
 const c=fixture({slope:1.2});c.defenses={kind:'stone',walls:[],quays:[],towers:[],gates:[{a:{x:-5,z:0,y:-1.2},b:{x:5,z:0,y:7.2}}]};
 const m=ArtisanCityKit.fortificationMeshes(c,{fresh:.4}),feet=[Infinity,Infinity];
 for(let i=0;i<m.body.data.length;i+=9){const[x,y,z]=m.body.data.slice(i,i+3);if(Math.abs(x)>4&&Math.abs(x)<5&&Math.abs(z)<.8)feet[x<0?0:1]=Math.min(feet[x<0?0:1],y-(3+1.2*x*.7+1.2*z*.3));}
 for(const offset of feet)assert(offset<.05&&offset>-.5,'a gateway leg floats above the roadway');
});

test('Scorchspire keeps a genuine gate lane without removing or crossing any buildings',async()=>{
 const w=await generateWorld(defaults),s=createCivilization(w,{realms:18,historySeed:'First-dawn'}),build=FortressPlan.build;let snapshot;
 FortressPlan.build=c=>{snapshot=structuredClone(c.buildings);return build(c);};
 let c;try{c=generateCity(w,s,349);}finally{FortressPlan.build=build;}
 assert.equal(c.name,'Scorchspire');assert.deepEqual(c.buildings,snapshot,'recovering a lane must preserve the generated buildings');
 const d=c.defenses,approach=c.roads.find(r=>r.role==='gate-approach');assert(approach,'the city must retain an outward street approach');closed(d);assert(d.gates.length>0);
 const outside=q=>d.perimeter.some((a,j)=>{const b=d.perimeter[(j+1)%d.perimeter.length];return(b.x-a.x)*(q.z-a.z)-(b.z-a.z)*(q.x-a.x)<-1e-7;});
 assert(!outside(approach.points[0]));assert(outside(approach.points.at(-1)));
 const last=approach.points.at(-1),socket=c.xy(c.index(last.x,last.z));assert(Math.hypot(last.x-socket.x,last.z-socket.z)<1e-9,'outside endpoint must join the intercity grid exactly');
 const half=(c.townProfile.width||1)*.67;
 for(let k=1;k<approach.points.length;k++){
  const a=approach.points[k-1],b=approach.points[k];for(const house of c.buildings)assert(!citySegmentBox(a,b,house.x-house.w/2-half,house.z-house.d/2-half,house.x+house.w/2+half,house.z+house.d/2+half),house.id+' intersects the gate lane');
  for(const x of[-half,0,half])for(const z of[-half,0,half]){const i=c.index(b.x+x,b.z+z);assert.equal(c.water[i],0);assert(c.environment.ice[i]<25);assert(c.atlasSlope[i]<=c.streetGradeCap);}
 }
 const edges=new Map();for(const road of c.roads)for(let k=1;k<road.nodes.length;k++){const a=road.nodes[k-1],b=road.nodes[k];if(!edges.has(a))edges.set(a,new Set());if(!edges.has(b))edges.set(b,new Set());edges.get(a).add(b);edges.get(b).add(a);}
 const queue=[c.marketIndex],seen=new Set(queue);for(const a of queue)for(const b of edges.get(a)||[])if(!seen.has(b)){seen.add(b);queue.push(b);}
 for(const b of c.buildings)assert(seen.has(b.streetSocket),b.id+' lost street access');assert(seen.has(approach.nodes.at(-1)));assert.equal(c.connectors.length,c.buildings.length);
 const audit=auditCity(c);for(const k of['wetBuildings','roadBuildings','overlaps','nonfinite','seaRoads'])assert.equal(audit[k],0,k);
});


test('a real lane hidden by coarse occupancy is recovered without moving its houses',()=>{
 // Four-unit survey cells round both sides of this 2.8-unit lane into its
 // center cell. The two-unit approach mesh must find the actual clear space.
 const n=31,c={n,width:120,depth:120,townProfile:{id:'river',palace:'gilded-palace',width:1},townRecipe:{seed:'lane-regression'},market:{x:0,z:0},streetGradeCap:1.2,buildings:[],roads:[],road:new Uint8Array(n*n),height:new Float64Array(n*n).fill(3),water:new Uint8Array(n*n),waterKind:new Uint8Array(n*n),atlasSlope:new Float32Array(n*n),environment:{ice:new Uint8Array(n*n),snow:new Float32Array(n*n)}};
 c.xy=k=>({x:(k%n-15)*4,z:(Math.floor(k/n)-15)*4});c.index=(x,z)=>Math.round(Math.max(0,Math.min(30,z/4+15)))*n+Math.round(Math.max(0,Math.min(30,x/4+15)));c.marketIndex=c.index(0,0);
 for(const z of[-5.2,5.2])c.buildings.push({x:12,z,w:4,d:7.6});
 for(const z of[-6,0,6])c.buildings.push({x:-12,z,w:4,d:6});
 for(const z of[-12,12])for(const x of[-9,-3,3,9])c.buildings.push({x,z,w:6,d:4});
 c.buildings.forEach((b,i)=>Object.assign(b,{id:'b'+i,y:3,h:3,type:'home'}));
 const nodes=[-4,0,4].map(x=>c.index(x,0));nodes.forEach(k=>c.road[k]=1);c.roads=[{kind:'street',nodes,points:nodes.map(k=>({...c.xy(k),y:3}))}];
 const snapshot=structuredClone(c.buildings),d=FortressPlan.build(c),approach=c.roads.find(r=>r.refined);
 assert(approach,'coarse occupancy must not seal a physically open lane');assert.equal(d.refinedApproachCount,1);assert.equal(d.gates.length,1);closed(d);assert.deepEqual(c.buildings,snapshot);
 const half=c.townProfile.width*.67;
 for(let k=1;k<approach.points.length;k++){
  const a=approach.points[k-1],b=approach.points[k];
  for(const house of c.buildings)assert(!citySegmentBox(a,b,house.x-house.w/2-half,house.z-house.d/2-half,house.x+house.w/2+half,house.z+house.d/2+half),house.id+' intersects the recovered lane');
 }
 assert(approach.points.at(-1).x>23,'the recovered lane must finish beyond the wall on a parent-grid socket');
 const audit=auditCity(c);for(const k of['wetBuildings','roadBuildings','overlaps','nonfinite','seaRoads'])assert.equal(audit[k],0,k);
});
