import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root} from './engine-loader.mjs';
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const {FortressPlan,ArtisanCityKit}=Function(code+'\nreturn {FortressPlan,ArtisanCityKit};')();
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
